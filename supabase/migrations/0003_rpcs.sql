-- New Kandy Essence: transactional RPCs (SECURITY DEFINER)
-- Each function performs its own auth.uid()/role check internally, since
-- SECURITY DEFINER bypasses the caller's RLS by nature. These are the only
-- way the tables they touch are ever written.

-- ── Purchasing ───────────────────────────────────────────────────────────

create or replace function create_purchase(
  p_supplier_id uuid,
  p_date date,
  p_payment_type purchase_payment_type,
  p_reference_no text,
  p_notes text,
  p_cheque jsonb,
  p_line_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_purchase_id uuid;
  v_cheque_id uuid;
  v_total numeric := 0;
  v_line jsonb;
  v_item items%rowtype;
  v_factor numeric;
  v_base_qty numeric;
  v_base_cost numeric;
  v_line_total numeric;
  v_batch_id uuid;
  v_unit_name text;
begin
  perform current_role_or_raise();

  if p_line_items is null or jsonb_array_length(p_line_items) = 0 then
    raise exception 'purchase must have at least one line item';
  end if;

  if p_payment_type = 'cheque' then
    if p_cheque is null then
      raise exception 'cheque details required for cheque payment type';
    end if;
    insert into cheques (supplier_id, bank_account_id, cheque_number, cheque_date, amount, status, source)
    values (
      p_supplier_id,
      (p_cheque->>'bank_account_id')::uuid,
      p_cheque->>'cheque_number',
      (p_cheque->>'cheque_date')::date,
      (p_cheque->>'amount')::numeric,
      'pending',
      'purchase'
    )
    returning id into v_cheque_id;
  end if;

  insert into purchases (supplier_id, date, payment_type, cheque_id, reference_no, notes, total_amount, created_by, updated_by)
  values (p_supplier_id, p_date, p_payment_type, v_cheque_id, p_reference_no, p_notes, 0, auth.uid(), auth.uid())
  returning id into v_purchase_id;

  for v_line in select * from jsonb_array_elements(p_line_items)
  loop
    select * into v_item from items where id = (v_line->>'item_id')::uuid;
    if v_item.id is null then
      raise exception 'item not found: %', v_line->>'item_id';
    end if;

    v_unit_name := v_line->>'unit_name';
    if v_unit_name = v_item.base_unit then
      v_factor := 1;
    else
      select conversion_factor_to_base into v_factor
      from item_units where item_id = v_item.id and unit_name = v_unit_name;
      if v_factor is null then
        raise exception 'unknown unit % for item %', v_unit_name, v_item.name;
      end if;
    end if;

    if v_item.batch_tracked and (v_line->>'expiry_date') is null then
      raise exception 'expiry date is required for batch-tracked item %', v_item.name;
    end if;

    v_base_qty := (v_line->>'quantity')::numeric * v_factor;
    v_base_cost := (v_line->>'unit_cost')::numeric / v_factor;
    v_line_total := (v_line->>'quantity')::numeric * (v_line->>'unit_cost')::numeric;

    insert into stock_batches (item_id, batch_number, expiry_date, quantity_remaining, unit_cost)
    values (v_item.id, nullif(v_line->>'batch_number', ''), (v_line->>'expiry_date')::date, v_base_qty, v_base_cost)
    returning id into v_batch_id;

    insert into purchase_items (
      purchase_id, item_id, batch_number, expiry_date, quantity, unit_name,
      conversion_factor, base_quantity, unit_cost, line_total, stock_batch_id
    ) values (
      v_purchase_id, v_item.id, nullif(v_line->>'batch_number', ''), (v_line->>'expiry_date')::date,
      (v_line->>'quantity')::numeric, v_unit_name, v_factor, v_base_qty,
      (v_line->>'unit_cost')::numeric, v_line_total, v_batch_id
    );

    update items set last_purchase_cost = v_base_cost, updated_at = now(), updated_by = auth.uid()
    where id = v_item.id;

    v_total := v_total + v_line_total;
  end loop;

  update purchases set total_amount = v_total where id = v_purchase_id;

  return v_purchase_id;
end;
$$;

create or replace function update_purchase_header(
  p_purchase_id uuid,
  p_date date,
  p_reference_no text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role;
  v_purchase_date date;
begin
  v_role := current_role_or_raise();

  select date into v_purchase_date from purchases where id = p_purchase_id;
  if v_purchase_date is null then
    raise exception 'purchase not found';
  end if;

  if v_role <> 'owner' and v_purchase_date <> (now() at time zone 'Asia/Colombo')::date then
    raise exception 'store keepers may only edit purchases from the same day' using errcode = '42501';
  end if;

  update purchases
  set date = p_date, reference_no = p_reference_no, notes = p_notes,
      updated_by = auth.uid(), updated_at = now()
  where id = p_purchase_id;
end;
$$;

create or replace function delete_purchase(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consumed boolean;
  v_cheque_id uuid;
  v_batch_ids uuid[];
begin
  if not is_owner() then
    raise exception 'only owner can delete purchases' using errcode = '42501';
  end if;

  select array_agg(stock_batch_id) into v_batch_ids
  from purchase_items where purchase_id = p_purchase_id;

  if v_batch_ids is null then
    raise exception 'purchase not found';
  end if;

  select exists (
    select 1
    from purchase_items pi
    join stock_batches sb on sb.id = pi.stock_batch_id
    where pi.purchase_id = p_purchase_id
      and sb.quantity_remaining < pi.base_quantity
  ) into v_consumed;

  if v_consumed then
    raise exception 'cannot delete: stock from this purchase has already been used';
  end if;

  select cheque_id into v_cheque_id from purchases where id = p_purchase_id;

  if v_cheque_id is not null and exists (select 1 from supplier_payments where cheque_id = v_cheque_id) then
    raise exception 'cannot delete: cheque is referenced by a supplier payment';
  end if;

  delete from purchases where id = p_purchase_id;
  delete from stock_batches where id = any(v_batch_ids);

  if v_cheque_id is not null then
    delete from cheques where id = v_cheque_id;
  end if;
end;
$$;

-- ── Opening stock ────────────────────────────────────────────────────────

create or replace function create_opening_stock(
  p_item_id uuid,
  p_batch_number text,
  p_expiry_date date,
  p_quantity numeric,
  p_unit_name text,
  p_cost_price numeric,
  p_notes text
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
  v_base_cost numeric;
  v_batch_id uuid;
  v_entry_id uuid;
begin
  if not is_owner() then
    raise exception 'only owner can enter opening stock' using errcode = '42501';
  end if;

  select * into v_item from items where id = p_item_id;
  if v_item.id is null then
    raise exception 'item not found';
  end if;

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

  v_base_qty := p_quantity * v_factor;
  v_base_cost := p_cost_price / v_factor;

  insert into stock_batches (item_id, batch_number, expiry_date, quantity_remaining, unit_cost)
  values (v_item.id, nullif(p_batch_number, ''), p_expiry_date, v_base_qty, v_base_cost)
  returning id into v_batch_id;

  insert into opening_stock_entries (
    item_id, batch_number, expiry_date, quantity, unit_name, conversion_factor,
    base_quantity, cost_price, stock_batch_id, notes, created_by
  ) values (
    v_item.id, nullif(p_batch_number, ''), p_expiry_date, p_quantity, p_unit_name, v_factor,
    v_base_qty, p_cost_price, v_batch_id, p_notes, auth.uid()
  )
  returning id into v_entry_id;

  if v_item.last_purchase_cost is null then
    update items set last_purchase_cost = v_base_cost, updated_at = now(), updated_by = auth.uid()
    where id = v_item.id;
  end if;

  return v_entry_id;
end;
$$;

-- ── Stock-out ────────────────────────────────────────────────────────────
-- No pre-check against available quantity: the client shows the "only X left"
-- warning and this RPC trusts that confirmation, per the spec's warn-don't-block rule.

create or replace function create_stock_out(
  p_item_id uuid,
  p_stock_batch_id uuid,
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
  v_batch_item_id uuid;
begin
  perform current_role_or_raise();

  select * into v_item from items where id = p_item_id;
  if v_item.id is null then
    raise exception 'item not found';
  end if;

  select item_id into v_batch_item_id from stock_batches where id = p_stock_batch_id;
  if v_batch_item_id is null then
    raise exception 'batch not found';
  end if;
  if v_batch_item_id <> p_item_id then
    raise exception 'batch does not belong to the selected item';
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

  insert into stock_out (item_id, stock_batch_id, quantity, unit_name, conversion_factor, base_quantity, date, created_by)
  values (p_item_id, p_stock_batch_id, p_quantity, p_unit_name, v_factor, v_base_qty, p_date, auth.uid())
  returning id into v_out_id;

  update stock_batches
  set quantity_remaining = quantity_remaining - v_base_qty
  where id = p_stock_batch_id;

  return v_out_id;
end;
$$;

-- ── Stock adjustments ────────────────────────────────────────────────────

create or replace function create_stock_adjustment(
  p_item_id uuid,
  p_stock_batch_id uuid,
  p_quantity_change numeric,
  p_reason text,
  p_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_adj_id uuid;
  v_batch_item_id uuid;
begin
  if not is_owner() then
    raise exception 'only owner can enter stock adjustments' using errcode = '42501';
  end if;

  if p_quantity_change = 0 then
    raise exception 'quantity change cannot be zero';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required';
  end if;

  select item_id into v_batch_item_id from stock_batches where id = p_stock_batch_id;
  if v_batch_item_id is null then
    raise exception 'batch not found';
  end if;
  if v_batch_item_id <> p_item_id then
    raise exception 'batch does not belong to the selected item';
  end if;

  insert into stock_adjustments (item_id, stock_batch_id, quantity_change, reason, date, created_by)
  values (p_item_id, p_stock_batch_id, p_quantity_change, p_reason, p_date, auth.uid())
  returning id into v_adj_id;

  update stock_batches
  set quantity_remaining = quantity_remaining + p_quantity_change
  where id = p_stock_batch_id;

  return v_adj_id;
end;
$$;

-- ── Supplier payments & cheques ──────────────────────────────────────────

create or replace function create_supplier_payment(
  p_supplier_id uuid,
  p_date date,
  p_amount numeric,
  p_payment_type payment_method,
  p_cheque jsonb,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_cheque_id uuid;
begin
  if not is_owner() then
    raise exception 'only owner can record supplier payments' using errcode = '42501';
  end if;

  if p_payment_type = 'cheque' then
    if p_cheque is null then
      raise exception 'cheque details required for cheque payment type';
    end if;
    insert into cheques (supplier_id, bank_account_id, cheque_number, cheque_date, amount, status, source)
    values (
      p_supplier_id,
      (p_cheque->>'bank_account_id')::uuid,
      p_cheque->>'cheque_number',
      (p_cheque->>'cheque_date')::date,
      (p_cheque->>'amount')::numeric,
      'pending',
      'payment'
    )
    returning id into v_cheque_id;
  end if;

  insert into supplier_payments (supplier_id, date, amount, payment_type, cheque_id, notes, created_by)
  values (p_supplier_id, p_date, p_amount, p_payment_type, v_cheque_id, p_notes, auth.uid())
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;

-- A bounced cheque needs no separate reversal transaction: get_supplier_balance(s)
-- excludes bounced-cheque payments from the running total, so flipping status here
-- is enough for the balance to reflect the reversal on next read.
create or replace function update_cheque_status(
  p_cheque_id uuid,
  p_status cheque_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_owner() then
    raise exception 'only owner can update cheque status' using errcode = '42501';
  end if;

  update cheques
  set status = p_status, status_updated_at = now(), status_updated_by = auth.uid()
  where id = p_cheque_id;

  if not found then
    raise exception 'cheque not found';
  end if;
end;
$$;

-- ── Supplier balances / ledger (owner-only reads across mixed-visibility tables) ──

create or replace function get_supplier_balances()
returns table (
  supplier_id uuid,
  code text,
  name text,
  opening_balance numeric,
  current_balance numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not is_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  return query
  select
    s.id,
    s.code,
    s.name,
    coalesce(sf.opening_balance, 0),
    coalesce(sf.opening_balance, 0) + coalesce(pur.total, 0) - coalesce(pay.total, 0)
  from suppliers s
  left join supplier_financials sf on sf.supplier_id = s.id
  left join (
    select supplier_id, sum(total_amount) as total
    from purchases
    where payment_type in ('credit', 'cheque')
    group by supplier_id
  ) pur on pur.supplier_id = s.id
  left join (
    select sp.supplier_id, sum(sp.amount) as total
    from supplier_payments sp
    left join cheques c on c.id = sp.cheque_id
    where sp.payment_type = 'cash' or c.status <> 'bounced'
    group by sp.supplier_id
  ) pay on pay.supplier_id = s.id
  order by s.name;
end;
$$;

create or replace function get_supplier_balance(p_supplier_id uuid)
returns numeric
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_balance numeric;
begin
  if not is_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  select
    coalesce(sf.opening_balance, 0) + coalesce(pur.total, 0) - coalesce(pay.total, 0)
  into v_balance
  from suppliers s
  left join supplier_financials sf on sf.supplier_id = s.id
  left join (
    select supplier_id, sum(total_amount) as total
    from purchases
    where payment_type in ('credit', 'cheque') and supplier_id = p_supplier_id
    group by supplier_id
  ) pur on pur.supplier_id = s.id
  left join (
    select sp.supplier_id, sum(sp.amount) as total
    from supplier_payments sp
    left join cheques c on c.id = sp.cheque_id
    where (sp.payment_type = 'cash' or c.status <> 'bounced') and sp.supplier_id = p_supplier_id
    group by sp.supplier_id
  ) pay on pay.supplier_id = s.id
  where s.id = p_supplier_id;

  return coalesce(v_balance, 0);
end;
$$;

create or replace function get_supplier_ledger(p_supplier_id uuid, p_from date, p_to date)
returns table (
  entry_date date,
  entry_type text,
  reference text,
  debit numeric,
  credit numeric,
  running_balance numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_opening numeric;
  v_prior_purchases numeric;
  v_prior_payments numeric;
  v_opening_running numeric;
begin
  if not is_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  select coalesce(opening_balance, 0) into v_opening
  from supplier_financials where supplier_id = p_supplier_id;
  v_opening := coalesce(v_opening, 0);

  select coalesce(sum(total_amount), 0) into v_prior_purchases
  from purchases
  where supplier_id = p_supplier_id and payment_type in ('credit', 'cheque') and date < p_from;

  select coalesce(sum(sp.amount), 0) into v_prior_payments
  from supplier_payments sp
  left join cheques c on c.id = sp.cheque_id
  where sp.supplier_id = p_supplier_id and (sp.payment_type = 'cash' or c.status <> 'bounced') and sp.date < p_from;

  v_opening_running := v_opening + v_prior_purchases - v_prior_payments;

  return query
  with entries as (
    select p.date as entry_date, 'purchase'::text as entry_type,
           'Purchase #' || p.purchase_no as reference,
           p.total_amount as debit, 0::numeric as credit
    from purchases p
    where p.supplier_id = p_supplier_id and p.payment_type in ('credit', 'cheque')
      and p.date between p_from and p_to
    union all
    select sp.date, 'payment'::text,
           initcap(sp.payment_type::text) || ' payment',
           0::numeric, sp.amount
    from supplier_payments sp
    left join cheques c on c.id = sp.cheque_id
    where sp.supplier_id = p_supplier_id and (sp.payment_type = 'cash' or c.status <> 'bounced')
      and sp.date between p_from and p_to
  )
  select
    e.entry_date, e.entry_type, e.reference, e.debit, e.credit,
    v_opening_running + sum(e.debit - e.credit) over (
      order by e.entry_date, e.entry_type rows between unbounded preceding and current row
    ) as running_balance
  from entries e
  order by e.entry_date, e.entry_type;
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────

revoke all on function create_purchase(uuid, date, purchase_payment_type, text, text, jsonb, jsonb) from public;
revoke all on function update_purchase_header(uuid, date, text, text) from public;
revoke all on function delete_purchase(uuid) from public;
revoke all on function create_opening_stock(uuid, text, date, numeric, text, numeric, text) from public;
revoke all on function create_stock_out(uuid, uuid, numeric, text, date) from public;
revoke all on function create_stock_adjustment(uuid, uuid, numeric, text, date) from public;
revoke all on function create_supplier_payment(uuid, date, numeric, payment_method, jsonb, text) from public;
revoke all on function update_cheque_status(uuid, cheque_status) from public;
revoke all on function get_supplier_balances() from public;
revoke all on function get_supplier_balance(uuid) from public;
revoke all on function get_supplier_ledger(uuid, date, date) from public;

grant execute on function create_purchase(uuid, date, purchase_payment_type, text, text, jsonb, jsonb) to authenticated;
grant execute on function update_purchase_header(uuid, date, text, text) to authenticated;
grant execute on function delete_purchase(uuid) to authenticated;
grant execute on function create_opening_stock(uuid, text, date, numeric, text, numeric, text) to authenticated;
grant execute on function create_stock_out(uuid, uuid, numeric, text, date) to authenticated;
grant execute on function create_stock_adjustment(uuid, uuid, numeric, text, date) to authenticated;
grant execute on function create_supplier_payment(uuid, date, numeric, payment_method, jsonb, text) to authenticated;
grant execute on function update_cheque_status(uuid, cheque_status) to authenticated;
grant execute on function get_supplier_balances() to authenticated;
grant execute on function get_supplier_balance(uuid) to authenticated;
grant execute on function get_supplier_ledger(uuid, date, date) to authenticated;
