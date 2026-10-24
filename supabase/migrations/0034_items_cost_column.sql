-- New Kandy Essence: close items.last_purchase_cost at the API (second half of
-- 0033, applied after the app stopped selecting the column directly -- the owner
-- reads it with get_item_last_costs()). Both roles are the database role
-- "authenticated", so the column is closed for everyone; every other items column
-- is granted exactly as before. A column added to items later has to be added to
-- this grant too (same as invoice_items).

revoke select on items from authenticated;
grant select (id, code, name, category_id, base_unit, reorder_level, batch_tracked,
              active, created_by, updated_by, created_at, updated_at, sale_price)
  on items to authenticated;

