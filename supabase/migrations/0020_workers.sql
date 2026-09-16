-- New Kandy Essence: Workers -- salary payments to shop staff, entirely
-- separate from profiles (system login accounts) and suppliers. No system
-- login is implied by a worker record at all. Owner-only end to end, same
-- as Customer Credit: no shared-read policy or role branching anywhere.
--
-- workers/its master fields follow the same "simple master table" shape as
-- customers/suppliers -- direct RLS-gated writes via Server Actions, no RPC,
-- since there's no cross-table invariant to protect (create_worker,
-- update_worker, set_worker_active are therefore NOT SQL RPCs here, mirroring
-- how the equivalent customer operations actually work in this codebase).
-- salary_payments follows the supplier_payments/customer_credits pattern
-- instead: select-only RLS, writes exclusively through the SECURITY DEFINER
-- RPCs below.

-- ── Tables ───────────────────────────────────────────────────────────────

create table workers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  contact text,
  position text,
  monthly_salary numeric,
  active boolean not null default true,
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table salary_payments (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id),
  date date not null default current_date,
  amount numeric not null check (amount > 0),
  period text,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index workers_name_trgm_idx on workers using gin (name extensions.gin_trgm_ops);
create index workers_code_trgm_idx on workers using gin (code extensions.gin_trgm_ops);
create index salary_payments_worker_idx on salary_payments (worker_id);

-- ── Auto-generated code, mirroring set_supplier_code() exactly ─────────────

create sequence workers_code_seq start 1;

create function set_worker_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'WRK-' || lpad(nextval('workers_code_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger workers_set_code
before insert on workers
for each row execute function set_worker_code();

create trigger workers_touch_updated_at before update on workers for each row execute function touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table workers enable row level security;
create policy workers_select on workers for select to authenticated using ((select is_owner()));
create policy workers_insert on workers for insert to authenticated with check ((select is_owner()));
create policy workers_update on workers for update to authenticated using ((select is_owner())) with check ((select is_owner()));
create policy workers_delete on workers for delete to authenticated using ((select is_owner()));

alter table salary_payments enable row level security;
create policy salary_payments_select on salary_payments for select to authenticated using ((select is_owner()));

-- ── RPCs ─────────────────────────────────────────────────────────────────

create function create_salary_payment(
  p_worker_id uuid,
  p_date date,
  p_amount numeric,
  p_period text,
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
    raise exception 'only owner can record salary payments' using errcode = '42501';
  end if;

  insert into salary_payments (worker_id, date, amount, period, notes, created_by)
  values (p_worker_id, p_date, p_amount, p_period, p_notes, auth.uid())
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;

create function update_salary_payment(
  p_payment_id uuid,
  p_date date,
  p_amount numeric,
  p_period text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_owner() then
    raise exception 'only owner can edit salary payments' using errcode = '42501';
  end if;

  update salary_payments
  set date = p_date, amount = p_amount, period = p_period, notes = p_notes
  where id = p_payment_id;

  if not found then
    raise exception 'salary payment not found';
  end if;
end;
$$;

create function delete_salary_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_owner() then
    raise exception 'only owner can delete salary payments' using errcode = '42501';
  end if;

  delete from salary_payments where id = p_payment_id;

  if not found then
    raise exception 'salary payment not found';
  end if;
end;
$$;

-- Newest first, all payments for the one worker -- the page sums the
-- current-year subset itself for the "Total Paid This Year" tile, the same
-- in-memory-reduce pattern already used for the customer feature's
-- "Total Credit Given" tile.
create function get_worker_payment_history(p_worker_id uuid)
returns table (
  id uuid,
  date date,
  period text,
  amount numeric,
  notes text
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
  select sp.id, sp.date, sp.period, sp.amount, sp.notes
  from salary_payments sp
  where sp.worker_id = p_worker_id
  order by sp.date desc, sp.created_at desc;
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────
-- New functions default to PUBLIC + anon execute in this project -- close
-- both explicitly and grant only authenticated, matching every other RPC.

revoke all on function create_salary_payment(uuid, date, numeric, text, text) from public;
revoke all on function update_salary_payment(uuid, date, numeric, text, text) from public;
revoke all on function delete_salary_payment(uuid) from public;
revoke all on function get_worker_payment_history(uuid) from public;

revoke all on function create_salary_payment(uuid, date, numeric, text, text) from anon;
revoke all on function update_salary_payment(uuid, date, numeric, text, text) from anon;
revoke all on function delete_salary_payment(uuid) from anon;
revoke all on function get_worker_payment_history(uuid) from anon;

grant execute on function create_salary_payment(uuid, date, numeric, text, text) to authenticated;
grant execute on function update_salary_payment(uuid, date, numeric, text, text) to authenticated;
grant execute on function delete_salary_payment(uuid) to authenticated;
grant execute on function get_worker_payment_history(uuid) to authenticated;
