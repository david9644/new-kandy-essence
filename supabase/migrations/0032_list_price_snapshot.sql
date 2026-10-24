-- New Kandy Essence: "normal price" on discounted bill lines.
--
-- * invoice_items.list_unit_price: a snapshot of the item's selling price x the
--   unit's conversion factor, taken by the SERVER at the moment a line is
--   written (null when the item had no selling price). Nothing a client sends
--   is ever read for it: invoice_prepare builds the prepared lines from the
--   item / unit rows, and invoice_apply takes the snapshot from items itself.
--   It is a price, not a cost, so both roles may read it (cost_total stays
--   hidden). Old bills have null: they display with the fallback rule
--   (normal price = the price on the line).
-- * update_invoice: a line whose item AND unit already existed on the bill
--   keeps its old snapshot (even a null one); new lines get a fresh snapshot.
--   invoice_apply gets an optional p_keep argument for that; create_invoice
--   still calls it with five arguments and needs no change. Totals, stock,
--   costs, ledgers and the Delete PIN are untouched.
-- * app_settings.print_strike_mode: how a discounted line's normal amount is
--   printed: 'strike' (crossed out, default), 'text' ("(was 360.00)") or 'off'.

alter table invoice_items
  add column list_unit_price numeric(14,2) check (list_unit_price is null or list_unit_price >= 0);

grant select (list_unit_price) on invoice_items to authenticated;

alter table app_settings
  add column print_strike_mode text not null default 'strike'
    check (print_strike_mode in ('strike', 'text', 'off'));

-- ── invoice_apply with the snapshot ─────────────────────────────────────

drop function invoice_apply(uuid, text, jsonb, date, uuid);

