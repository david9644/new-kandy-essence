-- New Kandy Essence: enable Realtime on stock_batches so both stations reflect
-- stock changes without a manual refresh. Supabase does not auto-enable this on
-- new tables.

alter publication supabase_realtime add table stock_batches;
