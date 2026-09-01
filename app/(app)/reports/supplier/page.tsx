import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PrintLayout } from "@/components/shared/print-layout";
import { formatCurrency } from "@/lib/units";

function monthStartIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("en-CA");
}

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
}

export default async function SupplierReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireOwner();
  const { from, to } = await searchParams;
  const fromDate = from || monthStartIso();
  const toDate = to || todayIso();

  const supabase = await createClient();
  const { data: rows } = await supabase.rpc("get_suppliers_period_summary", {
    p_from: fromDate,
    p_to: toDate,
  });

  const totals = (rows ?? []).reduce(
    (acc, r) => ({
      purchases: acc.purchases + r.purchases_total,
      payments: acc.payments + r.payments_total,
    }),
    { purchases: 0, payments: 0 }
  );

  return (
    <PrintLayout title="Supplier-wise Report" subtitle={`${fromDate} to ${toDate}`}>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">From</label>
          <input
            type="date"
            name="from"
            defaultValue={fromDate}
            className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">To</label>
          <input
            type="date"
            name="to"
            defaultValue={toDate}
            className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Filter
        </button>
      </form>

      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted print:border-black">
          <tr>
            <th className="py-2">Supplier</th>
            <th className="py-2 text-right">Purchases (period)</th>
            <th className="py-2 text-right">Payments (period)</th>
            <th className="py-2 text-right">Balance (as of {toDate})</th>
          </tr>
        </thead>
        <tbody>
          {(rows ?? [])
            .filter((r) => r.purchases_total || r.payments_total || r.ending_balance)
            .map((r) => (
              <tr key={r.supplier_id} className="border-b border-border print:border-gray-300">
                <td className="py-2">
                  {r.name} <span className="text-xs text-muted">({r.code})</span>
                </td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(r.purchases_total)}</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(r.payments_total)}</td>
                <td className="py-2 text-right tabular-nums font-medium">
                  {formatCurrency(r.ending_balance)}
                </td>
              </tr>
            ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-between border-t-2 border-foreground pt-2 print:border-black">
        <p className="font-semibold text-foreground">Totals</p>
        <div className="flex gap-8 text-right">
          <p className="font-semibold text-foreground">{formatCurrency(totals.purchases)}</p>
          <p className="font-semibold text-foreground">{formatCurrency(totals.payments)}</p>
        </div>
      </div>
    </PrintLayout>
  );
}
