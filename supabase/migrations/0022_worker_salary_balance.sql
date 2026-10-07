-- New Kandy Essence: Workers -- running salary balance.
--
-- Rules (decided with the owner):
--   * Salary accrues monthly: every calendar month from the worker's salary
--     start month up to and including the current month (Asia/Colombo), the
--     full monthly_salary is added to "total due".
--   * A payment counts toward the calendar month of its own date -- not the
--     free-text salary_payments.period (kept for old rows, no longer used).
--   * Unpaid amounts carry over: balance = total due - total paid, as one
--     running figure. A negative balance is an advance (overpayment).
--   * When a worker is deactivated, salary_end_date is set (by the
--     setWorkerActive server action) so accrual stops after that month.
--
-- All three functions are owner-only SECURITY DEFINER reads, same pattern
-- as the customer functions in 0018_customer_credit.sql.

-- ── Columns ──────────────────────────────────────────────────────────────

alter table workers
  add column salary_start_date date,
  add column salary_end_date date;

update workers
set salary_start_date = date_trunc('month', created_at at time zone 'Asia/Colombo')::date
where salary_start_date is null;

-- ── Per-month breakdown ──────────────────────────────────────────────────
-- One row per calendar month from LEAST(start month, earliest payment month)
-- to the current month (or the end month once the worker is deactivated).
-- A payment dated after the accrual window still gets its own row, so it
-- reduces the balance instead of being silently dropped -- salary for such
-- a month is 0.
--
-- Output column names (month, salary, paid, running_balance) are plpgsql
-- variables inside this function, so every column reference below is
-- table-qualified or uses an alias to avoid the 42702 ambiguity that bit
-- get_customer_balances (see 0019).

create function get_worker_monthly_breakdown(p_worker_id uuid)
returns table (
  month date,
  salary numeric,
  paid numeric,
  running_balance numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_salary numeric;
  v_start date;
  v_end date;
  v_cur date := date_trunc('month', now() at time zone 'Asia/Colombo')::date;
  v_first_pay date;
  v_last_pay date;
  v_series_start date;
  v_accrual_end date;
  v_series_end date;
begin
  if not is_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  select
    w.monthly_salary,
    date_trunc('month', coalesce(w.salary_start_date, (w.created_at at time zone 'Asia/Colombo')::date)::timestamp)::date,
    case when w.salary_end_date is null then null
         else date_trunc('month', w.salary_end_date::timestamp)::date end
  into v_salary, v_start, v_end
  from workers w
  where w.id = p_worker_id;

  if not found then
    return;
  end if;

  select
    date_trunc('month', min(sp.date)::timestamp)::date,
    date_trunc('month', max(sp.date)::timestamp)::date
  into v_first_pay, v_last_pay
  from salary_payments sp
  where sp.worker_id = p_worker_id;

  v_accrual_end := least(coalesce(v_end, v_cur), v_cur);
  v_series_start := least(v_start, coalesce(v_first_pay, v_start));
  v_series_end := greatest(v_accrual_end, coalesce(v_last_pay, v_accrual_end));

  return query
  with months as (
    select gs::date as m
    from generate_series(v_series_start::timestamp, v_series_end::timestamp, interval '1 month') gs
  ),
  paid_by_month as (
    select date_trunc('month', sp.date::timestamp)::date as m, sum(sp.amount) as total
    from salary_payments sp
    where sp.worker_id = p_worker_id
    group by 1
  ),
  monthly as (
    select
      mo.m as m,
      case when v_salary is not null and mo.m >= v_start and mo.m <= v_accrual_end
           then v_salary else 0::numeric end as sal,
      coalesce(pb.total, 0::numeric) as pd
    from months mo
    left join paid_by_month pb on pb.m = mo.m
  )
  select
    mm.m,
    mm.sal,
    mm.pd,
    sum(mm.sal - mm.pd) over (order by mm.m rows between unbounded preceding and current row)
  from monthly mm
  order by mm.m;
end;
$$;

-- ── Single worker balance (final running balance) ────────────────────────

create function get_worker_balance(p_worker_id uuid)
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

  select b.running_balance
  into v_balance
  from get_worker_monthly_breakdown(p_worker_id) b
  order by b.month desc
  limit 1;

  return coalesce(v_balance, 0);
end;
$$;

-- ── All workers' balances, for the list page ─────────────────────────────
-- Same result as get_worker_balance for each worker, computed set-based:
-- (months in [start month, accrual end month]) * monthly_salary - total paid.

create function get_worker_balances()
returns table (
  worker_id uuid,
  balance numeric
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_cur date := date_trunc('month', now() at time zone 'Asia/Colombo')::date;
begin
  if not is_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  return query
  select
    w.id,
    greatest(
      0,
      (extract(year from ae.accrual_end)::int * 12 + extract(month from ae.accrual_end)::int)
      - (extract(year from ae.start_month)::int * 12 + extract(month from ae.start_month)::int)
      + 1
    ) * coalesce(w.monthly_salary, 0::numeric)
    - coalesce(pay.total, 0::numeric)
  from workers w
  cross join lateral (
    select
      date_trunc('month', coalesce(w.salary_start_date, (w.created_at at time zone 'Asia/Colombo')::date)::timestamp)::date as start_month,
      least(
        coalesce(date_trunc('month', w.salary_end_date::timestamp)::date, v_cur),
        v_cur
      ) as accrual_end
  ) ae
  left join (
    select sp.worker_id as wid, sum(sp.amount) as total
    from salary_payments sp
    group by sp.worker_id
  ) pay on pay.wid = w.id
  order by w.name;
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────

revoke all on function get_worker_monthly_breakdown(uuid) from public;
revoke all on function get_worker_balance(uuid) from public;
revoke all on function get_worker_balances() from public;

revoke all on function get_worker_monthly_breakdown(uuid) from anon;
revoke all on function get_worker_balance(uuid) from anon;
revoke all on function get_worker_balances() from anon;

grant execute on function get_worker_monthly_breakdown(uuid) to authenticated;
grant execute on function get_worker_balance(uuid) to authenticated;
grant execute on function get_worker_balances() to authenticated;
