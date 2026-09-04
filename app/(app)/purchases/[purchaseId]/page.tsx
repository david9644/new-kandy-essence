import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatQuantity } from "@/lib/units";
import { PurchaseHeaderEditForm } from "@/components/purchases/purchase-header-edit-form";
import { DeletePurchaseButton } from "@/components/purchases/delete-purchase-button";

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
}

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ purchaseId: string }>;
}) {
  const { purchaseId } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: purchase }, { data: lines }] = await Promise.all([
    supabase
      .from("purchases")
      .select("*, suppliers(name, code), cheques(cheque_number, cheque_date, status, bank_accounts(name))")
      .eq("id", purchaseId)
      .maybeSingle(),
    supabase
      .from("purchase_items")
      .select("id, quantity, unit_name, unit_cost, line_total, batch_number, expiry_date, items(name, code)")
      .eq("purchase_id", purchaseId)
      .order("created_at"),
  ]);

  if (!purchase) notFound();

  const supplier = purchase.suppliers as { name: string; code: string } | null;
  const cheque = purchase.cheques as
    | { cheque_number: string; cheque_date: string; status: string; bank_accounts: { name: string } | null }
    | null;

  const canEditHeader = profile.role === "owner" || purchase.date === todayIso();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Purchase #{purchase.purchase_no}</h1>
          <p className="text-sm text-muted">
            <Link href={`/suppliers/${purchase.supplier_id}`} className="font-medium text-primary">
              {supplier?.name} ({supplier?.code})
            </Link>{" "}
            &middot; {purchase.date}
          </p>
        </div>
        {profile.role === "owner" && <DeletePurchaseButton purchaseId={purchase.id} />}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-border bg-surface p-4 text-sm">
        <div>
          <p className="text-muted">Payment Type</p>
          <p className="capitalize text-foreground">
            {purchase.payment_type === "cheque" ? (
              <Link href="/cheques" className="font-medium capitalize text-primary">
                {purchase.payment_type}
              </Link>
            ) : (
              purchase.payment_type
            )}
          </p>
        </div>
        <div>
          <p className="text-muted">Total</p>
          <p className="font-medium text-foreground">{formatCurrency(purchase.total_amount)}</p>
        </div>
        {purchase.reference_no && (
          <div>
            <p className="text-muted">Reference No.</p>
            <p className="text-foreground">{purchase.reference_no}</p>
          </div>
        )}
        {cheque && (
          <Link href="/cheques" className="block">
            <p className="text-muted">Cheque</p>
            <p className="font-medium text-primary">
              {cheque.cheque_number} &middot; {cheque.bank_accounts?.name} &middot; {cheque.cheque_date}
            </p>
            <p className="capitalize text-muted">{cheque.status}</p>
          </Link>
        )}
        {purchase.notes && (
          <div className="col-span-2">
            <p className="text-muted">Notes</p>
            <p className="text-foreground">{purchase.notes}</p>
          </div>
        )}
      </div>

      <h2 className="mb-2 text-lg font-medium text-foreground">Items</h2>
      <div className="mb-6 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-background text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Batch</th>
              <th className="px-4 py-3">Expiry</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Unit Cost</th>
              <th className="px-4 py-3 text-right">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {(lines ?? []).map((line) => {
              const item = line.items as { name: string; code: string } | null;
              return (
                <tr key={line.id} className="border-t border-border">
                  <td className="px-4 py-3 text-foreground">{item?.name}</td>
                  <td className="px-4 py-3 text-muted">{line.batch_number ?? "-"}</td>
                  <td className="px-4 py-3 text-muted">{line.expiry_date ?? "-"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatQuantity(line.quantity)} {line.unit_name}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatCurrency(line.unit_cost)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatCurrency(line.line_total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEditHeader && (
        <div>
          <h2 className="mb-2 text-lg font-medium text-foreground">Edit Details</h2>
          <p className="mb-3 text-xs text-muted">
            Only the date, reference number, and notes can be changed here. To fix an item or
            quantity, ask the Owner to delete and re-enter this purchase.
          </p>
          <PurchaseHeaderEditForm
            purchaseId={purchase.id}
            initial={{
              date: purchase.date,
              reference_no: purchase.reference_no ?? "",
              notes: purchase.notes ?? "",
            }}
          />
        </div>
      )}
    </div>
  );
}
