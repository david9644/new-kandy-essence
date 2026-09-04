-- New Kandy Essence: a cheque-paid purchase never reduced the supplier's
-- balance once the cheque cleared, because create_purchase only created the
-- cheques row and the purchase row -- unlike create_supplier_payment (the
-- standalone Payments flow), it never created the matching supplier_payments
-- row that get_supplier_balance's credit-side query relies on. The purchase
-- debit was recorded with nothing to ever offset it.

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

  -- Mirrors what create_supplier_payment does for a standalone cheque
  -- payment: without this row, get_supplier_balance's credit-side query has
  -- nothing to net this purchase's debit against. get_supplier_balance /
  -- get_supplier_balances already exclude bounced-cheque payments from the
  -- credit side, so if this cheque later bounces the debt reinstates itself
  -- automatically -- no change needed there.
  if p_payment_type = 'cheque' then
    insert into supplier_payments (supplier_id, date, amount, payment_type, cheque_id, created_by)
    values (p_supplier_id, p_date, v_total, 'cheque', v_cheque_id, auth.uid());
  end if;

  return v_purchase_id;
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

  -- create_purchase now creates this purchase's own supplier_payments row
  -- when it's cheque-paid (see above), so it's this function's job to clean
  -- that up too, not something to block deletion over.
  if v_cheque_id is not null then
    delete from supplier_payments where cheque_id = v_cheque_id;
  end if;

  delete from purchases where id = p_purchase_id;
  delete from stock_batches where id = any(v_batch_ids);

  if v_cheque_id is not null then
    delete from cheques where id = v_cheque_id;
  end if;
end;
$$;
