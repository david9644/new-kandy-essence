# New Kandy Essence — Stock & Purchasing Management System

A stock and purchasing management system for a wholesale/retail packaged foods
distributor: item and supplier masters, direct-entry purchasing, supplier
payments and a cheque register, FEFO-aware stock management, a dedicated
opening-stock screen for go-live data entry, low-stock/near-expiry dashboard
alerts, and print-friendly reports. Built touch-first for a warehouse
touch-screen kiosk, and mobile-responsive for phone use.

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS + Supabase (Postgres, Auth,
Realtime), deployable to Vercel.

## Local setup

1. `npm install`
2. Copy `.env.local` (already configured against the project's Supabase
   instance) — the only value you may need to refresh yourself is
   `SUPABASE_SERVICE_ROLE_KEY` (Supabase dashboard → Project Settings → API →
   service_role secret key). Never commit this file or expose that key to the
   browser.
3. If starting from a fresh Supabase project, apply the migrations in
   `supabase/migrations/` in order (via the Supabase MCP `apply_migration`
   tool or the Supabase CLI).
4. Create the first Owner login (one-time, local only — this is not a public
   route):
   ```bash
   npx tsx scripts/bootstrap-owner.ts --name "Owner Name" --pin 1234
   ```
5. `npm run dev`, then log in with that PIN at `/login`.

## How login works

Every user is a real Supabase Auth account under a synthetic email, signed in
via PIN through `app/api/auth/login/route.ts` (the only runtime code path that
uses the service-role client). See `lib/auth/pin.ts` for the PIN-hashing
scheme and `PIN_PEPPER` in `.env.local`. Owners manage Store Keeper logins and
PIN resets from `/users`.

## Data model notes

- Every write with a cross-table invariant (a purchase creating a stock batch
  and a cheque in one step, a bounced cheque reversing a supplier balance,
  unit conversion computed server-side rather than trusted from the client)
  goes through a `SECURITY DEFINER` Postgres function in
  `supabase/migrations/`, not a direct table write. Simple single-table
  master data (items, suppliers, categories, bank accounts) uses plain RLS
  instead.
- `stock_batches` is the one table both roles need live-synced across the two
  stations; it's the only table in the `supabase_realtime` publication, and
  has `REPLICA IDENTITY FULL` (Realtime's RLS check needs the full old row to
  authorize `UPDATE`/`DELETE` events, and a normal client subscription must
  call `realtime.setAuth()` with the session's access token or every event is
  silently dropped — see `components/stock/stock-realtime-refresh.tsx`).
- Supplier balance is always computed live from `opening_balance` +
  credit/cheque purchases − non-bounced payments (`get_supplier_balance(s)`
  in `supabase/migrations/0003_rpcs.sql`) rather than stored and
  incrementally updated, so a cheque bounce reverses its effect automatically
  just by flipping `cheques.status`.
- `NEAR_EXPIRY_DAYS` (`lib/constants.ts`) is the one place the 30-day
  near-expiry window is defined.

## Scripts

- `npm run dev` / `npm run build` / `npm run start` / `npm run lint`
- `npx tsx scripts/bootstrap-owner.ts --name "..." --pin 1234` — one-time
  first-owner setup, run locally only.
