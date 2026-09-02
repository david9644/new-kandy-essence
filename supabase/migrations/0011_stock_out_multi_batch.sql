-- New Kandy Essence: automatic multi-batch FEFO stock-out
-- Store Keepers no longer pick a batch for Stock-Out -- create_stock_out now
-- walks the item's batches in the same FEFO order used everywhere else
-- (lib/stock/fefo.ts's sortBatchesFefo, the stock_batches_fefo_idx partial
-- index), deducting across as many batches as the requested quantity needs.
-- stock_out_batches records exactly which batches were drawn from and how
-- much, since stock_out itself can no longer point at a single batch.

-- ── Audit trail table ────────────────────────────────────────────────────

create table stock_out_batches (
  id uuid primary key default gen_random_uuid(),
  stock_out_id uuid not null references stock_out(id) on delete cascade,
  stock_batch_id uuid not null references stock_batches(id),
  quantity_deducted numeric not null check (quantity_deducted > 0),
  created_at timestamptz not null default now(),
  unique (stock_out_id, stock_batch_id)
);

create index stock_out_batches_stock_out_idx on stock_out_batches (stock_out_id);
create index stock_out_batches_stock_batch_idx on stock_out_batches (stock_batch_id);

alter table stock_out_batches enable row level security;
create policy stock_out_batches_select on stock_out_batches for select to authenticated using (true);
-- no insert/update/delete policy: written only by create_stock_out below

-- ── Backfill existing stock_out rows before dropping their batch pointer ──

insert into stock_out_batches (stock_out_id, stock_batch_id, quantity_deducted)
select id, stock_batch_id, base_quantity from stock_out;

drop index if exists stock_out_stock_batch_idx;
alter table stock_out drop column stock_batch_id;

-- ── Replace create_stock_out: automatic FEFO walk across batches ─────────
-- No pre-check against available quantity: the client shows the "only X
-- left" warning and this RPC trusts that confirmation, per the spec's warn-
-- don't-block rule. When requested quantity exceeds total stock, every
-- batch is drained to zero and the leftover shortfall lands on the last
-- batch in FEFO order (letting it go negative) -- same overall behavior as
-- the old single-batch version, just spread correctly across however many
-- batches the quantity actually spans.

drop function if exists create_stock_out(uuid, uuid, numeric, text, date);

create or replace function create_stock_out(
  p_item_id uuid,
  p_quantity numeric,
  p_unit_name text,
  p_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item items%rowtype;
  v_factor numeric;
  v_base_qty numeric;
  v_out_id uuid;
  v_remaining numeric;
  v_batch record;
  v_take numeric;
  v_last_batch_id uuid;
begin
  perform current_role_or_raise();

  select * into v_item from items where id = p_item_id;
  if v_item.id is null then
    raise exception 'item not found';
  end if;

  if p_unit_name = v_item.base_unit then
    v_factor := 1;
  else
    select conversion_factor_to_base into v_factor
    from item_units where item_id = v_item.id and unit_name = p_unit_name;
    if v_factor is null then
      raise exception 'unknown unit % for item %', p_unit_name, v_item.name;
    end if;
  end if;

  v_base_qty := p_quantity * v_factor;

  insert into stock_out (item_id, quantity, unit_name, conversion_factor, base_quantity, date, created_by)
  values (p_item_id, p_quantity, p_unit_name, v_factor, v_base_qty, p_date, auth.uid())
  returning id into v_out_id;

  v_remaining := v_base_qty;

  -- Lock every batch for this item up front so a concurrent stock-out/
  -- adjustment on the same item can't act on a quantity_remaining this walk
  -- is mid-way through changing; released automatically when the RPC's
  -- transaction ends. Walking every row through to the end -- not just
  -- quantity_remaining > 0 ones, and never exiting early once demand is
  -- met -- means v_last_batch_id always ends up pointing at the true last
  -- batch in FEFO order, ready for the shortfall branch below.
  for v_batch in
    select id, quantity_remaining
    from stock_batches
    where item_id = p_item_id
    order by expiry_date nulls last, created_at
    for update
  loop
    if v_remaining > 0 and v_batch.quantity_remaining > 0 then
      v_take := least(v_batch.quantity_remaining, v_remaining);

      update stock_batches set quantity_remaining = quantity_remaining - v_take where id = v_batch.id;

      insert into stock_out_batches (stock_out_id, stock_batch_id, quantity_deducted)
      values (v_out_id, v_batch.id, v_take)
      on conflict (stock_out_id, stock_batch_id)
      do update set quantity_deducted = stock_out_batches.quantity_deducted + excluded.quantity_deducted;

      v_remaining := v_remaining - v_take;
    end if;

    v_last_batch_id := v_batch.id;
  end loop;

  if v_remaining > 0 then
    if v_last_batch_id is null then
      raise exception 'no stock exists yet for item %', v_item.name;
    end if;

    update stock_batches set quantity_remaining = quantity_remaining - v_remaining where id = v_last_batch_id;

    insert into stock_out_batches (stock_out_id, stock_batch_id, quantity_deducted)
    values (v_out_id, v_last_batch_id, v_remaining)
    on conflict (stock_out_id, stock_batch_id)
    do update set quantity_deducted = stock_out_batches.quantity_deducted + excluded.quantity_deducted;
  end if;

  return v_out_id;
end;
$$;

revoke all on function create_stock_out(uuid, numeric, text, date) from public;
grant execute on function create_stock_out(uuid, numeric, text, date) to authenticated;
revoke execute on function create_stock_out(uuid, numeric, text, date) from anon;
