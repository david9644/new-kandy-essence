import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatQuantity } from "@/lib/units";
import { EditStockAdjustmentForm } from "@/components/stock/edit-stock-adjustment-form";
import { ConfirmDeleteButton } from "@/components/shared/confirm-delete-button";
import { deleteStockAdjustment } from "@/app/(app)/stock/adjustments/actions";

export default async function StockAdjustmentDetailPage({
  params,
}: {
  params: Promise<{ adjustmentId: string }>;
}) {
  const { adjustmentId } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: adjustment } = await supabase
    .from("stock_adjustments")
    .select("*, items(name, code, base_unit), stock_batches(batch_number, expiry_date)")
    .eq("id", adjustmentId)
    .maybeSingle();

  if (!adjustment) notFound();

  const item = adjustment.items as { name: string; code: string; base_unit: string } | null;
  const batch = adjustment.stock_batches as
    | { batch_number: string | null; expiry_date: string | null }
    | null;

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{item?.name}</h1>
          <p className="text-sm text-muted">
            {item?.code} &middot; {adjustment.date}
          </p>
        </div>
        {profile.role === "owner" && (
          <ConfirmDeleteButton
            label="Delete Adjustment"
            onDelete={deleteStockAdjustment.bind(null, adjustment.id)}
          />
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-border bg-surface p-4 text-sm">
        <div>
          <p className="text-muted">Change</p>
          <p className={adjustment.quantity_change >= 0 ? "text-success" : "text-danger"}>
            {adjustment.quantity_change >= 0 ? "+" : ""}
            {formatQuantity(adjustment.quantity_change)} {item?.base_unit}
          </p>
        </div>
        <div>
          <p className="text-muted">Batch</p>
          <p className="text-foreground">
            {batch?.batch_number ?? "No batch #"}
            {batch?.expiry_date ? ` · exp ${batch.expiry_date}` : ""}
          </p>
        </div>
        <div className="col-span-2">
          <p className="text-muted">Reason</p>
          <p className="text-foreground">{adjustment.reason}</p>
        </div>
      </div>

      {profile.role === "owner" && (
        <>
          <h2 className="mb-2 text-lg font-medium text-foreground">Edit Adjustment</h2>
          <EditStockAdjustmentForm
            adjustmentId={adjustment.id}
            initial={{
              quantity_change: adjustment.quantity_change,
              reason: adjustment.reason,
              date: adjustment.date,
            }}
          />
        </>
      )}
    </div>
  );
}
