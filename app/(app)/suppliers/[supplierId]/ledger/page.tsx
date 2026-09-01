import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/units";

function monthStartIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("en-CA");
}

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
}

export default async function SupplierLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireOwner();
  const { supplierId } = await params;
  const { from, to } = await searchParams;
  const fromDate = from || monthStartIso();
  const toDate = to || todayIso();

  const supabase = await createClient();

  const [{ data: supplier }, { data: balance }, { data: ledger }] = await Promise.all([
    supabase.from("suppliers").select("id, code, name").eq("id", supplierId).maybeSingle(),
    supabase.rpc("get_supplier_balance", { p_supplier_id: supplierId }),
    supabase.rpc("get_supplier_ledger", { p_supplier_id: supplierId, p_from: fromDate, p_to: toDate }),
  ]);

  if (!supplier) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-foreground">{supplier.name}</h1>
      <p className="mb-4 text-sm text-muted">{supplier.code} &middot; Supplier Ledger</p>

      <div className="mb-6 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-muted">Current Outstanding Balance</p>
        <p className="text-3xl font-semibold text-foreground">{formatCurrency(balance ?? 0)}</p>
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">From</label>
          <input
            type="date"
            name="from"
            defaultValue={fromDate}
            className="h-11 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">To</label>
          <input
            type="date"
            name="to"
            defaultValue={toDate}
            className="h-11 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Filter
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-background text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3 text-right">Debit</th>
              <th className="px-4 py-3 text-right">Credit</th>
              <th className="px-4 py-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {(ledger ?? []).map((row, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-4 py-3 text-foreground">{row.entry_date}</td>
                <td className="px-4 py-3 text-foreground">{row.reference}</td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {row.debit ? formatCurrency(row.debit) : "-"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {row.credit ? formatCurrency(row.credit) : "-"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                  {formatCurrency(row.running_balance)}
                </td>
              </tr>
            ))}
            {(ledger ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No activity in this date range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
