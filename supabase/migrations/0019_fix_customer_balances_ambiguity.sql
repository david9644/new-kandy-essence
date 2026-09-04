-- get_customer_balances()'s RETURNS TABLE declares an output column named
-- customer_id, which plpgsql treats as an in-scope variable. The credits/
-- payments subqueries then referenced a bare, unqualified customer_id in
-- their own select/group by, which collided with that variable ("column
-- reference \"customer_id\" is ambiguous", 42702). Qualifying those columns
-- with their table alias resolves it -- get_supplier_balances' analogous
-- "pay" subquery already does this; only its "pur" subquery happened to
-- read unambiguously because its column list has no exact-name collision
-- risk the same way once qualified here too, for consistency.

create or replace function get_customer_balances()
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
    select cc.customer_id, sum(cc.amount) as total
    from customer_credits cc
    group by cc.customer_id
  ) cr on cr.customer_id = c.id
  left join (
    select cp.customer_id, sum(cp.amount) as total
    from customer_payments cp
    group by cp.customer_id
  ) pay on pay.customer_id = c.id
  order by c.name;
end;
$$;
