import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PrintLayout } from "@/components/shared/print-layout";
import { BackButton } from "@/components/shared/back-button";
import { formatCurrency, formatQuantity } from "@/lib/units";

function monthStartIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("en-CA");
}

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
}

export default async function PurchaseReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; supplier_id?: string; item_id?: string }>;
}) {
  await requireProfile();
  const { from, to, supplier_id, item_id } = await searchParams;
  const fromDate = from || monthStartIso();
  const toDate = to || todayIso();

  const supabase = await createClient();
  const [{ data: suppliers }, { data: items }] = await Promise.all([
    supabase.from("suppliers").select("id, code, name").order("name"),
    supabase.from("items").select("id, code, name").order("name"),
  ]);

  const filterForm = (
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
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Supplier</label>
        <select
          name="supplier_id"
          defaultValue={supplier_id ?? ""}
          className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none"
        >
          <option value="">All suppliers</option>
          {(suppliers ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Item</label>
        <select
          name="item_id"
          defaultValue={item_id ?? ""}
          className="h-11 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-primary focus:outline-none"
        >
          <option value="">All items</option>
          {(items ?? []).map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Filter
      </button>
    </form>
  );

  if (item_id) {
    let query = supabase
      .from("purchase_items")
      .select(
        "id, quantity, unit_name, unit_cost, line_total, purchases!inner(purchase_no, date, supplier_id, suppliers(name))"
      )
      .gte("purchases.date", fromDate)
      .lte("purchases.date", toDate)
      .eq("item_id", item_id);
    if (supplier_id) query = query.eq("purchases.supplier_id", supplier_id);
    const { data: lines } = await query.order("id");

    const total = (lines ?? []).reduce((sum, l) => sum + l.line_total, 0);

    return (
      <>
        <BackButton href="/reports" />
        <PrintLayout title="Purchase Report" subtitle={`${fromDate} to ${toDate}`}>
          {filterForm}
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted print:border-black">
            <tr>
              <th className="py-2">Date</th>
              <th className="py-2">Purchase #</th>
              <th className="py-2">Supplier</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Unit Cost</th>
              <th className="py-2 text-right">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {(lines ?? []).map((l) => {
              const purchase = l.purchases as unknown as {
                purchase_no: number;
                date: string;
                suppliers: { name: string } | null;
              };
              return (
                <tr key={l.id} className="border-b border-border print:border-gray-300">
                  <td className="py-2">{purchase.date}</td>
                  <td className="py-2">#{purchase.purchase_no}</td>
                  <td className="py-2">{purchase.suppliers?.name}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatQuantity(l.quantity)} {l.unit_name}
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(l.unit_cost)}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(l.line_total)}</td>
                </tr>
              );
            })}
            {(lines ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted">
                  No matching purchase lines.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="mt-4 flex justify-between border-t-2 border-foreground pt-2 print:border-black">
          <p className="font-semibold text-foreground">Total</p>
          <p className="font-semibold text-foreground">{formatCurrency(total)}</p>
        </div>
        </PrintLayout>
      </>
    );
  }

  let headerQuery = supabase
    .from("purchases")
    .select("id, purchase_no, date, payment_type, total_amount, suppliers(name)")
    .gte("date", fromDate)
    .lte("date", toDate);
  if (supplier_id) headerQuery = headerQuery.eq("supplier_id", supplier_id);
  const { data: purchases } = await headerQuery.order("date", { ascending: false });

  const total = (purchases ?? []).reduce((sum, p) => sum + p.total_amount, 0);

  return (
    <>
      <BackButton href="/reports" />
      <PrintLayout title="Purchase Report" subtitle={`${fromDate} to ${toDate}`}>
        {filterForm}
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted print:border-black">
          <tr>
            <th className="py-2">Date</th>
            <th className="py-2">Purchase #</th>
            <th className="py-2">Supplier</th>
            <th className="py-2">Payment</th>
            <th className="py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {(purchases ?? []).map((p) => (
            <tr key={p.id} className="border-b border-border print:border-gray-300">
              <td className="py-2">{p.date}</td>
              <td className="py-2">#{p.purchase_no}</td>
              <td className="py-2">{(p.suppliers as { name: string } | null)?.name}</td>
              <td className="py-2 capitalize">{p.payment_type}</td>
              <td className="py-2 text-right tabular-nums">{formatCurrency(p.total_amount)}</td>
            </tr>
          ))}
          {(purchases ?? []).length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-muted">
                No purchases in this range.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="mt-4 flex justify-between border-t-2 border-foreground pt-2 print:border-black">
        <p className="font-semibold text-foreground">Total</p>
        <p className="font-semibold text-foreground">{formatCurrency(total)}</p>
      </div>
      </PrintLayout>
    </>
  );
}
