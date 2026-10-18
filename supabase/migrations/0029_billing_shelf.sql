-- New Kandy Essence: counter billing screen support.
--
-- * get_billing_shelf(): the whole shelf in ONE read for the till screen
--   (Owner and Store Keeper): active items with category, stock left, and one
--   entry per unit with its effective price. NO cost data of any kind: no
--   purchase cost, no batch cost, no stock value. The exact key set is
--   asserted by the tests (item keys: id, code, name, category_id, base_unit,
--   stock, units; unit keys: unit_name, factor, price, source).
--   Effective price per unit = the item's default sale price x the unit's
--   conversion factor, else the price this item+unit was last billed at
--   (deleted bills ignored), else null ("Set price" on the tile).
-- * invoices.last_edit_key + update_invoice(..., p_edit_key): each edit
--   session on the screen carries its own key, so a double-pressed (or
--   retried) "Save changes" is applied once and edit_count goes up once.
--   Nothing else about how a bill is calculated changes.

alter table invoices add column last_edit_key uuid;

-- ── shelf read ───────────────────────────────────────────────────────────

create function get_billing_shelf()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform current_role_or_raise();

  return jsonb_build_object(
    'categories', coalesce(
      (select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
       from categories c),
      '[]'::jsonb),
    'items', coalesce(
      (select jsonb_agg(
         jsonb_build_object(
           'id', i.id,
           'code', i.code,
           'name', i.name,
           'category_id', i.category_id,
           'base_unit', i.base_unit,
           'stock', coalesce(st.qty, 0),
           'units', un.units
         ) order by i.name)
       from items i
       left join (
         select sb.item_id, sum(sb.quantity_remaining) as qty
         from stock_batches sb
         group by sb.item_id
       ) st on st.item_id = i.id
       cross join lateral (
         select jsonb_agg(
                  jsonb_build_object(
                    'unit_name', u.unit_name,
                    'factor', u.factor,
                    'price', coalesce(
                               case when i.sale_price is not null then round(i.sale_price * u.factor, 2) end,
                               lp.unit_price),
                    'source', case when i.sale_price is not null then 'default'
                                   when lp.unit_price is not null then 'last'
                                   else null end
                  ) order by u.factor, u.unit_name)
                as units
         from (
           select i.base_unit as unit_name, 1::numeric as factor
           union all
           select iu.unit_name, iu.conversion_factor_to_base
           from item_units iu where iu.item_id = i.id
         ) u
         left join lateral (
           select ii.unit_price
           from invoice_items ii
           join invoices inv on inv.id = ii.invoice_id
           where ii.item_id = i.id and ii.unit_name = u.unit_name and inv.status = 'issued'
           order by inv.date desc, inv.created_at desc, ii.line_no desc
           limit 1
         ) lp on true
       ) un
       where i.active),
      '[]'::jsonb)
  );
end;
$$;

-- ── update_invoice with a per-edit-session key ──────────────────────────

drop function update_invoice(uuid, date, uuid, numeric, text, jsonb, jsonb, numeric, text, boolean, numeric);

create function update_invoice(
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

  -- Same edit session pressed again (double tap / retry after a lost
  -- answer): already applied, do not apply or count it twice.
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

  perform invoice_apply(v_invoice.id, v_invoice.invoice_no, v_prepared, v_date, p_customer_id);

  return jsonb_build_object('ok', true, 'invoice_id', v_invoice.id, 'invoice_no', v_invoice.invoice_no,
    'total', (v_prepared->>'total')::numeric, 'paid', (v_prepared->>'paid')::numeric,
    'credit', (v_prepared->>'credit')::numeric);
end;
$$;

revoke all on function get_billing_shelf() from public;
revoke all on function get_billing_shelf() from anon;
grant execute on function get_billing_shelf() to authenticated;

revoke all on function update_invoice(uuid, date, uuid, numeric, text, jsonb, jsonb, numeric, text, boolean, numeric, uuid) from public;
revoke all on function update_invoice(uuid, date, uuid, numeric, text, jsonb, jsonb, numeric, text, boolean, numeric, uuid) from anon;
grant execute on function update_invoice(uuid, date, uuid, numeric, text, jsonb, jsonb, numeric, text, boolean, numeric, uuid) to authenticated;
