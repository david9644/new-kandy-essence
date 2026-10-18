import Link from "next/link";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/units";
import { todayIso } from "@/lib/billing-data";

const MAX_ROWS = 300;

export default async function BillingListPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; q?: string }>;
}) {
  const { from, to, q } = await searchParams;
  await requireProfile();
  const supabase = await createClient();

  const today = todayIso();
  const fromDate = from || today;
  const toDate = to || today;
  // PostgREST's or() filter uses , ( ) as syntax -- strip them from free text
  const search = (q ?? "").replace(/[,()%*]/g, " ").trim();

  // Deleted bills never come back: RLS only lets 'issued' invoices through.
  let query = supabase
    .from("invoices")
    .select("id, invoice_no, date, customer_name, customer_code, total, paid_amount, credit_amount")
    .gte("date", fromDate)
    .lte("date", toDate)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (search) {
    query = query.or(
      `invoice_no.ilike.%${search}%,customer_name.ilike.%${search}%,customer_code.ilike.%${search}%`
    );
  }
  const { data: invoices } = await query;

  const rows = invoices ?? [];
  const totalSum = rows.reduce((sum, r) => sum + r.total, 0);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Billing</h1>
        <Link
          href="/billing/new"
          className="flex h-12 items-center rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground"
        >
          + New Bill
        </Link>
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
        <div className="min-w-[10rem] flex-1">
          <label className="mb-1 block text-xs font-medium text-muted">
            Search bill no. / customer
          </label>
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="INV-0001 or customer name"
            className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:border-primary focus:outline-none"
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
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-background text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Bill no.</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Paid</th>
              <th className="px-4 py-3 text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border active:bg-background">
                <td className="px-4 py-0">
                  <Link href={`/billing/${r.id}`} className="block py-3 font-medium text-primary">
                    {r.invoice_no}
                  </Link>
                </td>
                <td className="px-4 py-3 text-foreground">{r.date}</td>
                <td className="px-4 py-3 text-foreground">
                  {r.customer_name ? `${r.customer_name} (${r.customer_code})` : "Walk-in"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {formatCurrency(r.total)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {formatCurrency(r.paid_amount)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {r.credit_amount > 0 ? (
                    <span className="font-medium text-warning">{formatCurrency(r.credit_amount)}</span>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  No bills in this date range.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-border bg-background text-sm font-medium">
                <td className="px-4 py-3 text-muted" colSpan={3}>
                  {rows.length} {rows.length === 1 ? "bill" : "bills"}
                  {rows.length === MAX_ROWS ? " (showing the latest 300)" : ""}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {formatCurrency(totalSum)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
