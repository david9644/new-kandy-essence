-- New Kandy Essence: the text printed after "Cashier:" on a bill.
--
-- * app_settings.print_cashier_text (default 'New Kandy Essence', at most 30
--   characters, one line). It replaces the logged-in user's name on every
--   printed / previewed bill, whatever the stored invoices.created_by_name is.
--   An EMPTY value means "show the stored user name again" (the old behaviour).
-- * invoices.created_by_name is NOT touched: it stays on every invoice for the
--   owner's own records. Only what is shown on the bill changes, so existing
--   bills show the new text when viewed or reprinted.
-- Nothing else about bills, totals, stock or ledgers is touched. Written only by
-- the existing owner-only app_settings_update policy (updatePrintSettings).

alter table app_settings
  add column print_cashier_text text not null default 'New Kandy Essence'
    check (char_length(print_cashier_text) <= 30 and print_cashier_text !~ E'[\\r\\n]');
