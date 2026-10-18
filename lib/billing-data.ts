import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import type { BillItem, CustomerOption } from "@/components/billing/bill-types";

type Client = SupabaseClient<Database>;

export function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
}

// Active items with their selling price, units and total on-hand stock, for
// the billing screen's in-memory type-ahead. Only quantity is read from the
// stock view (never its cost/value columns).
export async function loadBillItems(supabase: Client): Promise<BillItem[]> {
  const [{ data: items }, { data: stock }] = await Promise.all([
    supabase
      .from("items")
      .select("id, code, name, base_unit, sale_price, item_units(unit_name, conversion_factor_to_base)")
      .eq("active", true)
      .order("name")
      .range(0, 4999),
    supabase.from("item_stock_summary").select("item_id, total_quantity").range(0, 4999),
  ]);

  const onHand = new Map<string, number>();
  for (const row of stock ?? []) {
    if (row.item_id) onHand.set(row.item_id, Number(row.total_quantity ?? 0));
  }

  return (items ?? []).map((i) => ({
    id: i.id,
    code: i.code,
    name: i.name,
    base_unit: i.base_unit,
    sale_price: i.sale_price,
    units: i.item_units,
    on_hand: onHand.get(i.id) ?? 0,
  }));
}

// Customers come through the narrow id/code/name function so a Store Keeper
// can pick one without ever reading the customers table (balances, ledgers).
export async function loadBillCustomers(supabase: Client): Promise<CustomerOption[]> {
  const { data } = await supabase.rpc("search_customers_basic");
  return (data ?? []).map((c) => ({ id: c.id, code: c.code, name: c.name }));
}
