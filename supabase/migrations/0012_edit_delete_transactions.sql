-- New Kandy Essence: owner-only edit/delete for supplier payments, stock-out,
-- opening stock, and stock adjustments. Items, suppliers, and purchases
-- already had this; these four only ever supported create.
--
-- Every one of these reverses its old effect on stock_batches/cheques before
-- applying the new one (or just reverses, on delete) -- never a blind
-- overwrite. Where reversing could plausibly drive quantity_remaining
-- negative because something else already consumed part of it (a later
-- Stock-Out drew from a batch this opening-stock entry or adjustment fed),
-- the function raises instead of silently going negative.

-- ── Stock-out: shared FEFO walk + reversal helpers ──────────────────────
-- Extracted out of create_stock_out (0011) so update_stock_out can run the
-- exact same walk after reversing the old deduction, instead of
-- reimplementing it.

create or replace function stock_out_apply_fefo(p_item_id uuid, p_stock_out_id uuid, p_base_qty numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining numeric;
  v_batch record;
  v_take numeric;
  v_last_batch_id uuid;
begin
  v_remaining := p_base_qty;

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
      values (p_stock_out_id, v_batch.id, v_take)
      on conflict (stock_out_id, stock_batch_id)
      do update set quantity_deducted = stock_out_batches.quantity_deducted + excluded.quantity_deducted;

      v_remaining := v_remaining - v_take;
    end if;

    v_last_batch_id := v_batch.id;
  end loop;

  if v_remaining > 0 then
    if v_last_batch_id is null then
      raise exception 'no stock exists yet for this item';
    end if;

    update stock_batches set quantity_remaining = quantity_remaining - v_remaining where id = v_last_batch_id;

    insert into stock_out_batches (stock_out_id, stock_batch_id, quantity_deducted)
    values (p_stock_out_id, v_last_batch_id, v_remaining)
    on conflict (stock_out_id, stock_batch_id)
    do update set quantity_deducted = stock_out_batches.quantity_deducted + excluded.quantity_deducted;
  end if;
end;
$$;

revoke all on function stock_out_apply_fefo(uuid, uuid, numeric) from public;
grant execute on function stock_out_apply_fefo(uuid, uuid, numeric) to authenticated;
revoke execute on function stock_out_apply_fefo(uuid, uuid, numeric) from anon;

-- Adds every stock_out_batches deduction for a stock-out back onto its
-- batch, then clears the audit rows. Plain relative updates, so this is
-- safe under concurrent activity without extra locking -- unlike the FEFO
-- walk, there's no "how much can I take" decision being made here.
create or replace function stock_out_reverse(p_stock_out_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  for v_row in
    select stock_batch_id, quantity_deducted from stock_out_batches where stock_out_id = p_stock_out_id
  loop
    update stock_batches
    set quantity_remaining = quantity_remaining + v_row.quantity_deducted
    where id = v_row.stock_batch_id;
  end loop;

  delete from stock_out_batches where stock_out_id = p_stock_out_id;
end;
$$;

revoke all on function stock_out_reverse(uuid) from public;
grant execute on function stock_out_reverse(uuid) to authenticated;
revoke execute on function stock_out_reverse(uuid) from anon;

-- create_stock_out itself now just inserts the header and delegates the
-- walk -- same signature and behavior as 0011, body only.
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

  perform stock_out_apply_fefo(p_item_id, v_out_id, v_base_qty);

  return v_out_id;
end;
$$;

-- ── Stock-out: owner-only edit/delete ─────────────────────────────────────
-- The item a stock-out was recorded against can't be changed here, only
-- quantity/unit/date -- same "header fields only" spirit as purchase editing.

create or replace function update_stock_out(
  p_stock_out_id uuid,
  p_quantity numeric,
  p_unit_name text,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id uuid;
  v_item items%rowtype;
  v_factor numeric;
  v_base_qty numeric;
begin
  if not is_owner() then
    raise exception 'only owner can edit stock-out entries' using errcode = '42501';
  end if;

  select item_id into v_item_id from stock_out where id = p_stock_out_id;
  if v_item_id is null then
    raise exception 'stock-out entry not found';
  end if;

  select * into v_item from items where id = v_item_id;

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

  perform stock_out_reverse(p_stock_out_id);

  update stock_out
  set quantity = p_quantity,
      unit_name = p_unit_name,
      conversion_factor = v_factor,
      base_quantity = v_base_qty,
      date = p_date
  where id = p_stock_out_id;

  perform stock_out_apply_fefo(v_item_id, p_stock_out_id, v_base_qty);
end;
$$;

create or replace function delete_stock_out(p_stock_out_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_owner() then
    raise exception 'only owner can delete stock-out entries' using errcode = '42501';
  end if;

  if not exists (select 1 from stock_out where id = p_stock_out_id) then
    raise exception 'stock-out entry not found';
  end if;

  perform stock_out_reverse(p_stock_out_id);
  delete from stock_out where id = p_stock_out_id;
end;
$$;

-- ── Opening stock: owner-only edit/delete ─────────────────────────────────
-- Each opening-stock entry owns exactly one stock_batches row it created.
-- Reversing means removing base_quantity back out of that batch -- blocked
-- if a later Stock-Out has already drawn the batch below that amount.

create or replace function update_opening_stock(
  p_entry_id uuid,
  p_batch_number text,
  p_expiry_date date,
  p_quantity numeric,
  p_unit_name text,
  p_cost_price numeric,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry opening_stock_entries%rowtype;
  v_item items%rowtype;
  v_batch stock_batches%rowtype;
  v_factor numeric;
  v_new_base_qty numeric;
  v_new_base_cost numeric;
begin
  if not is_owner() then
    raise exception 'only owner can edit opening stock entries' using errcode = '42501';
  end if;

  select * into v_entry from opening_stock_entries where id = p_entry_id;
  if v_entry.id is null then
    raise exception 'opening stock entry not found';
  end if;

  select * into v_item from items where id = v_entry.item_id;

  if v_item.batch_tracked and p_expiry_date is null then
    raise exception 'expiry date is required for batch-tracked item %', v_item.name;
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

  v_new_base_qty := p_quantity * v_factor;
  v_new_base_cost := p_cost_price / v_factor;

  select * into v_batch from stock_batches where id = v_entry.stock_batch_id for update;

  if v_batch.quantity_remaining < v_entry.base_quantity then
    raise exception 'cannot edit: some of this opening stock has already been used elsewhere';
  end if;

  update stock_batches
  set quantity_remaining = quantity_remaining - v_entry.base_quantity + v_new_base_qty,
      unit_cost = v_new_base_cost,
      batch_number = nullif(p_batch_number, ''),
      expiry_date = p_expiry_date
  where id = v_entry.stock_batch_id;

  update opening_stock_entries
  set batch_number = nullif(p_batch_number, ''),
      expiry_date = p_expiry_date,
      quantity = p_quantity,
      unit_name = p_unit_name,
      conversion_factor = v_factor,
      base_quantity = v_new_base_qty,
      cost_price = p_cost_price,
      notes = p_notes
  where id = p_entry_id;
end;
$$;

create or replace function delete_opening_stock(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry opening_stock_entries%rowtype;
  v_batch stock_batches%rowtype;
begin
  if not is_owner() then
    raise exception 'only owner can delete opening stock entries' using errcode = '42501';
  end if;

  select * into v_entry from opening_stock_entries where id = p_entry_id;
  if v_entry.id is null then
    raise exception 'opening stock entry not found';
  end if;

  select * into v_batch from stock_batches where id = v_entry.stock_batch_id for update;

  if v_batch.quantity_remaining < v_entry.base_quantity then
    raise exception 'cannot delete: some of this opening stock has already been used elsewhere';
  end if;

  delete from opening_stock_entries where id = p_entry_id;

  -- Only drop the batch row itself if nothing else's audit trail still
  -- points at it; otherwise just take the opening-stock contribution back
  -- out of its running total.
  if exists (select 1 from stock_out_batches where stock_batch_id = v_entry.stock_batch_id)
     or exists (select 1 from stock_adjustments where stock_batch_id = v_entry.stock_batch_id) then
    update stock_batches
    set quantity_remaining = quantity_remaining - v_entry.base_quantity
    where id = v_entry.stock_batch_id;
  else
    delete from stock_batches where id = v_entry.stock_batch_id;
  end if;
end;
$$;

-- ── Stock adjustments: owner-only edit/delete ─────────────────────────────

create or replace function update_stock_adjustment(
  p_adjustment_id uuid,
  p_quantity_change numeric,
  p_reason text,
  p_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adj stock_adjustments%rowtype;
  v_batch stock_batches%rowtype;
begin
  if not is_owner() then
    raise exception 'only owner can edit stock adjustments' using errcode = '42501';
  end if;

  if p_quantity_change = 0 then
    raise exception 'quantity change cannot be zero';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required';
  end if;

  select * into v_adj from stock_adjustments where id = p_adjustment_id;
  if v_adj.id is null then
    raise exception 'stock adjustment not found';
  end if;

  select * into v_batch from stock_batches where id = v_adj.stock_batch_id for update;

  if (v_batch.quantity_remaining - v_adj.quantity_change) < 0 then
    raise exception 'cannot edit: stock from this adjustment has already been used elsewhere';
  end if;

  update stock_batches
  set quantity_remaining = quantity_remaining - v_adj.quantity_change + p_quantity_change
  where id = v_adj.stock_batch_id;

  update stock_adjustments
  set quantity_change = p_quantity_change, reason = p_reason, date = p_date
  where id = p_adjustment_id;
end;
$$;

create or replace function delete_stock_adjustment(p_adjustment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adj stock_adjustments%rowtype;
  v_batch stock_batches%rowtype;
begin
  if not is_owner() then
    raise exception 'only owner can delete stock adjustments' using errcode = '42501';
  end if;

  select * into v_adj from stock_adjustments where id = p_adjustment_id;
  if v_adj.id is null then
    raise exception 'stock adjustment not found';
  end if;

  select * into v_batch from stock_batches where id = v_adj.stock_batch_id for update;

  if (v_batch.quantity_remaining - v_adj.quantity_change) < 0 then
    raise exception 'cannot delete: stock from this adjustment has already been used elsewhere';
  end if;

  update stock_batches
  set quantity_remaining = quantity_remaining - v_adj.quantity_change
  where id = v_adj.stock_batch_id;

  delete from stock_adjustments where id = p_adjustment_id;
end;
$$;

-- ── Supplier payments: owner-only edit/delete ─────────────────────────────
-- Nothing needs to "reverse" the balance impact directly -- get_supplier_balance(s)
-- computes it live off current rows, so deleting/updating the payment row is
-- itself the full reversal. What does need explicit handling is the linked
-- cheque, since it only exists because this payment created it.

create or replace function update_supplier_payment(
  p_payment_id uuid,
  p_date date,
  p_amount numeric,
  p_payment_type payment_method,
  p_cheque jsonb,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment supplier_payments%rowtype;
  v_cheque_id uuid;
begin
  if not is_owner() then
    raise exception 'only owner can edit supplier payments' using errcode = '42501';
  end if;

  select * into v_payment from supplier_payments where id = p_payment_id;
  if v_payment.id is null then
    raise exception 'payment not found';
  end if;

  v_cheque_id := v_payment.cheque_id;

  if p_payment_type = 'cheque' then
    if p_cheque is null then
      raise exception 'cheque details required for cheque payment type';
    end if;

    if v_cheque_id is null then
      insert into cheques (supplier_id, bank_account_id, cheque_number, cheque_date, amount, status, source)
      values (
        v_payment.supplier_id,
        (p_cheque->>'bank_account_id')::uuid,
        p_cheque->>'cheque_number',
        (p_cheque->>'cheque_date')::date,
        (p_cheque->>'amount')::numeric,
        'pending',
        'payment'
      )
      returning id into v_cheque_id;
    else
      update cheques
      set bank_account_id = (p_cheque->>'bank_account_id')::uuid,
          cheque_number = p_cheque->>'cheque_number',
          cheque_date = (p_cheque->>'cheque_date')::date,
          amount = (p_cheque->>'amount')::numeric
      where id = v_cheque_id;
    end if;
  else
    if v_cheque_id is not null then
      delete from cheques where id = v_cheque_id;
      v_cheque_id := null;
    end if;
  end if;

  update supplier_payments
  set date = p_date,
      amount = p_amount,
      payment_type = p_payment_type,
      cheque_id = v_cheque_id,
      notes = p_notes
  where id = p_payment_id;
end;
$$;

create or replace function delete_supplier_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cheque_id uuid;
begin
  if not is_owner() then
    raise exception 'only owner can delete supplier payments' using errcode = '42501';
  end if;

  select cheque_id into v_cheque_id from supplier_payments where id = p_payment_id;
  if not found then
    raise exception 'payment not found';
  end if;

  delete from supplier_payments where id = p_payment_id;

  if v_cheque_id is not null then
    delete from cheques where id = v_cheque_id;
  end if;
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────

revoke all on function update_stock_out(uuid, numeric, text, date) from public;
revoke all on function delete_stock_out(uuid) from public;
revoke all on function update_opening_stock(uuid, text, date, numeric, text, numeric, text) from public;
revoke all on function delete_opening_stock(uuid) from public;
revoke all on function update_stock_adjustment(uuid, numeric, text, date) from public;
revoke all on function delete_stock_adjustment(uuid) from public;
revoke all on function update_supplier_payment(uuid, date, numeric, payment_method, jsonb, text) from public;
revoke all on function delete_supplier_payment(uuid) from public;

grant execute on function update_stock_out(uuid, numeric, text, date) to authenticated;
grant execute on function delete_stock_out(uuid) to authenticated;
grant execute on function update_opening_stock(uuid, text, date, numeric, text, numeric, text) to authenticated;
grant execute on function delete_opening_stock(uuid) to authenticated;
grant execute on function update_stock_adjustment(uuid, numeric, text, date) to authenticated;
grant execute on function delete_stock_adjustment(uuid) to authenticated;
grant execute on function update_supplier_payment(uuid, date, numeric, payment_method, jsonb, text) to authenticated;
grant execute on function delete_supplier_payment(uuid) to authenticated;

revoke execute on function update_stock_out(uuid, numeric, text, date) from anon;
revoke execute on function delete_stock_out(uuid) from anon;
revoke execute on function update_opening_stock(uuid, text, date, numeric, text, numeric, text) from anon;
revoke execute on function delete_opening_stock(uuid) from anon;
revoke execute on function update_stock_adjustment(uuid, numeric, text, date) from anon;
revoke execute on function delete_stock_adjustment(uuid) from anon;
revoke execute on function update_supplier_payment(uuid, date, numeric, payment_method, jsonb, text) from anon;
revoke execute on function delete_supplier_payment(uuid) from anon;
