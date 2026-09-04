-- New Kandy Essence: Customer Credit -- a standalone, much simpler mirror of
-- the Supplier system for customers who buy on credit. No cheque/bank/
-- payment-type complexity, no linkage to items/stock/purchases: just a
-- name, credit given, payment received, and a running balance. Entirely
-- owner-only end to end (unlike suppliers, Store Keeper has no operational
-- need to see this), so there's no shared-read policy or role branching
-- anywhere in this feature.

-- ── Tables ───────────────────────────────────────────────────────────────

create table customers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  contact text,
  active boolean not null default true,
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table customer_financials (
  customer_id uuid primary key references customers(id) on delete cascade,
  opening_balance numeric not null default 0,
  updated_at timestamptz not null default now()
);

-- Credit given to the customer -- increases what they owe.
create table customer_credits (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  date date not null default current_date,
  amount numeric not null check (amount > 0),
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- A payment received from the customer -- decreases what they owe.
create table customer_payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  date date not null default current_date,
  amount numeric not null check (amount > 0),
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index customers_name_trgm_idx on customers using gin (name extensions.gin_trgm_ops);
create index customers_code_trgm_idx on customers using gin (code extensions.gin_trgm_ops);
create index customer_credits_customer_idx on customer_credits (customer_id);
create index customer_payments_customer_idx on customer_payments (customer_id);

-- ── Auto-generated code, mirroring set_supplier_code() exactly ─────────────

create sequence customers_code_seq start 1;

create function set_customer_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'CUS-' || lpad(nextval('customers_code_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger customers_set_code
before insert on customers
for each row execute function set_customer_code();

create trigger customers_touch_updated_at before update on customers for each row execute function touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
-- customers/customer_financials are a simple master (same shape as
-- suppliers/supplier_financials) -- direct RLS-gated writes, no RPC needed
-- since there's no cross-table invariant to protect. customer_credits/
-- customer_payments follow the supplier_payments pattern instead: select
-- only, writes exclusively through the SECURITY DEFINER RPCs below.

alter table customers enable row level security;
create policy customers_select on customers for select to authenticated using ((select is_owner()));
create policy customers_insert on customers for insert to authenticated with check ((select is_owner()));
create policy customers_update on customers for update to authenticated using ((select is_owner())) with check ((select is_owner()));
create policy customers_delete on customers for delete to authenticated using ((select is_owner()));

alter table customer_financials enable row level security;
create policy customer_financials_all on customer_financials for all to authenticated
  using ((select is_owner())) with check ((select is_owner()));

alter table customer_credits enable row level security;
create policy customer_credits_select on customer_credits for select to authenticated using ((select is_owner()));

alter table customer_payments enable row level security;
create policy customer_payments_select on customer_payments for select to authenticated using ((select is_owner()));

-- ── RPCs ─────────────────────────────────────────────────────────────────

create function create_customer_credit(
  p_customer_id uuid,
  p_date date,
  p_amount numeric,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credit_id uuid;
begin
  if not is_owner() then
    raise exception 'only owner can record customer credit' using errcode = '42501';
  end if;

  insert into customer_credits (customer_id, date, amount, notes, created_by)
  values (p_customer_id, p_date, p_amount, p_notes, auth.uid())
  returning id into v_credit_id;

  return v_credit_id;
end;
$$;

create function update_customer_credit(
  p_credit_id uuid,
  p_date date,
  p_amount numeric,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_owner() then
    raise exception 'only owner can edit customer credit' using errcode = '42501';
  end if;

  update customer_credits
  set date = p_date, amount = p_amount, notes = p_notes
  where id = p_credit_id;

  if not found then
    raise exception 'credit entry not found';
  end if;
end;
$$;

create function delete_customer_credit(p_credit_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_owner() then
    raise exception 'only owner can delete customer credit' using errcode = '42501';
  end if;

  delete from customer_credits where id = p_credit_id;

  if not found then
    raise exception 'credit entry not found';
  end if;
end;
$$;

create function create_customer_payment(
  p_customer_id uuid,
  p_date date,
  p_amount numeric,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
begin
  if not is_owner() then
    raise exception 'only owner can record customer payments' using errcode = '42501';
  end if;

  insert into customer_payments (customer_id, date, amount, notes, created_by)
  values (p_customer_id, p_date, p_amount, p_notes, auth.uid())
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;

create function update_customer_payment(
  p_payment_id uuid,
  p_date date,
  p_amount numeric,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_owner() then
    raise exception 'only owner can edit customer payments' using errcode = '42501';
  end if;

  update customer_payments
  set date = p_date, amount = p_amount, notes = p_notes
  where id = p_payment_id;

  if not found then
    raise exception 'payment not found';
  end if;
end;
$$;

create function delete_customer_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_owner() then
    raise exception 'only owner can delete customer payments' using errcode = '42501';
  end if;

  delete from customer_payments where id = p_payment_id;

  if not found then
    raise exception 'payment not found';
  end if;
end;
$$;

-- ── Balances / ledger (owner-only reads, same shape as the supplier ones) ──

create function get_customer_balances()
returns table (
  customer_id uuid,
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
    c.id,
    c.code,
    c.name,
    coalesce(cf.opening_balance, 0),
    coalesce(cf.opening_balance, 0) + coalesce(cr.total, 0) - coalesce(pay.total, 0)
  from customers c
  left join customer_financials cf on cf.customer_id = c.id
  left join (
    select customer_id, sum(amount) as total
    from customer_credits
    group by customer_id
  ) cr on cr.customer_id = c.id
  left join (
    select customer_id, sum(amount) as total
    from customer_payments
    group by customer_id
  ) pay on pay.customer_id = c.id
  order by c.name;
end;
$$;

create function get_customer_balance(p_customer_id uuid)
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
    coalesce(cf.opening_balance, 0) + coalesce(cr.total, 0) - coalesce(pay.total, 0)
  into v_balance
  from customers c
  left join customer_financials cf on cf.customer_id = c.id
  left join (
    select customer_id, sum(amount) as total
    from customer_credits
    where customer_id = p_customer_id
    group by customer_id
  ) cr on cr.customer_id = c.id
  left join (
    select customer_id, sum(amount) as total
    from customer_payments
    where customer_id = p_customer_id
    group by customer_id
  ) pay on pay.customer_id = c.id
  where c.id = p_customer_id;

  return coalesce(v_balance, 0);
end;
$$;

create function get_customer_ledger(p_customer_id uuid, p_from date, p_to date)
returns table (
  entry_id uuid,
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
  v_prior_credits numeric;
  v_prior_payments numeric;
  v_opening_running numeric;
begin
  if not is_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  select coalesce(opening_balance, 0) into v_opening
  from customer_financials where customer_id = p_customer_id;
  v_opening := coalesce(v_opening, 0);

  select coalesce(sum(amount), 0) into v_prior_credits
  from customer_credits
  where customer_id = p_customer_id and date < p_from;

  select coalesce(sum(amount), 0) into v_prior_payments
  from customer_payments
  where customer_id = p_customer_id and date < p_from;

  v_opening_running := v_opening + v_prior_credits - v_prior_payments;

  return query
  with entries as (
    select cc.id as entry_id, cc.date as entry_date, cc.created_at as sort_at, 'credit'::text as entry_type,
           coalesce(nullif(cc.notes, ''), 'Credit given') as reference,
           cc.amount as debit, 0::numeric as credit
    from customer_credits cc
    where cc.customer_id = p_customer_id and cc.date between p_from and p_to
    union all
    select cp.id, cp.date, cp.created_at, 'payment'::text,
           coalesce(nullif(cp.notes, ''), 'Payment received'),
           0::numeric, cp.amount
    from customer_payments cp
    where cp.customer_id = p_customer_id and cp.date between p_from and p_to
  )
  select
    e.entry_id, e.entry_date, e.entry_type, e.reference, e.debit, e.credit,
    v_opening_running + sum(e.debit - e.credit) over (
      order by e.entry_date, e.sort_at rows between unbounded preceding and current row
    ) as running_balance
  from entries e
  order by e.entry_date, e.sort_at;
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────
-- New functions default to PUBLIC + anon execute in this project -- close
-- both explicitly and grant only authenticated, matching every other RPC.

revoke all on function create_customer_credit(uuid, date, numeric, text) from public;
revoke all on function update_customer_credit(uuid, date, numeric, text) from public;
revoke all on function delete_customer_credit(uuid) from public;
revoke all on function create_customer_payment(uuid, date, numeric, text) from public;
revoke all on function update_customer_payment(uuid, date, numeric, text) from public;
revoke all on function delete_customer_payment(uuid) from public;
revoke all on function get_customer_balances() from public;
revoke all on function get_customer_balance(uuid) from public;
revoke all on function get_customer_ledger(uuid, date, date) from public;

revoke all on function create_customer_credit(uuid, date, numeric, text) from anon;
revoke all on function update_customer_credit(uuid, date, numeric, text) from anon;
revoke all on function delete_customer_credit(uuid) from anon;
revoke all on function create_customer_payment(uuid, date, numeric, text) from anon;
revoke all on function update_customer_payment(uuid, date, numeric, text) from anon;
revoke all on function delete_customer_payment(uuid) from anon;
revoke all on function get_customer_balances() from anon;
revoke all on function get_customer_balance(uuid) from anon;
revoke all on function get_customer_ledger(uuid, date, date) from anon;

grant execute on function create_customer_credit(uuid, date, numeric, text) to authenticated;
grant execute on function update_customer_credit(uuid, date, numeric, text) to authenticated;
grant execute on function delete_customer_credit(uuid) to authenticated;
grant execute on function create_customer_payment(uuid, date, numeric, text) to authenticated;
grant execute on function update_customer_payment(uuid, date, numeric, text) to authenticated;
grant execute on function delete_customer_payment(uuid) to authenticated;
grant execute on function get_customer_balances() to authenticated;
grant execute on function get_customer_balance(uuid) to authenticated;
grant execute on function get_customer_ledger(uuid, date, date) to authenticated;
