import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StockOverviewTable, type StockRow } from "@/components/stock/stock-overview-table";
import { StockRealtimeRefresh } from "@/components/stock/stock-realtime-refresh";

export default async function StockOverviewPage() {
  await requireProfile();
  const supabase = await createClient();

  const [{ data: items }, { data: summary }] = await Promise.all([
    supabase
      .from("items")
      .select("id, code, name, base_unit, reorder_level, item_units(unit_name, conversion_factor_to_base)")
      .eq("active", true)
      .order("name"),
    supabase.from("item_stock_summary").select("item_id, total_quantity, total_value"),
  ]);

  const summaryByItem = new Map(
    (summary ?? []).map((s) => [s.item_id, { qty: s.total_quantity ?? 0, value: s.total_value ?? 0 }])
  );

  const rows: StockRow[] = (items ?? []).map((item) => {
    const s = summaryByItem.get(item.id);
    const biggestUnit = [...item.item_units].sort(
      (a, b) => b.conversion_factor_to_base - a.conversion_factor_to_base
    )[0];
    return {
      id: item.id,
      code: item.code,
      name: item.name,
      base_unit: item.base_unit,
      reorder_level: item.reorder_level,
      secondary_unit: biggestUnit ?? null,
      total_quantity: s?.qty ?? 0,
      total_value: s?.value ?? 0,
    };
  });

  return (
    <div className="border-t-[3px] border-t-accent-stock pt-3">
      <StockRealtimeRefresh />
      <h1 className="mb-4 text-2xl font-semibold text-foreground">Stock Overview</h1>
      <StockOverviewTable rows={rows} />
    </div>
  );
}
