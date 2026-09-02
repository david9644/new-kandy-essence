import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StockOutForm } from "@/components/stock/stock-out-form";

export default async function StockOutPage() {
  await requireProfile();
  const supabase = await createClient();

  const { data: itemsData } = await supabase
    .from("items")
    .select("id, code, name, base_unit, item_units(unit_name, conversion_factor_to_base)")
    .eq("active", true)
    .order("name");

  const items = (itemsData ?? []).map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    base_unit: item.base_unit,
    units: item.item_units,
  }));

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-2xl font-semibold text-foreground">Stock-Out</h1>
      <StockOutForm items={items} />
    </div>
  );
}
