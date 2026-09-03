import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatQuantity } from "@/lib/units";
import { EditOpeningStockForm } from "@/components/stock/edit-opening-stock-form";
import { ConfirmDeleteButton } from "@/components/shared/confirm-delete-button";
import { deleteOpeningStock } from "@/app/(app)/stock/opening/actions";

export default async function OpeningStockDetailPage({
  params,
}: {
  params: Promise<{ openingStockId: string }>;
}) {
  const { openingStockId } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: entry } = await supabase
    .from("opening_stock_entries")
    .select(
      "*, items(name, code, base_unit, batch_tracked, item_units(unit_name, conversion_factor_to_base))"
    )
    .eq("id", openingStockId)
    .maybeSingle();

  if (!entry) notFound();

  const item = entry.items as {
    name: string;
    code: string;
    base_unit: string;
    batch_tracked: boolean;
    item_units: { unit_name: string; conversion_factor_to_base: number }[];
  } | null;

  const unitOptions = item
    ? [{ unit_name: item.base_unit, conversion_factor_to_base: 1 }, ...item.item_units]
    : [];

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{item?.name}</h1>
          <p className="text-sm text-muted">{item?.code}</p>
        </div>
        {profile.role === "owner" && (
          <ConfirmDeleteButton
            label="Delete Entry"
            onDelete={deleteOpeningStock.bind(null, entry.id)}
          />
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-border bg-surface p-4 text-sm">
        <div>
          <p className="text-muted">Quantity</p>
          <p className="text-foreground">
            {formatQuantity(entry.quantity)} {entry.unit_name}
          </p>
        </div>
        <div>
          <p className="text-muted">Cost Price</p>
          <p className="text-foreground">{formatCurrency(entry.cost_price)}</p>
        </div>
        {entry.batch_number && (
          <div>
            <p className="text-muted">Batch Number</p>
            <p className="text-foreground">{entry.batch_number}</p>
          </div>
        )}
        {entry.expiry_date && (
          <div>
            <p className="text-muted">Expiry Date</p>
            <p className="text-foreground">{entry.expiry_date}</p>
          </div>
        )}
        {entry.notes && (
          <div className="col-span-2">
            <p className="text-muted">Notes</p>
            <p className="text-foreground">{entry.notes}</p>
          </div>
        )}
      </div>

      {profile.role === "owner" && (
        <>
          <h2 className="mb-2 text-lg font-medium text-foreground">Edit Entry</h2>
          <EditOpeningStockForm
            entryId={entry.id}
            unitOptions={unitOptions}
            batchTracked={item?.batch_tracked ?? false}
            initial={{
              batch_number: entry.batch_number ?? "",
              expiry_date: entry.expiry_date ?? "",
              quantity: entry.quantity,
              unit_name: entry.unit_name,
              cost_price: entry.cost_price,
              notes: entry.notes ?? "",
            }}
          />
        </>
      )}
    </div>
  );
}
