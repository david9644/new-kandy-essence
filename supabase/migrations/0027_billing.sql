-- New Kandy Essence: BILLING (sales invoices) -- step 1 of 3 (data model +
-- billing screen; printing and reports come later).
--
-- Design decisions (see the summary that shipped with this migration):
--
-- * Stock: every invoice line creates ONE stock_out row tagged with the
--   invoice (stock_out.invoice_id) and runs the existing FEFO walk
--   (stock_out_apply_fefo) on it. So stock movements, batch deductions and the
--   reversal helper (stock_out_reverse) are the existing, proven machinery;
--   invoice_items.stock_out_id links the two. The consumed cost per line is
--   computed from the batches actually drawn (stock_out_batches x
--   stock_batches.unit_cost) and frozen into invoice_items.cost_total.
-- * Customer ledger: an invoice for a registered customer writes ONE
--   customer_credits row (full total) and, if anything was paid at billing,
--   ONE customer_payments row, both tagged with invoice_id. The balance maths
--   (get_customer_balance / get_customer_balances) is untouched. Tagged rows
--   cannot be edited or deleted from the customer ledger (update_/delete_
--   customer_credit/payment refuse them) -- edit or delete the invoice.
-- * Deleting a bill is a SOFT delete (status 'cancelled'): stock is restored,
--   the ledger rows are removed, the row stays for the audit trail and its
--   number is never reused. RLS hides cancelled invoices from every API read.
-- * Invoice numbers come from a counter row updated inside the same
--   transaction (gap-free for rollbacks; numbers of deleted bills are not
--   reused because the counter only goes up).
-- * PIN failures / stock shortages are returned as a status (jsonb), not
--   raised, so the Delete PIN lockout counter persists (see 0025) and a
--   shortage can be confirmed by the user before anything is written.

-- ── Items: optional default selling price (per base unit) ───────────────

alter table items
  add column sale_price numeric check (sale_price is null or sale_price >= 0);

-- ── Business details for the bill header (owner edits via existing
--    app_settings_update policy; readable by both roles) ─────────────────

alter table app_settings
  add column business_name text,
  add column business_address text,
  add column business_phone1 text,
  add column business_phone2 text;

-- ── Invoice number counter ───────────────────────────────────────────────

create table invoice_counter (
  id boolean primary key default true check (id),
  last_no integer not null default 0
);
insert into invoice_counter (id, last_no) values (true, 0);

alter table invoice_counter enable row level security;
revoke all on invoice_counter from public;
revoke all on invoice_counter from anon;
revoke all on invoice_counter from authenticated;

-- ── Invoices ─────────────────────────────────────────────────────────────

create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  client_key uuid unique,
  date date not null,
  customer_id uuid references customers(id),
  -- Snapshot for display: customers are owner-only, but a Store Keeper must
  -- still see who a bill was for.
  customer_name text,
  customer_code text,
  subtotal numeric(14,2) not null check (subtotal >= 0),
  line_discount_total numeric(14,2) not null default 0 check (line_discount_total >= 0),
  bill_discount numeric(14,2) not null default 0 check (bill_discount >= 0),
  total numeric(14,2) not null check (total > 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  credit_amount numeric(14,2) not null default 0 check (credit_amount >= 0),
  status text not null default 'issued' check (status in ('issued', 'cancelled')),
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  edited_by uuid references profiles(id),
  edit_count integer not null default 0,
  cancelled_by uuid references profiles(id),
  cancelled_at timestamptz,
  check (paid_amount + credit_amount = total),
  check (credit_amount = 0 or customer_id is not null)
);
create index invoices_date_idx on invoices (date);
create index invoices_customer_idx on invoices (customer_id);

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id),
  line_no integer not null,
  item_id uuid not null references items(id),
  unit_name text not null,
  conversion_factor numeric not null check (conversion_factor > 0),
  quantity numeric not null check (quantity > 0),
  base_quantity numeric not null check (base_quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_discount numeric(14,2) not null default 0 check (line_discount >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  -- Cost of the stock this line consumed (from the batches' unit_cost). Not
  -- selectable through the API (column privileges below); reports read it
  -- through owner-only functions.
  cost_total numeric(16,4) not null default 0,
  stock_out_id uuid unique references stock_out(id) on delete set null,
  created_at timestamptz not null default now()
);
create index invoice_items_invoice_idx on invoice_items (invoice_id);
create index invoice_items_item_idx on invoice_items (item_id);

create table invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id),
  method text not null check (method in ('cash', 'cheque', 'bank_transfer')),
  amount numeric(14,2) not null check (amount > 0),
  cheque_number text check (cheque_number is null or cheque_number ~ '^[0-9]+$'),
  cheque_bank text,
  cheque_date date,
  reference text,
  created_at timestamptz not null default now(),
  check (method <> 'cheque' or (cheque_number is not null and cheque_bank is not null and cheque_date is not null))
);
create index invoice_payments_invoice_idx on invoice_payments (invoice_id);

