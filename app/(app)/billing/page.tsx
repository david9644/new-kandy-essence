import Link from "next/link";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/units";
import { todayIso } from "@/lib/billing-data";
import { oneMonthBefore } from "@/lib/dates";

const PAGE_SIZE = 50;

export default async function BillingListPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; q?: string; page?: string }>;
}) {
  const { from, to, q, page: pageParam } = await searchParams;
  await requireProfile();
  const supabase = await createClient();

  const today = todayIso();
  // The list opens on the last month (same day one month back, Asia/Colombo).
  const fromDate = from || oneMonthBefore(today);
  const toDate = to || today;
  const page = Math.max(1, Math.floor(Number(pageParam) || 1));
  // PostgREST's or() filter uses , ( ) as syntax -- strip them from free text
  const search = (q ?? "").replace(/[,()%*]/g, " ").trim();

  // Deleted bills never come back: RLS only lets 'issued' invoices through.
  let query = supabase
    .from("invoices")
    .select("id, invoice_no, date, customer_name, customer_code, total, paid_amount, credit_amount", {
      count: "exact",
    })
    .gte("date", fromDate)
    .lte("date", toDate)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (search) {
    query = query.or(
      `invoice_no.ilike.%${search}%,customer_name.ilike.%${search}%,customer_code.ilike.%${search}%`
    );
  }
  const { data: invoices, count } = await query;

  const rows = invoices ?? [];
  const totalSum = rows.reduce((sum, r) => sum + r.total, 0);
  const totalRows = count ?? rows.length;
  const pages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  function pageHref(p: number): string {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/billing?${qs}` : "/billing";
  }

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
                  {totalRows} {totalRows === 1 ? "bill" : "bills"}
                  {pages > 1 ? ` · page ${Math.min(page, pages)} of ${pages} · total below is for this page` : ""}
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
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          {page > 1 && (
            <Link
              href={pageHref(page - 1)}
              className="flex h-11 items-center rounded-lg border border-border px-4 font-medium text-foreground"
            >
              &larr; Previous
            </Link>
          )}
          {page < pages && (
            <Link
              href={pageHref(page + 1)}
              className="flex h-11 items-center rounded-lg border border-border px-4 font-medium text-foreground"
            >
              Next &rarr;
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