create function invoice_apply(
  p_invoice_id uuid,
  p_invoice_no text,
  p_prepared jsonb,
  p_date date,
  p_customer_id uuid,
  p_keep jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_so uuid;
  v_cost numeric;
  v_list numeric;
  v_kept jsonb;
  v_total numeric := (p_prepared->>'total')::numeric;
  v_paid numeric := (p_prepared->>'paid')::numeric;
begin
  for r in
    select * from jsonb_to_recordset(p_prepared->'lines') as x(
      line_no integer, item_id uuid, unit_name text, conversion_factor numeric,
      quantity numeric, base_quantity numeric, unit_price numeric,
      line_discount numeric, line_total numeric)
    order by x.line_no
  loop
    if not exists (select 1 from stock_batches sb where sb.item_id = r.item_id) then
      raise exception 'no stock exists yet for item "%" -- add stock before billing it',
        (select i.name from items i where i.id = r.item_id);
    end if;

    insert into stock_out (item_id, quantity, unit_name, conversion_factor, base_quantity, date, created_by, invoice_id)
    values (r.item_id, r.quantity, r.unit_name, r.conversion_factor, r.base_quantity, p_date, auth.uid(), p_invoice_id)
    returning id into v_so;

    perform stock_out_apply_fefo(r.item_id, v_so, r.base_quantity);

    select coalesce(sum(sob.quantity_deducted * sb.unit_cost), 0) into v_cost
    from stock_out_batches sob
    join stock_batches sb on sb.id = sob.stock_batch_id
    where sob.stock_out_id = v_so;

    -- the normal price: kept from the old line when this is an edit and the same
    -- item + unit was already on the bill, else the item's price right now
    v_kept := null;
    if p_keep is not null then
      select k into v_kept
      from jsonb_array_elements(p_keep) k
      where (k->>'item_id')::uuid = r.item_id and k->>'unit_name' = r.unit_name
      limit 1;
    end if;
    if v_kept is not null then
      v_list := nullif(v_kept->>'list_unit_price', '')::numeric;
    else
      select case when i.sale_price is not null then round(i.sale_price * r.conversion_factor, 2) end
      into v_list from items i where i.id = r.item_id;
    end if;

    insert into invoice_items (
      invoice_id, line_no, item_id, unit_name, conversion_factor, quantity, base_quantity,
      unit_price, line_discount, line_total, list_unit_price, cost_total, stock_out_id
    ) values (
      p_invoice_id, r.line_no, r.item_id, r.unit_name, r.conversion_factor, r.quantity, r.base_quantity,
      r.unit_price, r.line_discount, r.line_total, v_list, round(v_cost, 4), v_so
    );
  end loop;

  insert into invoice_payments (invoice_id, method, amount, cheque_number, cheque_bank, cheque_date, reference)
  select p_invoice_id, x.method, x.amount, x.cheque_number, x.cheque_bank, x.cheque_date, x.reference
  from jsonb_to_recordset(p_prepared->'payments') as x(
    method text, amount numeric, cheque_number text, cheque_bank text, cheque_date date, reference text);

  if p_customer_id is not null then
    insert into customer_credits (customer_id, date, amount, notes, created_by, invoice_id)
    values (p_customer_id, p_date, v_total, p_invoice_no, auth.uid(), p_invoice_id);

    if v_paid > 0 then
      insert into customer_payments (customer_id, date, amount, notes, created_by, invoice_id)
      values (p_customer_id, p_date, v_paid, p_invoice_no, auth.uid(), p_invoice_id);
    end if;
  end if;
end;
$$;

revoke all on function invoice_apply(uuid, text, jsonb, date, uuid, jsonb) from public, anon, authenticated;

-- ── update_invoice: same as 0029 plus the kept snapshots ────────────────

create or replace function update_invoice(
  p_invoice_id uuid,
  p_date date,
  p_customer_id uuid,
  p_bill_discount numeric,
  p_notes text,
  p_lines jsonb,
  p_payments jsonb,
  p_expected_total numeric,
  p_delete_pin text,
  p_confirm_shortage boolean default false,
  p_cash_received numeric default null,
  p_edit_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin jsonb;
  v_invoice invoices%rowtype;
  v_date date;
  v_prepared jsonb;
  v_shortages jsonb;
  v_cash_received numeric;
  v_cust_name text;
  v_cust_code text;
  v_cust_phone text;
  v_keep jsonb;
begin
  if not is_owner() then
    raise exception 'only owner can edit a bill' using errcode = '42501';
  end if;

  v_pin := check_delete_pin(p_delete_pin);
  if not (v_pin->>'ok')::boolean then
    return v_pin;
  end if;

  select * into v_invoice from invoices i where i.id = p_invoice_id and i.status = 'issued' for update;
  if v_invoice.id is null then
    raise exception 'bill not found';
  end if;

  if p_edit_key is not null and v_invoice.last_edit_key = p_edit_key then
    return jsonb_build_object('ok', true, 'duplicate', true, 'invoice_id', v_invoice.id,
      'invoice_no', v_invoice.invoice_no, 'total', v_invoice.total,
      'paid', v_invoice.paid_amount, 'credit', v_invoice.credit_amount);
  end if;

  v_date := coalesce(p_date, v_invoice.date);

  v_prepared := invoice_prepare(p_lines, p_payments, p_bill_discount, p_customer_id, p_expected_total);
  v_cash_received := invoice_cash_received(v_prepared, p_cash_received);

  v_shortages := invoice_shortages(v_prepared, v_invoice.id);
  if jsonb_array_length(v_shortages) > 0 and not coalesce(p_confirm_shortage, false) then
    return jsonb_build_object('ok', false, 'code', 'insufficient_stock', 'shortages', v_shortages);
  end if;

  if p_customer_id is not null then
    select c.name, c.code, c.contact into v_cust_name, v_cust_code, v_cust_phone
    from customers c where c.id = p_customer_id;
  end if;

  -- remember each old line's normal-price snapshot before the lines are replaced
  select coalesce(jsonb_agg(jsonb_build_object(
           'item_id', ii.item_id, 'unit_name', ii.unit_name, 'list_unit_price', ii.list_unit_price
         ) order by ii.line_no), '[]'::jsonb)
  into v_keep
  from invoice_items ii where ii.invoice_id = v_invoice.id;

  perform invoice_release(v_invoice.id);
  delete from invoice_items where invoice_id = v_invoice.id;
  delete from invoice_payments where invoice_id = v_invoice.id;

  update invoices
  set date = v_date,
      customer_id = p_customer_id, customer_name = v_cust_name, customer_code = v_cust_code,
      customer_phone = v_cust_phone,
      subtotal = (v_prepared->>'subtotal')::numeric,
      line_discount_total = (v_prepared->>'line_discount_total')::numeric,
      bill_discount = (v_prepared->>'bill_discount')::numeric,
      total = (v_prepared->>'total')::numeric,
      paid_amount = (v_prepared->>'paid')::numeric,
      credit_amount = (v_prepared->>'credit')::numeric,
      cash_received = v_cash_received,
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      edited_at = now(), edited_by = auth.uid(), edit_count = edit_count + 1,
      print_count = 0,
      last_edit_key = p_edit_key
  where id = v_invoice.id;

  perform invoice_apply(v_invoice.id, v_invoice.invoice_no, v_prepared, v_date, p_customer_id, v_keep);

  return jsonb_build_object('ok', true, 'invoice_id', v_invoice.id, 'invoice_no', v_invoice.invoice_no,
    'total', (v_prepared->>'total')::numeric, 'paid', (v_prepared->>'paid')::numeric,
    'credit', (v_prepared->>'credit')::numeric);
end;
$$;

revoke all on function update_invoice(uuid, date, uuid, numeric, text, jsonb, jsonb, numeric, text, boolean, numeric, uuid) from public;
revoke all on function update_invoice(uuid, date, uuid, numeric, text, jsonb, jsonb, numeric, text, boolean, numeric, uuid) from anon;
grant execute on function update_invoice(uuid, date, uuid, numeric, text, jsonb, jsonb, numeric, text, boolean, numeric, uuid) to authenticated;
