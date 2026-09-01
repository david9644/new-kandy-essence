-- New Kandy Essence: core schema (extensions, enums, tables, indexes, code generation)

create extension if not exists pg_trgm;

create type user_role as enum ('owner', 'store_keeper');
create type purchase_payment_type as enum ('cash', 'credit', 'cheque');
create type payment_method as enum ('cash', 'cheque');
create type cheque_status as enum ('pending', 'cleared', 'bounced');
create type cheque_source as enum ('purchase', 'payment');

-- ── Identity ────────────────────────────────────────────────────────────────

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role user_role not null default 'store_keeper',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table profile_credentials (
  profile_id uuid primary key references profiles(id) on delete cascade,
  pin_lookup_hash text not null unique,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

create table login_attempts (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  window_start timestamptz not null default now(),
  attempt_count integer not null default 1
);
create index login_attempts_ip_idx on login_attempts (ip, window_start);

-- ── Item & Supplier masters ─────────────────────────────────────────────────

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category_id uuid references categories(id) on delete set null,
  base_unit text not null,
  reorder_level numeric not null default 0 check (reorder_level >= 0),
  batch_tracked boolean not null default true,
  last_purchase_cost numeric check (last_purchase_cost is null or last_purchase_cost >= 0),
  active boolean not null default true,
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table item_units (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  unit_name text not null,
  conversion_factor_to_base numeric not null check (conversion_factor_to_base > 0),
  unique (item_id, unit_name)
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  contact text,
  address text,
  active boolean not null default true,
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table supplier_financials (
  supplier_id uuid primary key references suppliers(id) on delete cascade,
  opening_balance numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table bank_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Cheques ──────────────────────────────────────────────────────────────

create table cheques (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id),
  bank_account_id uuid not null references bank_accounts(id),
  cheque_number text not null,
  cheque_date date not null,
  amount numeric not null check (amount > 0),
  status cheque_status not null default 'pending',
  source cheque_source not null,
  status_updated_at timestamptz,
  status_updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (bank_account_id, cheque_number)
);

-- ── Purchasing ───────────────────────────────────────────────────────────

create table purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_no integer generated always as identity,
  supplier_id uuid not null references suppliers(id),
  date date not null default current_date,
  payment_type purchase_payment_type not null,
  cheque_id uuid references cheques(id),
  reference_no text,
  total_amount numeric not null default 0 check (total_amount >= 0),
  notes text,
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Stock ────────────────────────────────────────────────────────────────
-- quantity_remaining deliberately has no >= 0 check: a forced stock-out that
-- exceeds available stock (warn-but-allow, per spec) can drive a batch negative.

create table stock_batches (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id),
  batch_number text,
  expiry_date date,
  quantity_remaining numeric not null default 0,
  unit_cost numeric not null check (unit_cost >= 0),
  created_at timestamptz not null default now()
);

create table purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  item_id uuid not null references items(id),
  batch_number text,
  expiry_date date,
  quantity numeric not null check (quantity > 0),
  unit_name text not null,
  conversion_factor numeric not null check (conversion_factor > 0),
  base_quantity numeric not null check (base_quantity > 0),
  unit_cost numeric not null check (unit_cost >= 0),
  line_total numeric not null check (line_total >= 0),
  stock_batch_id uuid not null references stock_batches(id),
  created_at timestamptz not null default now()
);

create table opening_stock_entries (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id),
  batch_number text,
  expiry_date date,
  quantity numeric not null check (quantity > 0),
  unit_name text not null,
  conversion_factor numeric not null check (conversion_factor > 0),
  base_quantity numeric not null check (base_quantity > 0),
  cost_price numeric not null check (cost_price >= 0),
  stock_batch_id uuid not null references stock_batches(id),
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table stock_out (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id),
  stock_batch_id uuid not null references stock_batches(id),
  quantity numeric not null check (quantity > 0),
  unit_name text not null,
  conversion_factor numeric not null check (conversion_factor > 0),
  base_quantity numeric not null check (base_quantity > 0),
  date date not null default current_date,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id),
  stock_batch_id uuid not null references stock_batches(id),
  quantity_change numeric not null check (quantity_change <> 0),
  reason text not null check (length(trim(reason)) > 0),
  date date not null default current_date,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ── Supplier payments ────────────────────────────────────────────────────

create table supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers(id),
  date date not null default current_date,
  amount numeric not null check (amount > 0),
  payment_type payment_method not null,
  cheque_id uuid references cheques(id),
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────

create index items_name_trgm_idx on items using gin (name gin_trgm_ops);
create index items_code_trgm_idx on items using gin (code gin_trgm_ops);
create index suppliers_name_trgm_idx on suppliers using gin (name gin_trgm_ops);
create index suppliers_code_trgm_idx on suppliers using gin (code gin_trgm_ops);

create index stock_batches_item_active_idx on stock_batches (item_id) where quantity_remaining > 0;
create index stock_batches_fefo_idx on stock_batches (item_id, expiry_date nulls last, created_at) where quantity_remaining > 0;

create index purchase_items_purchase_idx on purchase_items (purchase_id);
create index purchase_items_item_idx on purchase_items (item_id);
create index purchases_supplier_idx on purchases (supplier_id);
create index purchases_date_idx on purchases (date);
create index stock_out_item_idx on stock_out (item_id);
create index stock_out_date_idx on stock_out (date);
create index stock_adjustments_item_idx on stock_adjustments (item_id);
create index cheques_supplier_idx on cheques (supplier_id);
create index cheques_status_idx on cheques (status);
create index supplier_payments_supplier_idx on supplier_payments (supplier_id);
create index supplier_payments_cheque_idx on supplier_payments (cheque_id);

-- ── Auto-generated codes ─────────────────────────────────────────────────

create sequence items_code_seq start 1;
create sequence suppliers_code_seq start 1;

create or replace function set_item_code()
returns trigger
language plpgsql
as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'NKE-' || lpad(nextval('items_code_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger items_set_code
before insert on items
for each row execute function set_item_code();

create or replace function set_supplier_code()
returns trigger
language plpgsql
as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'SUP-' || lpad(nextval('suppliers_code_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger suppliers_set_code
before insert on suppliers
for each row execute function set_supplier_code();

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger items_touch_updated_at before update on items for each row execute function touch_updated_at();
create trigger suppliers_touch_updated_at before update on suppliers for each row execute function touch_updated_at();

-- ── Timezone ─────────────────────────────────────────────────────────────
-- "today" boundaries (same-day edit window, Daily Summary, near-expiry countdown)
-- must be Sri Lanka local time, not the infra's default UTC.

do $$
begin
  execute format('alter database %I set timezone to %L', current_database(), 'Asia/Colombo');
end $$;
