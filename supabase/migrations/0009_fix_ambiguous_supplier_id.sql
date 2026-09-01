-- New Kandy Essence: fix "column reference supplier_id is ambiguous".
-- Any function whose RETURNS TABLE includes a column literally named
-- supplier_id makes that name resolve to the PL/pgSQL OUT-parameter
-- everywhere in the function body, including inside subqueries -- so an
-- unqualified `supplier_id` in an internal subquery's SELECT/GROUP BY
-- collides with it. get_suppliers_period_summary hit this at runtime;
-- get_supplier_balances has the identical pattern and was latent (its
-- purchases subquery was reached in earlier lower-data testing without
-- surfacing the parse-time ambiguity check until re-verified here).
-- Fix: qualify every purchases.supplier_id / supplier_payments.supplier_id
-- reference with a table alias.

create or replace function get_supplier_balances()
returns table (
  supplier_id uuid,
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
    s.id,
    s.code,
    s.name,
    coalesce(sf.opening_balance, 0),
    coalesce(sf.opening_balance, 0) + coalesce(pur.total, 0) - coalesce(pay.total, 0)
  from suppliers s
  left join supplier_financials sf on sf.supplier_id = s.id
  left join (
    select p.supplier_id, sum(p.total_amount) as total
    from purchases p
    where p.payment_type in ('credit', 'cheque')
    group by p.supplier_id
  ) pur on pur.supplier_id = s.id
  left join (
    select sp.supplier_id, sum(sp.amount) as total
    from supplier_payments sp
    left join cheques c on c.id = sp.cheque_id
    where sp.payment_type = 'cash' or c.status <> 'bounced'
    group by sp.supplier_id
  ) pay on pay.supplier_id = s.id
  order by s.name;
end;
$$;

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
    select p.supplier_id, sum(p.total_amount) as total
    from purchases p
    where p.payment_type in ('credit', 'cheque') and p.date between p_from and p_to
    group by p.supplier_id
  ) pur on pur.supplier_id = s.id
  left join (
    select sp.supplier_id, sum(sp.amount) as total
    from supplier_payments sp
    left join cheques c on c.id = sp.cheque_id
    where (sp.payment_type = 'cash' or c.status <> 'bounced') and sp.date between p_from and p_to
    group by sp.supplier_id
  ) pay on pay.supplier_id = s.id
  left join (
    select p.supplier_id, sum(p.total_amount) as total
    from purchases p
    where p.payment_type in ('credit', 'cheque') and p.date <= p_to
    group by p.supplier_id
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
