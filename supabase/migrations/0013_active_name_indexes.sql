-- New Kandy Essence: speed up the common "active items/suppliers sorted by
-- name" queries (Purchase Entry, Item Master, Supplier Master all run this
-- shape of query) with partial indexes scoped to just the active rows.

create index items_active_name_idx on items (name) where active = true;
create index suppliers_active_name_idx on suppliers (name) where active = true;
