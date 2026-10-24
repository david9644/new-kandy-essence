-- New Kandy Essence: one selling price per item, entered anywhere, with history.
--
-- 1. The till takes a price ONLY from the item's own default selling price
--    (items.sale_price x the unit's conversion factor). The "last billed price"
--    logic is gone from get_billing_shelf, and get_item_last_sale_price is
--    dropped (nothing uses it any more): a customer's discount price must never
--    become the next customer's price.
-- 2. get_billing_shelf() also returns sold_90d (non-deleted bill lines for the
--    item in the last 90 days, Sri Lanka date) and returns the items most-sold
--    first, then by name. Item keys: id, code, name, category_id, base_unit,
--    stock, sold_90d, units; unit keys: unit_name, factor, price. Still no cost
--    data of any kind.
-- 3. item_price_history + set_item_sale_price(): the ONE function every screen
--    (item form, price list, purchase form) uses to change a selling price.
--    Owner only, re-validated here (empty or >= 0), writes the history row in
--    the same transaction. History is readable by the owner only.
-- 4. get_item_price_list(): server-side paging/search/filter/sort for the
--    owner's price list screen (no cost columns).

-- ── 1 + 2: the shelf ─────────────────────────────────────────────────────

create or replace function get_billing_shelf()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform current_role_or_raise();

  return jsonb_build_object(
    'categories', coalesce(
      (select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
       from categories c),
      '[]'::jsonb),
    'items', coalesce(
      (select jsonb_agg(
         jsonb_build_object(
           'id', i.id,
           'code', i.code,
           'name', i.name,
           'category_id', i.category_id,
           'base_unit', i.base_unit,
           'stock', coalesce(st.qty, 0),
           'sold_90d', coalesce(sold.n, 0),
           'units', un.units
         ) order by coalesce(sold.n, 0) desc, i.name, i.id)
       from items i
       left join (
         select sb.item_id, sum(sb.quantity_remaining) as qty
         from stock_batches sb
         group by sb.item_id
       ) st on st.item_id = i.id
       left join (
         select ii.item_id, count(*) as n
         from invoice_items ii
         join invoices inv on inv.id = ii.invoice_id
         where inv.status = 'issued'
           and inv.date >= (now() at time zone 'Asia/Colombo')::date - 90
         group by ii.item_id
       ) sold on sold.item_id = i.id
       cross join lateral (
         select jsonb_agg(
                  jsonb_build_object(
                    'unit_name', u.unit_name,
                    'factor', u.factor,
                    'price', case when i.sale_price is not null
                                  then round(i.sale_price * u.factor, 2) end
                  ) order by u.factor, u.unit_name)
                as units
         from (
           select i.base_unit as unit_name, 1::numeric as factor
           union all
           select iu.unit_name, iu.conversion_factor_to_base
           from item_units iu where iu.item_id = i.id
         ) u
       ) un
       where i.active),
      '[]'::jsonb)
  );
end;
$$;

revoke all on function get_billing_shelf() from public;
revoke all on function get_billing_shelf() from anon;
grant execute on function get_billing_shelf() to authenticated;

drop function if exists get_item_last_sale_price(uuid, text);

-- ── 3: price history + the one setter ───────────────────────────────────

create table item_price_history (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  old_price numeric,
  new_price numeric,
  changed_by uuid references profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  source text not null check (source in ('item form', 'price list', 'purchase'))
);

create index item_price_history_item_idx on item_price_history (item_id, changed_at desc);

alter table item_price_history enable row level security;

create policy item_price_history_select on item_price_history
  for select to authenticated
  using ((select is_owner()));

-- no insert / update / delete policy: rows are written only by set_item_sale_price
revoke all on item_price_history from public;
revoke all on item_price_history from anon;
revoke all on item_price_history from authenticated;
grant select on item_price_history to authenticated;

-- p_price null = "no selling price". Returns {ok, changed, old_price, new_price}.
create function set_item_sale_price(
  p_item_id uuid,
  p_price numeric,
  p_source text default 'price list'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old numeric;
  v_new numeric;
  v_found boolean;
begin
  if not is_owner() then
    raise exception 'only owner can set selling prices' using errcode = '42501';
  end if;

  if p_source is null or p_source not in ('item form', 'price list', 'purchase') then
    raise exception 'unknown price source';
  end if;

  if p_price is not null then
    if p_price = 'NaN'::numeric or p_price < 0 or p_price > 100000000 then
      raise exception 'selling price must be empty or between 0 and 100,000,000';
    end if;
    v_new := round(p_price, 2);
  end if;

  select i.sale_price, true into v_old, v_found
  from items i where i.id = p_item_id for update;
  if v_found is not true then
    raise exception 'item not found';
  end if;

  if v_old is not distinct from v_new then
    return jsonb_build_object('ok', true, 'changed', false, 'old_price', v_old, 'new_price', v_new);
  end if;

  update items set sale_price = v_new where id = p_item_id;

  insert into item_price_history (item_id, old_price, new_price, changed_by, source)
  values (p_item_id, v_old, v_new, auth.uid(), p_source);

  return jsonb_build_object('ok', true, 'changed', true, 'old_price', v_old, 'new_price', v_new);
end;
$$;

revoke all on function set_item_sale_price(uuid, numeric, text) from public;
revoke all on function set_item_sale_price(uuid, numeric, text) from anon;
grant execute on function set_item_sale_price(uuid, numeric, text) to authenticated;

-- ── 4: the owner's price list ───────────────────────────────────────────

-- p_sort: 'name' | 'code' | 'category' | 'recent' (most recently received first).
-- Active items only. No cost columns.
create function get_item_price_list(
  p_search text default null,
  p_category uuid default null,
  p_only_unpriced boolean default false,
  p_sort text default 'name',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text;
  v_limit integer;
  v_offset integer;
  v_total bigint;
  v_rows jsonb;
begin
  if not is_owner() then
    raise exception 'only owner can open the price list' using errcode = '42501';
  end if;

  v_search := nullif(btrim(coalesce(p_search, '')), '');
  if v_search is not null then
    v_search := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  v_limit := least(100, greatest(1, coalesce(p_limit, 50)));
  v_offset := greatest(0, coalesce(p_offset, 0));

  select count(*) into v_total
  from items i
  where i.active
    and (v_search is null or i.name ilike v_search or i.code ilike v_search)
    and (p_category is null or i.category_id = p_category)
    and (not coalesce(p_only_unpriced, false) or i.sale_price is null);

  select coalesce(jsonb_agg(r.j order by r.ord), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
             'id', i.id,
             'code', i.code,
             'name', i.name,
             'category_id', i.category_id,
             'category_name', c.name,
             'base_unit', i.base_unit,
             'sale_price', i.sale_price,
             'last_received', lr.d
           ) as j,
           row_number() over (
             order by
               case when p_sort = 'code' then i.code end,
               case when p_sort = 'category' then lower(c.name) end,
               case when p_sort = 'recent' then lr.d end desc nulls last,
               lower(i.name), i.id
           ) as ord
    from items i
    left join categories c on c.id = i.category_id
    left join (
      select pi.item_id, max(p.date) as d
      from purchase_items pi
      join purchases p on p.id = pi.purchase_id
      group by pi.item_id
    ) lr on lr.item_id = i.id
    where i.active
      and (v_search is null or i.name ilike v_search or i.code ilike v_search)
      and (p_category is null or i.category_id = p_category)
      and (not coalesce(p_only_unpriced, false) or i.sale_price is null)
    order by ord
    limit v_limit offset v_offset
  ) r;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end;
$$;

revoke all on function get_item_price_list(text, uuid, boolean, text, integer, integer) from public;
revoke all on function get_item_price_list(text, uuid, boolean, text, integer, integer) from anon;
grant execute on function get_item_price_list(text, uuid, boolean, text, integer, integer) to authenticated;