-- Tag columns on the existing tables the invoice writes into.
alter table stock_out add column invoice_id uuid references invoices(id);
alter table customer_credits add column invoice_id uuid references invoices(id);
alter table customer_payments add column invoice_id uuid references invoices(id);
create index stock_out_invoice_idx on stock_out (invoice_id) where invoice_id is not null;
create index customer_credits_invoice_idx on customer_credits (invoice_id) where invoice_id is not null;
create index customer_payments_invoice_idx on customer_payments (invoice_id) where invoice_id is not null;

-- ── RLS / privileges: read-only through the API, writes only via RPCs ───

alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table invoice_payments enable row level security;

-- Deleted (cancelled) bills are invisible to every API read, for both roles.
create policy invoices_select on invoices for select to authenticated
  using (status = 'issued');
create policy invoice_items_select on invoice_items for select to authenticated
  using (exists (select 1 from invoices i where i.id = invoice_items.invoice_id));
create policy invoice_payments_select on invoice_payments for select to authenticated
  using (exists (select 1 from invoices i where i.id = invoice_payments.invoice_id));

revoke all on invoices from public;
revoke all on invoices from anon;
revoke all on invoices from authenticated;
grant select on invoices to authenticated;

revoke all on invoice_items from public;
revoke all on invoice_items from anon;
revoke all on invoice_items from authenticated;
-- every column EXCEPT cost_total
grant select (id, invoice_id, line_no, item_id, unit_name, conversion_factor, quantity,
              base_quantity, unit_price, line_discount, line_total, stock_out_id, created_at)
  on invoice_items to authenticated;

revoke all on invoice_payments from public;
revoke all on invoice_payments from anon;
revoke all on invoice_payments from authenticated;
grant select on invoice_payments to authenticated;

-- ── Internal helpers (not callable through the API) ─────────────────────

create function invoice_next_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_no integer;
begin
  -- Row lock + same transaction: a rolled-back bill gives its number back.
  update invoice_counter set last_no = last_no + 1 where id returning last_no into v_no;
  return 'INV-' || lpad(v_no::text, greatest(4, length(v_no::text)), '0');
end;
$$;

