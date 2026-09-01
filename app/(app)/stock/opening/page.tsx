import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { OpeningStockForm } from "@/components/stock/opening-stock-form";

export default async function OpeningStockPage() {
  await requireOwner();
  const supabase = await createClient();

  const { data: itemsData } = await supabase
    .from("items")
    .select("id, code, name, base_unit, batch_tracked, item_units(unit_name, conversion_factor_to_base)")
    .eq("active", true)
    .order("name");

  const items = (itemsData ?? []).map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    base_unit: item.base_unit,
    batch_tracked: item.batch_tracked,
    units: item.item_units,
  }));

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-2xl font-semibold text-foreground">Opening Stock Entry</h1>
      <p className="mb-4 text-sm text-muted">
        For go-live data entry from your manual books, or adding a found batch. Creates a stock
        batch directly -- no supplier or purchase record is involved.
      </p>
      <OpeningStockForm items={items} />
    </div>
  );
}
