-- New Kandy Essence: show CASH purchases in the supplier ledger as
-- information only.
--
-- Cash purchases are paid on the spot, so they never belonged in the
-- balance and still don't: they come back as extra rows with
-- entry_type = 'cash_purchase' and debit = credit = 0. Because those rows
-- add 0 to the running sum, every running_balance, the opening running
-- balance and every total are exactly what they were before.
--
-- The cash purchase's real amount comes back in a new column, info_amount
-- (null on every other row), so the UI can show it without it ever being
-- read as money owed. Everything else is get_supplier_ledger from 0016.

drop function if exists get_supplier_ledger(uuid, date, date);

create function get_supplier_ledger(p_supplier_id uuid, p_from date, p_to date)
returns table (
  entry_id uuid,
  entry_date date,
  entry_type text,
  reference text,
  debit numeric,
  credit numeric,
  running_balance numeric,
  info_amount numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_opening numeric;
  v_prior_purchases numeric;
  v_prior_payments numeric;
  v_opening_running numeric;
begin
  if not is_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  select coalesce(opening_balance, 0) into v_opening
  from supplier_financials where supplier_id = p_supplier_id;
  v_opening := coalesce(v_opening, 0);

  select coalesce(sum(total_amount), 0) into v_prior_purchases
  from purchases
  where supplier_id = p_supplier_id and payment_type in ('credit', 'cheque') and date < p_from;

  select coalesce(sum(sp.amount), 0) into v_prior_payments
  from supplier_payments sp
  left join cheques c on c.id = sp.cheque_id
  where sp.supplier_id = p_supplier_id and (sp.payment_type = 'cash' or c.status <> 'bounced') and sp.date < p_from;

  v_opening_running := v_opening + v_prior_purchases - v_prior_payments;

  return query
  with entries as (
    select p.id as entry_id, p.date as entry_date, p.created_at as sort_at, 'purchase'::text as entry_type,
           'Purchase #' || p.purchase_no as reference,
           p.total_amount as debit, 0::numeric as credit, null::numeric as info_amount
    from purchases p
    where p.supplier_id = p_supplier_id and p.payment_type in ('credit', 'cheque')
      and p.date between p_from and p_to
    union all
    select sp.id, sp.date, sp.created_at, 'payment'::text,
           initcap(sp.payment_type::text) || ' payment',
           0::numeric, sp.amount, null::numeric
    from supplier_payments sp
    left join cheques c on c.id = sp.cheque_id
    where sp.supplier_id = p_supplier_id and (sp.payment_type = 'cash' or c.status <> 'bounced')
      and sp.date between p_from and p_to
    union all
    select p.id, p.date, p.created_at, 'cash_purchase'::text,
           'Purchase #' || p.purchase_no || ' (Cash)',
           0::numeric, 0::numeric, p.total_amount
    from purchases p
    where p.supplier_id = p_supplier_id and p.payment_type = 'cash'
      and p.date between p_from and p_to
  )
  select
    e.entry_id, e.entry_date, e.entry_type, e.reference, e.debit, e.credit,
    v_opening_running + sum(e.debit - e.credit) over (
      order by e.entry_date, e.sort_at rows between unbounded preceding and current row
    ) as running_balance,
    e.info_amount
  from entries e
  order by e.entry_date, e.sort_at;
end;
$$;

-- create function (not create or replace) re-triggers this project's
-- default privileges for newly created functions, which include anon --
-- explicitly revoke it and re-apply the authenticated-only grant.
revoke all on function get_supplier_ledger(uuid, date, date) from public;
revoke all on function get_supplier_ledger(uuid, date, date) from anon;
grant execute on function get_supplier_ledger(uuid, date, date) to authenticated;