-- Validates everything and recomputes every total from the lines. Nothing the
-- client says about totals is trusted: p_expected_total is only compared.
create function invoice_prepare(
  p_lines jsonb,
  p_payments jsonb,
  p_bill_discount numeric,
  p_customer_id uuid,
  p_expected_total numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_elem jsonb;
  v_n integer := 0;
  v_item items%rowtype;
  v_factor numeric;
  v_qty numeric;
  v_price numeric;
  v_disc numeric;
  v_gross numeric;
  v_unit text;
  v_lines jsonb := '[]'::jsonb;
  v_pays jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
  v_line_disc numeric := 0;
  v_bill_disc numeric;
  v_total numeric;
  v_paid numeric := 0;
  v_method text;
  v_amount numeric;
  v_chq_no text;
  v_chq_bank text;
  v_chq_date date;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'a bill needs at least one line';
  end if;
  if jsonb_array_length(p_lines) > 300 then
    raise exception 'too many lines on one bill (maximum 300)';
  end if;

  for v_elem in select * from jsonb_array_elements(p_lines)
  loop
    v_n := v_n + 1;
    v_qty := (v_elem->>'quantity')::numeric;
    v_price := (v_elem->>'unit_price')::numeric;
    v_disc := round(coalesce((v_elem->>'line_discount')::numeric, 0), 2);
    v_unit := v_elem->>'unit_name';

    if v_qty is null or v_qty <= 0 then
      raise exception 'line %: quantity must be greater than zero', v_n;
    end if;
    if v_price is null or v_price < 0 then
      raise exception 'line %: unit price cannot be negative', v_n;
    end if;
    if v_disc < 0 then
      raise exception 'line %: discount cannot be negative', v_n;
    end if;

    select * into v_item from items where id = (v_elem->>'item_id')::uuid;
    if v_item.id is null then
      raise exception 'line %: item not found', v_n;
    end if;

    if v_unit = v_item.base_unit then
      v_factor := 1;
    else
      select conversion_factor_to_base into v_factor
      from item_units where item_id = v_item.id and unit_name = v_unit;
      if v_factor is null then
        raise exception 'line %: unknown unit % for item %', v_n, v_unit, v_item.name;
      end if;
    end if;

    v_price := round(v_price, 2);
    v_gross := round(v_qty * v_price, 2);
    if v_disc > v_gross then
      raise exception 'line %: the discount is more than the line amount', v_n;
    end if;

    v_subtotal := v_subtotal + v_gross;
    v_line_disc := v_line_disc + v_disc;
    v_lines := v_lines || jsonb_build_object(
      'line_no', v_n,
      'item_id', v_item.id,
      'unit_name', v_unit,
      'conversion_factor', v_factor,
      'quantity', v_qty,
      'base_quantity', v_qty * v_factor,
      'unit_price', v_price,
      'line_discount', v_disc,
      'line_total', v_gross - v_disc
    );
  end loop;

  v_bill_disc := round(coalesce(p_bill_discount, 0), 2);
  if v_bill_disc < 0 then
    raise exception 'the bill discount cannot be negative';
  end if;
  if v_bill_disc > v_subtotal - v_line_disc then
    raise exception 'the bill discount is more than the bill amount';
  end if;

  v_total := v_subtotal - v_line_disc - v_bill_disc;
  if v_total <= 0 then
    raise exception 'the bill total must be greater than zero';
  end if;

  if p_expected_total is null or abs(p_expected_total - v_total) > 0.004 then
    raise exception 'total mismatch: the screen showed % but the bill adds up to %', p_expected_total, v_total;
  end if;

  if p_payments is not null and jsonb_typeof(p_payments) = 'array' then
    v_n := 0;
    for v_elem in select * from jsonb_array_elements(p_payments)
    loop
      v_n := v_n + 1;
      v_method := v_elem->>'method';
      if v_method is null or v_method not in ('cash', 'cheque', 'bank_transfer') then
        raise exception 'payment %: unknown payment method', v_n;
      end if;
      v_amount := round((v_elem->>'amount')::numeric, 2);
      if v_amount is null or v_amount <= 0 then
        raise exception 'payment %: amount must be greater than zero', v_n;
      end if;

      v_chq_no := null; v_chq_bank := null; v_chq_date := null;
      if v_method = 'cheque' then
        v_chq_no := btrim(coalesce(v_elem->>'cheque_number', ''));
        v_chq_bank := btrim(coalesce(v_elem->>'cheque_bank', ''));
        v_chq_date := nullif(v_elem->>'cheque_date', '')::date;
        if v_chq_no !~ '^[0-9]+$' then
          raise exception 'payment %: the cheque number must be digits only', v_n;
        end if;
        if v_chq_bank = '' then
          raise exception 'payment %: enter the cheque''s bank', v_n;
        end if;
        if v_chq_date is null then
          raise exception 'payment %: enter the cheque date', v_n;
        end if;
      end if;

      v_paid := v_paid + v_amount;
      v_pays := v_pays || jsonb_build_object(
        'method', v_method,
        'amount', v_amount,
        'cheque_number', v_chq_no,
        'cheque_bank', v_chq_bank,
        'cheque_date', v_chq_date,
        'reference', nullif(btrim(coalesce(v_elem->>'reference', '')), '')
      );
    end loop;
  end if;

  if v_paid > v_total then
    raise exception 'the payments (%) are more than the bill total (%)', v_paid, v_total;
  end if;
  if v_total - v_paid > 0 and p_customer_id is null then
    raise exception 'a bill with credit or an unpaid balance needs a registered customer';
  end if;
  if p_customer_id is not null and not exists (select 1 from customers c where c.id = p_customer_id) then
    raise exception 'customer not found';
  end if;

  return jsonb_build_object(
    'lines', v_lines,
    'payments', v_pays,
    'subtotal', v_subtotal,
    'line_discount_total', v_line_disc,
    'bill_discount', v_bill_disc,
    'total', v_total,
    'paid', v_paid,
    'credit', v_total - v_paid
  );
end;
$$;

-- Items whose requested base quantity exceeds what is on hand. For an edit,
-- the stock the invoice currently holds counts as available (it is about to be
-- restored), so this can run BEFORE anything is changed.
create function invoice_shortages(p_prepared jsonb, p_invoice_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'item_id', r.item_id, 'item_name', r.name, 'base_unit', r.base_unit,
             'available', r.available, 'requested', r.requested
           ) order by r.name), '[]'::jsonb)
  from (
    select i.id as item_id, i.name, i.base_unit, req.requested,
           coalesce((select sum(sb.quantity_remaining) from stock_batches sb where sb.item_id = i.id), 0)
           + coalesce((select sum(sob.quantity_deducted)
                       from stock_out so
                       join stock_out_batches sob on sob.stock_out_id = so.id
                       where so.invoice_id = p_invoice_id and so.item_id = i.id), 0) as available
    from (
      select (l->>'item_id')::uuid as item_id, sum((l->>'base_quantity')::numeric) as requested
      from jsonb_array_elements(p_prepared->'lines') l
      group by 1
    ) req
    join items i on i.id = req.item_id
  ) r
  where r.requested > r.available;
