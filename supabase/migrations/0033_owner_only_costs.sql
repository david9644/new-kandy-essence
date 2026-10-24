-- New Kandy Essence: purchase / buying costs are for the Owner only.
--
-- What the API can now refuse a Store Keeper (both roles are the database role
-- "authenticated", so only ROW policies, functions that check is_owner(), and
-- column privileges that are closed for everyone can tell them apart):
--
--  * item_stock_summary.total_value  -> null unless the caller is the owner
--    (the view stays security_invoker; quantities are unchanged).
--  * purchases / purchase_items      -> readable by the owner only. A Store Keeper
--    can still RECORD a purchase (create_purchase is SECURITY DEFINER) but can no
--    longer read purchase totals or line costs back.
--  * opening_stock_entries           -> owner only (cost_price). The opening stock
--    screens are owner-only already.
--  * items.last_purchase_cost        -> the owner reads it through
--    get_item_last_costs() (owner check inside); the column privilege itself is
--    closed in 0034, once the app no longer selects the column directly.
--
-- NOT closed here (see the report): stock_batches.unit_cost is still readable
-- through the API, and in realtime payloads, because the stock screens, the stock
-- view and realtime refresh all depend on that table. All SECURITY DEFINER
-- functions (FEFO, billing, purchases, reports) still read costs internally.

create or replace view item_stock_summary
with (security_invoker = true) as
select
  item_id,
  sum(quantity_remaining) as total_quantity,
  case when is_owner() then sum(quantity_remaining * unit_cost) end as total_value
from stock_batches
group by item_id;

alter policy purchases_select on purchases using ((select is_owner()));
alter policy purchase_items_select on purchase_items using ((select is_owner()));
alter policy opening_stock_entries_select on opening_stock_entries using ((select is_owner()));

create function get_item_last_costs(p_ids uuid[])
returns table (item_id uuid, last_purchase_cost numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_owner() then
    raise exception 'only owner can read purchase costs' using errcode = '42501';
  end if;
  return query
  select i.id, i.last_purchase_cost
  from items i
  where i.id = any (p_ids) and i.last_purchase_cost is not null;
end;
$$;

revoke all on function get_item_last_costs(uuid[]) from public;
revoke all on function get_item_last_costs(uuid[]) from anon;
grant execute on function get_item_last_costs(uuid[]) to authenticated;
