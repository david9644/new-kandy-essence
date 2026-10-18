import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import type { CustomerOption } from "@/components/billing/bill-types";
import { normalizeShelf, type Shelf } from "@/lib/till/shelf";

type Client = SupabaseClient<Database>;

export function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
}

// The till screen's shelf: one read of categories, items, unit prices and
// stock (no cost data). Null if the read fails.
export async function loadBillShelf(supabase: Client): Promise<Shelf | null> {
  const { data, error } = await supabase.rpc("get_billing_shelf");
  if (error || !data) return null;
  return normalizeShelf(data);
}

// Customers come through the narrow id/code/name function so a Store Keeper
// can pick one without ever reading the customers table (balances, ledgers).
export async function loadBillCustomers(supabase: Client): Promise<CustomerOption[]> {
  const { data } = await supabase.rpc("search_customers_basic");
  return (data ?? []).map((c) => ({ id: c.id, code: c.code, name: c.name }));
}