$$;

-- Undo an invoice's stock and customer-ledger effects (used by edit and by
-- delete bill). Exact: the stock_out rows were created for this invoice only.
create function invoice_release(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_so uuid;
begin
  for v_so in select so.id from stock_out so where so.invoice_id = p_invoice_id
  loop
    perform stock_out_reverse(v_so);
  end loop;

  -- cascades stock_out_batches; invoice_items.stock_out_id becomes null
  delete from stock_out where invoice_id = p_invoice_id;
  delete from customer_payments where invoice_id = p_invoice_id;
  delete from customer_credits where invoice_id = p_invoice_id;
end;
$$;

-- Writes the lines (with FEFO stock deduction + frozen cost), payments and
-- customer-ledger rows of an already-inserted invoice header.
create function invoice_apply(
  p_invoice_id uuid,
  p_invoice_no text,
  p_prepared jsonb,
  p_date date,
  p_customer_id uuid
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

    insert into invoice_items (
      invoice_id, line_no, item_id, unit_name, conversion_factor, quantity, base_quantity,
      unit_price, line_discount, line_total, cost_total, stock_out_id
    ) values (
      p_invoice_id, r.line_no, r.item_id, r.unit_name, r.conversion_factor, r.quantity, r.base_quantity,
      r.unit_price, r.line_discount, r.line_total, round(v_cost, 4), v_so
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

-- ── create_invoice (Owner or Store Keeper) ──────────────────────────────
-- p_lines:    [{item_id, unit_name, quantity, unit_price, line_discount}]
-- p_payments: [{method, amount, cheque_number, cheque_bank, cheque_date, reference}]
-- Credit = whatever the payments do not cover (needs a customer).
-- Returns {ok:true, invoice_id, invoice_no, total, paid, credit} or
-- {ok:false, code:'insufficient_stock', shortages:[...]} when stock would run
-- out and p_confirm_shortage is false (nothing is written in that case).

create function create_invoice(
  p_date date,
  p_customer_id uuid,
  p_bill_discount numeric,
  p_notes text,
  p_lines jsonb,
  p_payments jsonb,
  p_expected_total numeric,
  p_confirm_shortage boolean default false,
  p_client_key uuid default null
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
  v_invoice_id uuid;
  v_invoice_no text;
  v_cust_name text;
  v_cust_code text;
  v_existing invoices%rowtype;
begin
  v_role := current_role_or_raise();

  -- Double-tap protection: the same client_key never creates a second bill.
  if p_client_key is not null then
    select * into v_existing from invoices i where i.client_key = p_client_key and i.created_by = auth.uid();
    if v_existing.id is not null then
      return jsonb_build_object('ok', true, 'duplicate', true, 'invoice_id', v_existing.id,
        'invoice_no', v_existing.invoice_no, 'total', v_existing.total,
        'paid', v_existing.paid_amount, 'credit', v_existing.credit_amount);
    end if;
  end if;

  -- Only the Owner can back-date; a Store Keeper always bills "today".
  if v_role = 'owner' then
    v_date := coalesce(p_date, (now() at time zone 'Asia/Colombo')::date);
  else
    v_date := (now() at time zone 'Asia/Colombo')::date;
  end if;

  v_prepared := invoice_prepare(p_lines, p_payments, p_bill_discount, p_customer_id, p_expected_total);

  v_shortages := invoice_shortages(v_prepared, null);
  if jsonb_array_length(v_shortages) > 0 and not coalesce(p_confirm_shortage, false) then
    return jsonb_build_object('ok', false, 'code', 'insufficient_stock', 'shortages', v_shortages);
  end if;

  if p_customer_id is not null then
    select c.name, c.code into v_cust_name, v_cust_code from customers c where c.id = p_customer_id;
  end if;

  v_invoice_no := invoice_next_no();

  insert into invoices (
    invoice_no, client_key, date, customer_id, customer_name, customer_code,
    subtotal, line_discount_total, bill_discount, total, paid_amount, credit_amount,
    notes, created_by
  ) values (
    v_invoice_no, p_client_key, v_date, p_customer_id, v_cust_name, v_cust_code,
    (v_prepared->>'subtotal')::numeric, (v_prepared->>'line_discount_total')::numeric,
    (v_prepared->>'bill_discount')::numeric, (v_prepared->>'total')::numeric,
    (v_prepared->>'paid')::numeric, (v_prepared->>'credit')::numeric,
    nullif(btrim(coalesce(p_notes, '')), ''), auth.uid()
  )
  returning id into v_invoice_id;

  perform invoice_apply(v_invoice_id, v_invoice_no, v_prepared, v_date, p_customer_id);

  return jsonb_build_object('ok', true, 'invoice_id', v_invoice_id, 'invoice_no', v_invoice_no,
    'total', (v_prepared->>'total')::numeric, 'paid', (v_prepared->>'paid')::numeric,
    'credit', (v_prepared->>'credit')::numeric);
end;
$$;

-- ── update_invoice (Owner + Delete PIN) ─────────────────────────────────
-- Keeps invoice_no / created_at; replaces everything else atomically. Net
-- effect on stock and the customer balance is exactly as if the invoice had
-- been created with the new data.

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
  p_confirm_shortage boolean default false
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
  v_cust_name text;
  v_cust_code text;
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

  v_shortages := invoice_shortages(v_prepared, v_invoice.id);
  if jsonb_array_length(v_shortages) > 0 and not coalesce(p_confirm_shortage, false) then
    return jsonb_build_object('ok', false, 'code', 'insufficient_stock', 'shortages', v_shortages);
  end if;

  if p_customer_id is not null then
    select c.name, c.code into v_cust_name, v_cust_code from customers c where c.id = p_customer_id;
  end if;

  perform invoice_release(v_invoice.id);
  delete from invoice_items where invoice_id = v_invoice.id;
  delete from invoice_payments where invoice_id = v_invoice.id;

  update invoices
  set date = v_date,
      customer_id = p_customer_id, customer_name = v_cust_name, customer_code = v_cust_code,
      subtotal = (v_prepared->>'subtotal')::numeric,
      line_discount_total = (v_prepared->>'line_discount_total')::numeric,
      bill_discount = (v_prepared->>'bill_discount')::numeric,
      total = (v_prepared->>'total')::numeric,
      paid_amount = (v_prepared->>'paid')::numeric,
      credit_amount = (v_prepared->>'credit')::numeric,
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      edited_at = now(), edited_by = auth.uid(), edit_count = edit_count + 1
  where id = v_invoice.id;

  perform invoice_apply(v_invoice.id, v_invoice.invoice_no, v_prepared, v_date, p_customer_id);

  return jsonb_build_object('ok', true, 'invoice_id', v_invoice.id, 'invoice_no', v_invoice.invoice_no,
    'total', (v_prepared->>'total')::numeric, 'paid', (v_prepared->>'paid')::numeric,
    'credit', (v_prepared->>'credit')::numeric);
end;
$$;

-- ── cancel_invoice = "Delete bill" (Owner + Delete PIN, soft delete) ────

create function cancel_invoice(p_invoice_id uuid, p_delete_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin jsonb;
  v_invoice invoices%rowtype;
begin
  if not is_owner() then
    raise exception 'only owner can delete a bill' using errcode = '42501';
  end if;

  v_pin := check_delete_pin(p_delete_pin);
  if not (v_pin->>'ok')::boolean then
    return v_pin;
  end if;

  select * into v_invoice from invoices i where i.id = p_invoice_id and i.status = 'issued' for update;
  if v_invoice.id is null then
    raise exception 'bill not found';
  end if;

  perform invoice_release(v_invoice.id);

  update invoices
  set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now()
  where id = v_invoice.id;

  return jsonb_build_object('ok', true, 'invoice_no', v_invoice.invoice_no);
end;
$$;

-- ── Narrow customer access for the Store Keeper ─────────────────────────
-- Customers stay owner-only end to end; these return only id / code / name.

create function search_customers_basic(p_query text default null)
returns table (id uuid, code text, name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform current_role_or_raise();

  return query
  select c.id, c.code, c.name
  from customers c
  where c.active
    and (p_query is null or btrim(p_query) = ''
         or c.name ilike '%' || btrim(p_query) || '%'
         or c.code ilike '%' || btrim(p_query) || '%')
  order by c.name
  limit 3000;
end;
$$;

create function quick_add_customer(p_name text, p_contact text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
  v_name text := btrim(coalesce(p_name, ''));
begin
  perform current_role_or_raise();

  if v_name = '' then
    raise exception 'customer name is required';
  end if;

  insert into customers (code, name, contact, created_by)
  values ('', v_name, nullif(btrim(coalesce(p_contact, '')), ''), auth.uid())
  returning customers.id, customers.code into v_id, v_code;

  insert into customer_financials (customer_id, opening_balance) values (v_id, 0);

  return jsonb_build_object('id', v_id, 'code', v_code, 'name', v_name);
end;
$$;

-- Price auto-fill: the unit price this item was last billed at in this unit
-- (cancelled bills ignored). Null if never billed.
create function get_item_last_sale_price(p_item_id uuid, p_unit_name text)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_price numeric;
begin
  perform current_role_or_raise();

  select ii.unit_price into v_price
  from invoice_items ii
  join invoices i on i.id = ii.invoice_id
  where ii.item_id = p_item_id and ii.unit_name = p_unit_name and i.status = 'issued'
  order by i.date desc, i.created_at desc, ii.line_no desc
  limit 1;

  return v_price;
end;
$$;

-- ── Customer ledger: show invoice-linked rows, keep the maths identical ─
-- Same running-balance logic as 0018/0019; two extra output columns tell the
-- UI which rows belong to an invoice (read-only) and its number.

drop function get_customer_ledger(uuid, date, date);

create function get_customer_ledger(p_customer_id uuid, p_from date, p_to date)
returns table (
  entry_id uuid,
  entry_date date,
  entry_type text,
  reference text,
  debit numeric,
  credit numeric,
  running_balance numeric,
  invoice_id uuid,
  invoice_no text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_opening numeric;
  v_prior_credits numeric;
  v_prior_payments numeric;
  v_opening_running numeric;
begin
  if not is_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  select coalesce(cf.opening_balance, 0) into v_opening
  from customer_financials cf where cf.customer_id = p_customer_id;
  v_opening := coalesce(v_opening, 0);

  select coalesce(sum(cc.amount), 0) into v_prior_credits
  from customer_credits cc
  where cc.customer_id = p_customer_id and cc.date < p_from;

  select coalesce(sum(cp.amount), 0) into v_prior_payments
  from customer_payments cp
  where cp.customer_id = p_customer_id and cp.date < p_from;

  v_opening_running := v_opening + v_prior_credits - v_prior_payments;

  return query
  with entries as (
    select cc.id as e_id, cc.date as e_date, cc.created_at as sort_at, 'credit'::text as e_type,
           case when cc.invoice_id is not null then 'Invoice ' || inv.invoice_no
                else coalesce(nullif(cc.notes, ''), 'Credit given') end as e_ref,
           cc.amount as e_debit, 0::numeric as e_credit,
           cc.invoice_id as e_inv_id, inv.invoice_no as e_inv_no
    from customer_credits cc
    left join invoices inv on inv.id = cc.invoice_id
    where cc.customer_id = p_customer_id and cc.date between p_from and p_to
    union all
    select cp.id, cp.date, cp.created_at, 'payment'::text,
           case when cp.invoice_id is not null then 'Payment for ' || inv.invoice_no
                else coalesce(nullif(cp.notes, ''), 'Payment received') end,
           0::numeric, cp.amount,
           cp.invoice_id, inv.invoice_no
    from customer_payments cp
    left join invoices inv on inv.id = cp.invoice_id
    where cp.customer_id = p_customer_id and cp.date between p_from and p_to
  )
  select
    e.e_id, e.e_date, e.e_type, e.e_ref, e.e_debit, e.e_credit,
    v_opening_running + sum(e.e_debit - e.e_credit) over (
      order by e.e_date, e.sort_at rows between unbounded preceding and current row
    ) as running_balance,
    e.e_inv_id, e.e_inv_no
  from entries e
  order by e.e_date, e.sort_at;
end;
$$;

-- ── Guards on existing functions: invoice-owned rows are not editable ───
-- (bodies identical to before, plus the guard)

create or replace function update_customer_credit(p_credit_id uuid, p_date date, p_amount numeric, p_notes text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_owner() then
    raise exception 'only owner can edit customer credit' using errcode = '42501';
  end if;

  if exists (select 1 from customer_credits cc where cc.id = p_credit_id and cc.invoice_id is not null) then
    raise exception 'this entry belongs to a bill -- edit or delete the bill instead';
  end if;

  update customer_credits
  set date = p_date, amount = p_amount, notes = p_notes
  where id = p_credit_id;

  if not found then
    raise exception 'credit entry not found';
  end if;
end;
$$;

create or replace function update_customer_payment(p_payment_id uuid, p_date date, p_amount numeric, p_notes text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_owner() then
    raise exception 'only owner can edit customer payments' using errcode = '42501';
  end if;

  if exists (select 1 from customer_payments cp where cp.id = p_payment_id and cp.invoice_id is not null) then
    raise exception 'this entry belongs to a bill -- edit or delete the bill instead';
  end if;

  update customer_payments
  set date = p_date, amount = p_amount, notes = p_notes
  where id = p_payment_id;

  if not found then
    raise exception 'payment not found';
  end if;
end;
$$;

create or replace function delete_customer_credit(p_credit_id uuid, p_delete_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin jsonb;
begin
  if not is_owner() then
    raise exception 'only owner can delete customer credit' using errcode = '42501';
  end if;

  v_pin := check_delete_pin(p_delete_pin);
  if not (v_pin->>'ok')::boolean then
    return v_pin;
  end if;

  if exists (select 1 from customer_credits cc where cc.id = p_credit_id and cc.invoice_id is not null) then
    raise exception 'this entry belongs to a bill -- edit or delete the bill instead';
  end if;

  delete from customer_credits where id = p_credit_id;

  if not found then
    raise exception 'credit entry not found';
  end if;

  return v_pin;
end;
$$;

create or replace function delete_customer_payment(p_payment_id uuid, p_delete_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin jsonb;
begin
  if not is_owner() then
    raise exception 'only owner can delete customer payments' using errcode = '42501';
  end if;

  v_pin := check_delete_pin(p_delete_pin);
  if not (v_pin->>'ok')::boolean then
    return v_pin;
  end if;

  if exists (select 1 from customer_payments cp where cp.id = p_payment_id and cp.invoice_id is not null) then
    raise exception 'this entry belongs to a bill -- edit or delete the bill instead';
  end if;

  delete from customer_payments where id = p_payment_id;

  if not found then
    raise exception 'payment not found';
  end if;

  return v_pin;
end;
$$;

create or replace function update_stock_out(p_stock_out_id uuid, p_quantity numeric, p_unit_name text, p_date date)
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

  if exists (select 1 from stock_out so where so.id = p_stock_out_id and so.invoice_id is not null) then
    raise exception 'this stock-out belongs to a bill -- edit or delete the bill instead';
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

create or replace function delete_stock_out(p_stock_out_id uuid, p_delete_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin jsonb;
begin
  if not is_owner() then
    raise exception 'only owner can delete stock-out entries' using errcode = '42501';
  end if;

  v_pin := check_delete_pin(p_delete_pin);
  if not (v_pin->>'ok')::boolean then
    return v_pin;
  end if;

  if exists (select 1 from stock_out so where so.id = p_stock_out_id and so.invoice_id is not null) then
    raise exception 'this stock-out belongs to a bill -- edit or delete the bill instead';
  end if;

  if not exists (select 1 from stock_out where id = p_stock_out_id) then
    raise exception 'stock-out entry not found';
  end if;

  perform stock_out_reverse(p_stock_out_id);
  delete from stock_out where id = p_stock_out_id;

  return v_pin;
end;
$$;

-- ── Privileges ───────────────────────────────────────────────────────────
-- create function re-triggers this project's default privileges (anon
-- included): revoke from public AND anon explicitly.

revoke all on function invoice_next_no() from public, anon, authenticated;
revoke all on function invoice_prepare(jsonb, jsonb, numeric, uuid, numeric) from public, anon, authenticated;
revoke all on function invoice_shortages(jsonb, uuid) from public, anon, authenticated;
revoke all on function invoice_release(uuid) from public, anon, authenticated;
revoke all on function invoice_apply(uuid, text, jsonb, date, uuid) from public, anon, authenticated;

revoke all on function create_invoice(date, uuid, numeric, text, jsonb, jsonb, numeric, boolean, uuid) from public;
revoke all on function create_invoice(date, uuid, numeric, text, jsonb, jsonb, numeric, boolean, uuid) from anon;
grant execute on function create_invoice(date, uuid, numeric, text, jsonb, jsonb, numeric, boolean, uuid) to authenticated;

revoke all on function update_invoice(uuid, date, uuid, numeric, text, jsonb, jsonb, numeric, text, boolean) from public;
revoke all on function update_invoice(uuid, date, uuid, numeric, text, jsonb, jsonb, numeric, text, boolean) from anon;
grant execute on function update_invoice(uuid, date, uuid, numeric, text, jsonb, jsonb, numeric, text, boolean) to authenticated;

revoke all on function cancel_invoice(uuid, text) from public;
revoke all on function cancel_invoice(uuid, text) from anon;
grant execute on function cancel_invoice(uuid, text) to authenticated;

revoke all on function search_customers_basic(text) from public;
revoke all on function search_customers_basic(text) from anon;
grant execute on function search_customers_basic(text) to authenticated;

revoke all on function quick_add_customer(text, text) from public;
revoke all on function quick_add_customer(text, text) from anon;
grant execute on function quick_add_customer(text, text) to authenticated;

revoke all on function get_item_last_sale_price(uuid, text) from public;
revoke all on function get_item_last_sale_price(uuid, text) from anon;
grant execute on function get_item_last_sale_price(uuid, text) to authenticated;

revoke all on function get_customer_ledger(uuid, date, date) from public;
revoke all on function get_customer_ledger(uuid, date, date) from anon;
grant execute on function get_customer_ledger(uuid, date, date) to authenticated;

-- stock_out_apply_fefo is an internal helper of the stock-out / invoice
-- functions (security definer, no role check of its own); like
-- stock_out_reverse (0025) it should not be callable straight from the API.
revoke all on function stock_out_apply_fefo(uuid, uuid, numeric) from public, anon, authenticated;
