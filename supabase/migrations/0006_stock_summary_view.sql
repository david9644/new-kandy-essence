-- New Kandy Essence: per-item stock summary for the Stock Overview screen.
-- No owner/store-keeper access differential exists here (stock_batches is
-- shared-read already), so a plain security_invoker view is enough -- no
-- SECURITY DEFINER function needed.

create view item_stock_summary
with (security_invoker = true) as
select
  item_id,
  sum(quantity_remaining) as total_quantity,
  sum(quantity_remaining * unit_cost) as total_value
from stock_batches
group by item_id;

grant select on item_stock_summary to authenticated;
