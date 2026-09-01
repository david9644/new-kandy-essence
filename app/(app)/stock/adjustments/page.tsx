import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StockAdjustmentForm } from "@/components/stock/stock-adjustment-form";

export default async function StockAdjustmentsPage() {
  await requireOwner();
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("items")
    .select("id, code, name, base_unit")
    .eq("active", true)
    .order("name");

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-2xl font-semibold text-foreground">Stock Adjustment</h1>
      <p className="mb-4 text-sm text-muted">
        Correct a count -- damage, wastage, or a miscount found during the manual-to-digital
        transition.
      </p>
      <StockAdjustmentForm items={items ?? []} />
    </div>
  );
}
