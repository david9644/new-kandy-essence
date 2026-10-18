import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatQuantity } from "@/lib/units";
import { EditStockOutForm } from "@/components/stock/edit-stock-out-form";
import { ConfirmDeleteButton } from "@/components/shared/confirm-delete-button";
import Link from "next/link";
import { BackButton } from "@/components/shared/back-button";
import { deleteStockOut } from "@/app/(app)/stock/out/actions";

export default async function StockOutDetailPage({
  params,
}: {
  params: Promise<{ stockOutId: string }>;
}) {
  const { stockOutId } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: stockOut }, { data: batches }] = await Promise.all([
    supabase
      .from("stock_out")
      .select("*, items(name, code, base_unit, item_units(unit_name, conversion_factor_to_base))")
      .eq("id", stockOutId)
      .maybeSingle(),
    supabase
      .from("stock_out_batches")
      .select("quantity_deducted, stock_batches(batch_number, expiry_date)")
      .eq("stock_out_id", stockOutId),
  ]);

  if (!stockOut) notFound();

  // Stock-outs created by a bill belong to that bill: change them by editing
  // or deleting the bill (the database refuses direct edits anyway).
  const { data: bill } = stockOut.invoice_id
    ? await supabase
        .from("invoices")
        .select("id, invoice_no")
        .eq("id", stockOut.invoice_id)
        .maybeSingle()
    : { data: null };
  const fromBill = stockOut.invoice_id !== null;

  const item = stockOut.items as {
    name: string;
    code: string;
    base_unit: string;
    item_units: { unit_name: string; conversion_factor_to_base: number }[];
  } | null;

  const unitOptions = item
    ? [{ unit_name: item.base_unit, conversion_factor_to_base: 1 }, ...item.item_units]
    : [];

  return (
    <div className="mx-auto max-w-lg border-t-[3px] border-t-accent-stock pt-3">
      <BackButton href="/stock/out" />
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{item?.name}</h1>
          <p className="text-sm text-muted">
            {item?.code} &middot; {stockOut.date}
          </p>
        </div>
        {profile.role === "owner" && !fromBill && (
          <ConfirmDeleteButton
            label="Delete Stock-Out"
            onDelete={deleteStockOut.bind(null, stockOut.id)}
          />
        )}
      </div>

      <p className="mb-4 text-sm text-muted">
        {formatQuantity(stockOut.quantity)} {stockOut.unit_name}
      </p>

      {(batches ?? []).length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-medium text-foreground">Drawn From</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
            {(batches ?? []).map((b, i) => {
              const batch = b.stock_batches as
                | { batch_number: string | null; expiry_date: string | null }
                | null;
              return (
                <li key={i} className="flex items-center justify-between px-4 py-3">
                  <span className="text-foreground">
                    {batch?.batch_number ?? "No batch #"}
                    {batch?.expiry_date ? ` · exp ${batch.expiry_date}` : ""}
                  </span>
                  <span className="tabular-nums text-muted">
                    {formatQuantity(b.quantity_deducted)} {item?.base_unit}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {fromBill && (
        <p className="mb-6 rounded-lg bg-background px-3 py-2 text-sm text-muted">
          This stock-out was created by a bill
          {bill ? (
            <>
              {" "}
              (<Link href={`/billing/${bill.id}`} className="font-medium text-primary">{bill.invoice_no}</Link>)
            </>
          ) : null}
          . To change it, edit or delete the bill.
        </p>
      )}

      {profile.role === "owner" && !fromBill && (
        <>
          <h2 className="mb-2 text-lg font-medium text-foreground">Edit Stock-Out</h2>
          <EditStockOutForm
            stockOutId={stockOut.id}
            unitOptions={unitOptions}
            initial={{ quantity: stockOut.quantity, unit_name: stockOut.unit_name, date: stockOut.date }}
          />
        </>
      )}
    </div>
  );
}
