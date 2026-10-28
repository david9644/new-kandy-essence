-- New Kandy Essence: the header of the printed bill is four editable lines.
--
-- * business_name (existing, migration 0027) and business_address (existing) now hold the
--   header name and address; two NEW columns hold the tagline (printed directly under the
--   name) and the phone numbers (printed after the prefix "Tel: ").
-- * The live row is set to the owner's header text. Only these four columns are written;
--   no other setting, bill, stock or ledger row is touched. business_phone1 / business_phone2
--   (the old two-field phone numbers, never filled in) are left as they are and no longer used.
-- * The dot-matrix printer prints plain English text only, so all four columns are limited to
--   printable ASCII (space to ~, which also rules out line breaks) and to their maximum
--   lengths: name 40, tagline 120, address 80, phones 60. The Settings form and the server
--   check the same rules first; these constraints are the last line of defence.
-- Run once: it adds columns and constraints that do not exist yet.

alter table app_settings
  add column business_tagline text not null default
    'Dealers in All Kind of Essence, Cake Ingredients, Grocery & Scent etc...',
  add column business_phones text not null default '081-4550561 / 0779278100';

alter table app_settings
  alter column business_name set default 'New Kandy Essence Suppliers',
  alter column business_address set default '16, Wadugodapitiya Street, Kandy';

update app_settings
set business_name = 'New Kandy Essence Suppliers',
    business_tagline = 'Dealers in All Kind of Essence, Cake Ingredients, Grocery & Scent etc...',
    business_address = '16, Wadugodapitiya Street, Kandy',
    business_phones = '081-4550561 / 0779278100'
where id;

alter table app_settings
  add constraint app_settings_business_name_print
    check (business_name is null or (char_length(business_name) between 1 and 40 and business_name ~ '^[ -~]+$')),
  add constraint app_settings_business_tagline_print
    check (char_length(business_tagline) <= 120 and business_tagline ~ '^[ -~]*$'),
  add constraint app_settings_business_address_print
    check (business_address is null or (char_length(business_address) <= 80 and business_address ~ '^[ -~]*$')),
  add constraint app_settings_business_phones_print
    check (char_length(business_phones) <= 60 and business_phones ~ '^[ -~]*$');
