-- New Kandy Essence: per-supplier purchases/payments/ending-balance for a
-- date range, used by the Supplier-wise Report. Same owner-only guard and
-- mixed-visibility-table reasoning as get_supplier_balances().

create or replace function get_suppliers_period_summary(p_from date, p_to date)
returns table (
  supplier_id uuid,
  code text,
  name text,
  purchases_total numeric,
  payments_total numeric,
  ending_balance numeric
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
    s.id,
    s.code,
    s.name,
    coalesce(pur.total, 0),
    coalesce(pay.total, 0),
    coalesce(sf.opening_balance, 0) + coalesce(pur_all.total, 0) - coalesce(pay_all.total, 0)
  from suppliers s
  left join supplier_financials sf on sf.supplier_id = s.id
  left join (
    select supplier_id, sum(total_amount) as total
    from purchases
    where payment_type in ('credit', 'cheque') and date between p_from and p_to
    group by supplier_id
  ) pur on pur.supplier_id = s.id
  left join (
    select sp.supplier_id, sum(sp.amount) as total
    from supplier_payments sp
    left join cheques c on c.id = sp.cheque_id
    where (sp.payment_type = 'cash' or c.status <> 'bounced') and sp.date between p_from and p_to
    group by sp.supplier_id
  ) pay on pay.supplier_id = s.id
  left join (
    select supplier_id, sum(total_amount) as total
    from purchases
    where payment_type in ('credit', 'cheque') and date <= p_to
    group by supplier_id
  ) pur_all on pur_all.supplier_id = s.id
  left join (
    select sp.supplier_id, sum(sp.amount) as total
    from supplier_payments sp
    left join cheques c on c.id = sp.cheque_id
    where (sp.payment_type = 'cash' or c.status <> 'bounced') and sp.date <= p_to
    group by sp.supplier_id
  ) pay_all on pay_all.supplier_id = s.id
  order by s.name;
end;
$$;

revoke all on function get_suppliers_period_summary(date, date) from public;
grant execute on function get_suppliers_period_summary(date, date) to authenticated;
revoke execute on function get_suppliers_period_summary(date, date) from anon;
