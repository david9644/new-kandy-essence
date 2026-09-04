-- New Kandy Essence: make expiry_date fully optional for batch-tracked
-- items. batch_number is still required at the form/UI level; only the
-- database-side expiry_date requirement is being dropped here.
--
-- FEFO ordering (stock_out_apply_fefo) already treats a null expiry_date as
-- lowest priority (nulls last), and the Near-Expiry dashboard query already
-- filters out batches with a null expiry_date, so both keep working
-- correctly for items that do have an expiry entered.

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

  return v_purchase_id;
end;
$$;

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
