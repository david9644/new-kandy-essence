-- New Kandy Essence: RLS enablement, role-check helpers, policies

-- is_owner() and current_role_or_raise() are SECURITY DEFINER so their internal
-- reads of `profiles` bypass RLS (they run as the function owner, which is not
-- subject to its own table's RLS) -- this avoids the classic recursive-RLS trap
-- where a policy on `profiles` would need to query `profiles` to evaluate itself.

create or replace function is_owner()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'owner' and active
  );
$$;

revoke all on function is_owner() from public;
grant execute on function is_owner() to authenticated;

create or replace function current_role_or_raise()
returns user_role
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role user_role;
begin
  select role into v_role from profiles where id = auth.uid() and active;
  if v_role is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return v_role;
end;
$$;

revoke all on function current_role_or_raise() from public;
grant execute on function current_role_or_raise() to authenticated;

-- ── profiles ─────────────────────────────────────────────────────────────

alter table profiles enable row level security;

create policy profiles_select on profiles
  for select to authenticated
  using (id = auth.uid() or is_owner());

create policy profiles_write on profiles
  for all to authenticated
  using (is_owner())
  with check (is_owner());

-- ── profile_credentials / login_attempts ────────────────────────────────
-- No policies at all: only the service-role client (login route, user-management
-- action, bootstrap script) touches these; it bypasses RLS entirely by design.

alter table profile_credentials enable row level security;
alter table login_attempts enable row level security;

-- ── simple masters: shared read, owner-only write ───────────────────────

alter table categories enable row level security;
create policy categories_select on categories for select to authenticated using (true);
create policy categories_write on categories for all to authenticated using (is_owner()) with check (is_owner());

alter table items enable row level security;
create policy items_select on items for select to authenticated using (true);
create policy items_write on items for all to authenticated using (is_owner()) with check (is_owner());

alter table item_units enable row level security;
create policy item_units_select on item_units for select to authenticated using (true);
create policy item_units_write on item_units for all to authenticated using (is_owner()) with check (is_owner());

alter table suppliers enable row level security;
create policy suppliers_select on suppliers for select to authenticated using (true);
create policy suppliers_write on suppliers for all to authenticated using (is_owner()) with check (is_owner());

alter table bank_accounts enable row level security;
create policy bank_accounts_select on bank_accounts for select to authenticated using (true);
create policy bank_accounts_write on bank_accounts for all to authenticated using (is_owner()) with check (is_owner());

-- ── owner-only financial tables ─────────────────────────────────────────

alter table supplier_financials enable row level security;
create policy supplier_financials_all on supplier_financials for all to authenticated using (is_owner()) with check (is_owner());

alter table cheques enable row level security;
create policy cheques_select on cheques for select to authenticated using (is_owner());
-- no insert/update/delete policy: writes only via SECURITY DEFINER RPCs

alter table supplier_payments enable row level security;
create policy supplier_payments_select on supplier_payments for select to authenticated using (is_owner());
-- no insert/update/delete policy: writes only via SECURITY DEFINER RPCs

-- ── shared-read, RPC-only-write transactional tables ────────────────────

alter table purchases enable row level security;
create policy purchases_select on purchases for select to authenticated using (true);

alter table purchase_items enable row level security;
create policy purchase_items_select on purchase_items for select to authenticated using (true);

alter table stock_batches enable row level security;
create policy stock_batches_select on stock_batches for select to authenticated using (true);

alter table opening_stock_entries enable row level security;
create policy opening_stock_entries_select on opening_stock_entries for select to authenticated using (true);

alter table stock_out enable row level security;
create policy stock_out_select on stock_out for select to authenticated using (true);

alter table stock_adjustments enable row level security;
create policy stock_adjustments_select on stock_adjustments for select to authenticated using (true);
