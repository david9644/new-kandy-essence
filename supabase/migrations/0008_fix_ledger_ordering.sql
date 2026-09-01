-- New Kandy Essence: get_supplier_ledger ordered same-day entries by
-- entry_type ('payment' < 'purchase' alphabetically), not by when they
-- actually happened -- the final running balance was correct but the
-- intermediate trail was nonsense whenever a supplier had more than one
-- entry on the same date. Order by created_at instead.

create or replace function get_supplier_ledger(p_supplier_id uuid, p_from date, p_to date)
returns table (
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
    select p.date as entry_date, p.created_at as sort_at, 'purchase'::text as entry_type,
           'Purchase #' || p.purchase_no as reference,
           p.total_amount as debit, 0::numeric as credit
    from purchases p
    where p.supplier_id = p_supplier_id and p.payment_type in ('credit', 'cheque')
      and p.date between p_from and p_to
    union all
    select sp.date, sp.created_at, 'payment'::text,
           initcap(sp.payment_type::text) || ' payment',
           0::numeric, sp.amount
    from supplier_payments sp
    left join cheques c on c.id = sp.cheque_id
    where sp.supplier_id = p_supplier_id and (sp.payment_type = 'cash' or c.status <> 'bounced')
      and sp.date between p_from and p_to
  )
  select
    e.entry_date, e.entry_type, e.reference, e.debit, e.credit,
    v_opening_running + sum(e.debit - e.credit) over (
      order by e.entry_date, e.sort_at rows between unbounded preceding and current row
    ) as running_balance
  from entries e
  order by e.entry_date, e.sort_at;
end;
$$;
