-- New Kandy Essence: App Settings -- a single configurable row, starting
-- with a Daily Cheque Limit used as a non-blocking cash-flow safety check
-- when entering a cheque (from either Purchase Entry or Payment Entry).
-- 0 means "no limit set", and the check is skipped entirely in that case.
--
-- Unlike every other owner-only table in this app, app_settings and
-- get_cheques_total_for_date are readable by BOTH roles: cheque-fields.tsx
-- (the component this powers) is shared by Purchase Entry, which a Store
-- Keeper can also reach when entering a cheque-type purchase, so the
-- warning needs to work for them too. Only the ability to change the
-- limit itself stays owner-only, via the update policy.

create table app_settings (
  id boolean primary key default true check (id),
  daily_cheque_limit numeric not null default 0
);

insert into app_settings (id, daily_cheque_limit) values (true, 0);

alter table app_settings enable row level security;
create policy app_settings_select on app_settings for select to authenticated using (true);
create policy app_settings_update on app_settings for update to authenticated
  using ((select is_owner())) with check ((select is_owner()));

-- Sum across all cheques for one date, regardless of source (purchase or
-- payment) -- SECURITY DEFINER so it can read the (owner-only-SELECT)
-- cheques table, but deliberately not owner-gated itself: it only ever
-- returns an aggregate total, never cheque-level detail, so it's safe to
-- expose to a Store Keeper entering a cheque-type purchase.
create function get_cheques_total_for_date(p_date date)
returns numeric
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(sum(amount), 0) from cheques where cheque_date = p_date;
$$;

revoke all on function get_cheques_total_for_date(date) from public;
revoke all on function get_cheques_total_for_date(date) from anon;
grant execute on function get_cheques_total_for_date(date) to authenticated;
