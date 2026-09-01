-- New Kandy Essence: stock_batches was added to the supabase_realtime
-- publication in 0004, but subscriptions never received UPDATE events --
-- confirmed live: a manually subscribed client got SUBSCRIBED but no
-- postgres_changes event fired for a stock-out (which UPDATEs
-- quantity_remaining). Default REPLICA IDENTITY only ships the primary key
-- for UPDATE/DELETE in the WAL, which Realtime's row-level-security
-- evaluation needs the full old row for; without it, changes are silently
-- dropped rather than broadcast. FULL identity fixes this for updates and
-- deletes (inserts were never the issue).

alter table stock_batches replica identity full;
