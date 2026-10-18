-- New Kandy Essence: billing step 2 -- printing support.
--
-- * invoices: cash_received (change is computed on the fly, not stored),
--   created_by_name + customer_phone SNAPSHOTS taken inside the RPC (a Store
--   Keeper cannot read profiles or customers, but the printed bill needs the
--   cashier and the customer's phone), print_count / first_printed_at.
-- * app_settings: the printer grid (page size, margins, characters per inch,
--   lines per inch) and the footer line. Nothing about the grid is hard-coded
--   in the app; Settings -> Printing edits these (owner only, existing
--   app_settings_update policy) and the test print shows the result on paper.
-- * create_invoice / update_invoice get an optional p_cash_received (their
--   signatures change, so the old versions are dropped). Nothing else about
--   how a bill is calculated changes -- invoice_prepare / invoice_apply and
--   the customer-ledger rows are untouched.
-- * update_invoice resets print_count to 0 (edit_count keeps counting), so an
--   edited bill prints as REVISED (not COPY) the first time.
-- * record_invoice_print(p_invoice_id): both roles, never for deleted bills.

alter table invoices
  add column cash_received numeric(14,2) check (cash_received is null or cash_received >= 0),
  add column created_by_name text,
  add column customer_phone text,
  add column print_count integer not null default 0 check (print_count >= 0),
  add column first_printed_at timestamptz;

alter table app_settings
  add column print_page_width_in numeric not null default 5.5
    check (print_page_width_in between 2 and 12),
  add column print_page_height_in numeric not null default 5.5
    check (print_page_height_in between 2 and 14),
  add column print_margin_top_in numeric not null default 0.25
    check (print_margin_top_in between 0 and 3),
  add column print_margin_bottom_in numeric not null default 0.25
    check (print_margin_bottom_in between 0 and 3),
  add column print_margin_left_in numeric not null default 0.5
    check (print_margin_left_in between 0 and 3),
  add column print_margin_right_in numeric not null default 0.5
    check (print_margin_right_in between 0 and 3),
  add column print_cpi numeric not null default 12
    check (print_cpi between 5 and 30),
  add column print_lpi numeric not null default 6
    check (print_lpi between 3 and 16),
  add column print_footer text not null default 'Thank you. Come again.'
    check (char_length(print_footer) <= 80 and print_footer !~ E'[\\r\\n]'),
  add constraint app_settings_print_cols_check
    check ((print_page_width_in - print_margin_left_in - print_margin_right_in) * print_cpi >= 30),
  add constraint app_settings_print_rows_check
    check ((print_page_height_in - print_margin_top_in - print_margin_bottom_in) * print_lpi >= 20);

-- ── create_invoice / update_invoice with cash_received ──────────────────

drop function create_invoice(date, uuid, numeric, text, jsonb, jsonb, numeric, boolean, uuid);
drop function update_invoice(uuid, date, uuid, numeric, text, jsonb, jsonb, numeric, text, boolean);

-- Validates p_cash_received against the bill's CASH payments: it must cover
-- them (the difference is the change given). With no cash payment there is
-- nothing to give change on, so it is ignored (stored as null).
create function invoice_cash_received(p_prepared jsonb, p_cash_received numeric)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cash_paid numeric;
begin
  if p_cash_received is null then
    return null;
  end if;
  if p_cash_received < 0 or p_cash_received > 100000000 then
    raise exception 'cash received is not a valid amount';
  end if;

  select coalesce(sum((x->>'amount')::numeric), 0) into v_cash_paid
  from jsonb_array_elements(p_prepared->'payments') x
  where x->>'method' = 'cash';

  if v_cash_paid = 0 then
    return null;
  end if;
  if round(p_cash_received, 2) < v_cash_paid then
    raise exception 'cash received (%) is less than the cash payment (%)', round(p_cash_received, 2), v_cash_paid;
  end if;
  return round(p_cash_received, 2);
end;
$$;

create function create_invoice(
  p_date date,
  p_customer_id uuid,
  p_bill_discount numeric,
  p_notes text,
  p_lines jsonb,
  p_payments jsonb,
  p_expected_total numeric,
  p_confirm_shortage boolean default false,
  p_client_key uuid default null,
  p_cash_received numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role;
  v_date date;
  v_prepared jsonb;
  v_shortages jsonb;
  v_cash_received numeric;
  v_invoice_id uuid;
  v_invoice_no text;
  v_cust_name text;
  v_cust_code text;
  v_cust_phone text;
  v_cashier text;
  v_existing invoices%rowtype;
begin
  v_role := current_role_or_raise();

  if p_client_key is not null then
    select * into v_existing from invoices i where i.client_key = p_client_key and i.created_by = auth.uid();
    if v_existing.id is not null then
      return jsonb_build_object('ok', true, 'duplicate', true, 'invoice_id', v_existing.id,
        'invoice_no', v_existing.invoice_no, 'total', v_existing.total,
        'paid', v_existing.paid_amount, 'credit', v_existing.credit_amount);
    end if;
  end if;

  if v_role = 'owner' then
    v_date := coalesce(p_date, (now() at time zone 'Asia/Colombo')::date);
  else
    v_date := (now() at time zone 'Asia/Colombo')::date;
  end if;

  v_prepared := invoice_prepare(p_lines, p_payments, p_bill_discount, p_customer_id, p_expected_total);
  v_cash_received := invoice_cash_received(v_prepared, p_cash_received);

  v_shortages := invoice_shortages(v_prepared, null);
  if jsonb_array_length(v_shortages) > 0 and not coalesce(p_confirm_shortage, false) then
    return jsonb_build_object('ok', false, 'code', 'insufficient_stock', 'shortages', v_shortages);
  end if;

  if p_customer_id is not null then
    select c.name, c.code, c.contact into v_cust_name, v_cust_code, v_cust_phone
    from customers c where c.id = p_customer_id;
  end if;

  select pr.full_name into v_cashier from profiles pr where pr.id = auth.uid();

  v_invoice_no := invoice_next_no();

  insert into invoices (
    invoice_no, client_key, date, customer_id, customer_name, customer_code, customer_phone,
    subtotal, line_discount_total, bill_discount, total, paid_amount, credit_amount,
    cash_received, notes, created_by, created_by_name
  ) values (
    v_invoice_no, p_client_key, v_date, p_customer_id, v_cust_name, v_cust_code, v_cust_phone,
    (v_prepared->>'subtotal')::numeric, (v_prepared->>'line_discount_total')::numeric,
    (v_prepared->>'bill_discount')::numeric, (v_prepared->>'total')::numeric,
    (v_prepared->>'paid')::numeric, (v_prepared->>'credit')::numeric,
    v_cash_received, nullif(btrim(coalesce(p_notes, '')), ''), auth.uid(), v_cashier
  )
  returning id into v_invoice_id;

  perform invoice_apply(v_invoice_id, v_invoice_no, v_prepared, v_date, p_customer_id);

  return jsonb_build_object('ok', true, 'invoice_id', v_invoice_id, 'invoice_no', v_invoice_no,
    'total', (v_prepared->>'total')::numeric, 'paid', (v_prepared->>'paid')::numeric,
    'credit', (v_prepared->>'credit')::numeric);
end;
$$;

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
  p_cash_received numeric default null
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

  -- print_count goes back to 0 so the first print after an edit reads
  -- REVISED (edit_count > 0), not COPY. created_by_name stays: the cashier who
  -- made the bill is still the cashier.
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
      print_count = 0
  where id = v_invoice.id;

  perform invoice_apply(v_invoice.id, v_invoice.invoice_no, v_prepared, v_date, p_customer_id);

  return jsonb_build_object('ok', true, 'invoice_id', v_invoice.id, 'invoice_no', v_invoice.invoice_no,
    'total', (v_prepared->>'total')::numeric, 'paid', (v_prepared->>'paid')::numeric,
    'credit', (v_prepared->>'credit')::numeric);
end;
$$;

-- ── record_invoice_print ─────────────────────────────────────────────────

create function record_invoice_print(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  perform current_role_or_raise();

  update invoices
  set print_count = print_count + 1,
      first_printed_at = coalesce(first_printed_at, now())
  where id = p_invoice_id and status = 'issued'
  returning print_count into v_count;

  if v_count is null then
    raise exception 'bill not found';
  end if;

  return jsonb_build_object('ok', true, 'print_count', v_count);
end;
$$;

-- ── Privileges (create function re-triggers the default anon grant) ─────

revoke all on function invoice_cash_received(jsonb, numeric) from public, anon, authenticated;

revoke all on function create_invoice(date, uuid, numeric, text, jsonb, jsonb, numeric, boolean, uuid, numeric) from public;
revoke all on function create_invoice(date, uuid, numeric, text, jsonb, jsonb, numeric, boolean, uuid, numeric) from anon;
grant execute on function create_invoice(date, uuid, numeric, text, jsonb, jsonb, numeric, boolean, uuid, numeric) to authenticated;

revoke all on function update_invoice(uuid, date, uuid, numeric, text, jsonb, jsonb, numeric, text, boolean, numeric) from public;
revoke all on function update_invoice(uuid, date, uuid, numeric, text, jsonb, jsonb, numeric, text, boolean, numeric) from anon;
grant execute on function update_invoice(uuid, date, uuid, numeric, text, jsonb, jsonb, numeric, text, boolean, numeric) to authenticated;

revoke all on function record_invoice_print(uuid) from public;
revoke all on function record_invoice_print(uuid) from anon;
grant execute on function record_invoice_print(uuid) to authenticated;
