-- New Kandy Essence: continuous bill printing.
--
-- * print_continuous (default on): print each bill as ONE long piece.
-- * print_max_sheets (default 6): longest single piece, in sheets (one sheet =
--   print_page_height_in). Longer bills are cut into pieces of that length.
-- * The printed text now ends 1 cm (0.3937 in) earlier on the RIGHT: the stored
--   right margin of the existing row gets +0.3937 in (whatever the owner had
--   saved), and the column default for new rows becomes 0.5 + 0.3937 = 0.8937.
--   Characters per line follow from the settings (54 -> 49 at 12 cpi).
-- Nothing else about bills, stock or ledgers is touched.

alter table app_settings
  add column print_continuous boolean not null default true,
  add column print_max_sheets integer not null default 6
    check (print_max_sheets between 1 and 20);

alter table app_settings
  alter column print_margin_right_in set default 0.8937;

update app_settings
set print_margin_right_in = least(3, round(print_margin_right_in + 0.3937, 4));
