import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { NEAR_EXPIRY_DAYS, BUSINESS_TIMEZONE } from "@/lib/constants";

type Client = SupabaseClient<Database>;

export interface LowStockRow {
  id: string;
  code: string;
  name: string;
  base_unit: string;
  reorder_level: number;
  total_quantity: number;
}

export async function getLowStockItems(supabase: Client): Promise<LowStockRow[]> {
  const [{ data: items }, { data: summary }] = await Promise.all([
    supabase.from("items").select("id, code, name, base_unit, reorder_level").eq("active", true),
    supabase.from("item_stock_summary").select("item_id, total_quantity"),
  ]);

  const qtyByItem = new Map((summary ?? []).map((s) => [s.item_id, s.total_quantity ?? 0]));

  return (items ?? [])
    .map((item) => ({ ...item, total_quantity: qtyByItem.get(item.id) ?? 0 }))
    .filter((item) => item.total_quantity <= item.reorder_level)
    .sort((a, b) => a.total_quantity - a.reorder_level - (b.total_quantity - b.reorder_level));
}

export interface NearExpiryRow {
  id: string;
  batch_number: string | null;
  expiry_date: string;
  quantity_remaining: number;
  item_id: string;
  item_name: string;
  item_code: string;
  base_unit: string;
  days_remaining: number;
}

export function todayInBusinessTz(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: BUSINESS_TIMEZONE });
}

export async function getNearExpiryBatches(supabase: Client): Promise<NearExpiryRow[]> {
  const today = todayInBusinessTz();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + NEAR_EXPIRY_DAYS);
  const cutoffIso = cutoff.toLocaleDateString("en-CA");

  const { data } = await supabase
    .from("stock_batches")
    .select("id, batch_number, expiry_date, quantity_remaining, items(id, name, code, base_unit)")
    .not("expiry_date", "is", null)
    .gt("quantity_remaining", 0)
    .lte("expiry_date", cutoffIso)
    .order("expiry_date", { ascending: true });

  const todayMs = new Date(today).getTime();

  return (data ?? []).map((batch) => {
    const item = batch.items as { id: string; name: string; code: string; base_unit: string };
    return {
      id: batch.id,
      batch_number: batch.batch_number,
      expiry_date: batch.expiry_date!,
      quantity_remaining: batch.quantity_remaining,
      item_id: item.id,
      item_name: item.name,
      item_code: item.code,
      base_unit: item.base_unit,
      days_remaining: Math.round((new Date(batch.expiry_date!).getTime() - todayMs) / 86_400_000),
    };
  });
}
