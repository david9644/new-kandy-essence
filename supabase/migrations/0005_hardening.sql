-- New Kandy Essence: advisor-driven hardening pass
-- 1) anon had EXECUTE on every RPC via Supabase's default per-role privilege
--    grants (separate from the PUBLIC pseudo-role revoke already applied) --
--    close that so only authenticated sessions can call them.
-- 2) trigger functions missing an explicit search_path.
-- 3) pg_trgm relocated out of public into a dedicated extensions schema.
-- 4) RLS auth calls wrapped in (select ...) so Postgres evaluates them once
--    per query instead of once per row.
-- 5) "for all" write policies split into insert/update/delete so they stop
--    doubling up with each table's dedicated select policy.
-- 6) a handful of genuinely-useful missing FK indexes.

-- ── 1) close anon access to RPCs ────────────────────────────────────────

revoke execute on function is_owner() from anon;
revoke execute on function current_role_or_raise() from anon;
revoke execute on function create_purchase(uuid, date, purchase_payment_type, text, text, jsonb, jsonb) from anon;
revoke execute on function update_purchase_header(uuid, date, text, text) from anon;
revoke execute on function delete_purchase(uuid) from anon;
revoke execute on function create_opening_stock(uuid, text, date, numeric, text, numeric, text) from anon;
revoke execute on function create_stock_out(uuid, uuid, numeric, text, date) from anon;
revoke execute on function create_stock_adjustment(uuid, uuid, numeric, text, date) from anon;
revoke execute on function create_supplier_payment(uuid, date, numeric, payment_method, jsonb, text) from anon;
revoke execute on function update_cheque_status(uuid, cheque_status) from anon;
revoke execute on function get_supplier_balances() from anon;
revoke execute on function get_supplier_balance(uuid) from anon;
revoke execute on function get_supplier_ledger(uuid, date, date) from anon;

-- ── 2) explicit search_path on trigger functions ────────────────────────

create or replace function set_item_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'NKE-' || lpad(nextval('items_code_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create or replace function set_supplier_code()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'SUP-' || lpad(nextval('suppliers_code_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create or replace function touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── 3) move pg_trgm out of public ────────────────────────────────────────

drop index items_name_trgm_idx;
drop index items_code_trgm_idx;
drop index suppliers_name_trgm_idx;
drop index suppliers_code_trgm_idx;
drop extension pg_trgm;

create schema if not exists extensions;
create extension pg_trgm with schema extensions;

create index items_name_trgm_idx on items using gin (name extensions.gin_trgm_ops);
create index items_code_trgm_idx on items using gin (code extensions.gin_trgm_ops);
create index suppliers_name_trgm_idx on suppliers using gin (name extensions.gin_trgm_ops);
create index suppliers_code_trgm_idx on suppliers using gin (code extensions.gin_trgm_ops);

-- ── 4) + 5) rewrite RLS policies: (select ...) initplan + split for-all ──

drop policy profiles_select on profiles;
drop policy profiles_write on profiles;
create policy profiles_select on profiles for select to authenticated
  using (id = (select auth.uid()) or (select is_owner()));
create policy profiles_insert on profiles for insert to authenticated
  with check ((select is_owner()));
create policy profiles_update on profiles for update to authenticated
  using ((select is_owner())) with check ((select is_owner()));
create policy profiles_delete on profiles for delete to authenticated
  using ((select is_owner()));

drop policy categories_write on categories;
create policy categories_insert on categories for insert to authenticated with check ((select is_owner()));
create policy categories_update on categories for update to authenticated using ((select is_owner())) with check ((select is_owner()));
create policy categories_delete on categories for delete to authenticated using ((select is_owner()));

drop policy items_write on items;
create policy items_insert on items for insert to authenticated with check ((select is_owner()));
create policy items_update on items for update to authenticated using ((select is_owner())) with check ((select is_owner()));
create policy items_delete on items for delete to authenticated using ((select is_owner()));

drop policy item_units_write on item_units;
create policy item_units_insert on item_units for insert to authenticated with check ((select is_owner()));
create policy item_units_update on item_units for update to authenticated using ((select is_owner())) with check ((select is_owner()));
create policy item_units_delete on item_units for delete to authenticated using ((select is_owner()));

drop policy suppliers_write on suppliers;
create policy suppliers_insert on suppliers for insert to authenticated with check ((select is_owner()));
create policy suppliers_update on suppliers for update to authenticated using ((select is_owner())) with check ((select is_owner()));
create policy suppliers_delete on suppliers for delete to authenticated using ((select is_owner()));

drop policy bank_accounts_write on bank_accounts;
create policy bank_accounts_insert on bank_accounts for insert to authenticated with check ((select is_owner()));
create policy bank_accounts_update on bank_accounts for update to authenticated using ((select is_owner())) with check ((select is_owner()));
create policy bank_accounts_delete on bank_accounts for delete to authenticated using ((select is_owner()));

drop policy supplier_financials_all on supplier_financials;
create policy supplier_financials_all on supplier_financials for all to authenticated
  using ((select is_owner())) with check ((select is_owner()));

drop policy cheques_select on cheques;
create policy cheques_select on cheques for select to authenticated using ((select is_owner()));

drop policy supplier_payments_select on supplier_payments;
create policy supplier_payments_select on supplier_payments for select to authenticated using ((select is_owner()));

-- ── 6) missing FK indexes worth having ───────────────────────────────────

create index items_category_idx on items (category_id);
create index purchases_cheque_idx on purchases (cheque_id);
create index purchase_items_stock_batch_idx on purchase_items (stock_batch_id);
create index opening_stock_entries_item_idx on opening_stock_entries (item_id);
create index opening_stock_entries_stock_batch_idx on opening_stock_entries (stock_batch_id);
create index stock_out_stock_batch_idx on stock_out (stock_batch_id);
create index stock_adjustments_stock_batch_idx on stock_adjustments (stock_batch_id);
