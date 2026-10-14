-- New Kandy Essence: Workers -- salary now accrues on the LAST DAY of each
-- month (Asia/Colombo), not from the 1st.
--
-- Rule for the last month that accrues salary ("accrual_end"):
--   * Deactivated worker (salary_end_date set): the end date's month, counted
--     in full -- unchanged.
--   * Active worker: the current month once today is the last day of it (or
--     later), otherwise the previous month -- the current month is not added
--     yet.
--   * Never later than the current month. Months before accrual_end still
--     count the full monthly_salary each.
--
-- CREATE OR REPLACE keeps the existing signatures and the grants from 0022.
-- Column references stay table-qualified/aliased (the 42702 lesson, 0019).

-- ── Per-month breakdown ──────────────────────────────────────────────────
-- An active worker's current month always gets a row, even while its salary
-- is not yet accrued (salary 0, paid = whatever was paid in it), so a
-- mid-month advance is visible as a negative running balance.

create or replace function get_worker_monthly_breakdown(p_worker_id uuid)
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
  v_today date := (now() at time zone 'Asia/Colombo')::date;
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

  v_accrual_end := case
    when v_end is not null then least(v_end, v_cur)
    when v_today >= (v_cur + interval '1 month' - interval '1 day')::date then v_cur
    else (v_cur - interval '1 month')::date
  end;

  v_series_start := least(v_start, coalesce(v_first_pay, v_start));
  v_series_end := greatest(
    v_accrual_end,
    coalesce(v_last_pay, v_accrual_end),
    case when v_end is null then v_cur else v_accrual_end end
  );

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

create or replace function get_worker_balance(p_worker_id uuid)
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
-- Must equal get_worker_balance() for every worker: accrued months (start
-- month through accrual_end, inclusive, floored at 0) * monthly_salary,
-- minus everything paid.

create or replace function get_worker_balances()
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
  v_today date := (now() at time zone 'Asia/Colombo')::date;
  v_cur date := date_trunc('month', now() at time zone 'Asia/Colombo')::date;
  v_active_accrual_end date;
begin
  if not is_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  v_active_accrual_end := case
    when v_today >= (v_cur + interval '1 month' - interval '1 day')::date then v_cur
    else (v_cur - interval '1 month')::date
  end;

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
      case
        when w.salary_end_date is not null
          then least(date_trunc('month', w.salary_end_date::timestamp)::date, v_cur)
        else v_active_accrual_end
      end as accrual_end
  ) ae
  left join (
    select sp.worker_id as wid, sum(sp.amount) as total
    from salary_payments sp
    group by sp.worker_id
  ) pay on pay.wid = w.id
  order by w.name;
end;
$$;
