import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getLowStockItems, getNearExpiryBatches, todayInBusinessTz } from "@/lib/stock/alerts";
import { PrintLayout } from "@/components/shared/print-layout";
import { BackButton } from "@/components/shared/back-button";
import { formatCurrency, formatQuantity } from "@/lib/units";

export default async function DailySummaryReportPage() {
  await requireProfile();
  const supabase = await createClient();
  const today = todayInBusinessTz();

  const [{ data: purchases }, { data: stockOut }, lowStock, nearExpiry] = await Promise.all([
    supabase.from("purchases").select("id, total_amount, suppliers(name)").eq("date", today),
    supabase
      .from("stock_out")
      .select("id, quantity, unit_name, items(name)")
      .eq("date", today),
    getLowStockItems(supabase),
    getNearExpiryBatches(supabase),
  ]);

  const purchaseTotal = (purchases ?? []).reduce((sum, p) => sum + p.total_amount, 0);

  return (
    <>
      <BackButton href="/reports" />
      <PrintLayout title="Daily Summary" subtitle={today}>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg bg-background p-3 print:border print:border-gray-300">
          <p className="text-xs text-muted">Purchases Today</p>
          <p className="text-xl font-semibold text-foreground">{(purchases ?? []).length}</p>
          <p className="text-xs text-muted">{formatCurrency(purchaseTotal)}</p>
        </div>
        <div className="rounded-lg bg-background p-3 print:border print:border-gray-300">
          <p className="text-xs text-muted">Stock-Out Entries Today</p>
          <p className="text-xl font-semibold text-foreground">{(stockOut ?? []).length}</p>
        </div>
        <div className="rounded-lg bg-background p-3 print:border print:border-gray-300">
          <p className="text-xs text-muted">Low Stock Items</p>
          <p className="text-xl font-semibold text-danger">{lowStock.length}</p>
        </div>
        <div className="rounded-lg bg-background p-3 print:border print:border-gray-300">
          <p className="text-xs text-muted">Near-Expiry Batches</p>
          <p className="text-xl font-semibold text-warning">{nearExpiry.length}</p>
        </div>
      </div>

      <h2 className="mb-2 font-medium text-foreground">Today&rsquo;s Purchases</h2>
      <table className="mb-6 w-full text-left text-sm">
        <tbody>
          {(purchases ?? []).map((p) => (
            <tr key={p.id} className="border-b border-border print:border-gray-300">
              <td className="py-2">{(p.suppliers as { name: string } | null)?.name}</td>
              <td className="py-2 text-right tabular-nums">{formatCurrency(p.total_amount)}</td>
            </tr>
          ))}
          {(purchases ?? []).length === 0 && (
            <tr>
              <td className="py-4 text-center text-muted">No purchases today.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h2 className="mb-2 font-medium text-foreground">Today&rsquo;s Stock-Out</h2>
      <table className="w-full text-left text-sm">
        <tbody>
          {(stockOut ?? []).map((s) => (
            <tr key={s.id} className="border-b border-border print:border-gray-300">
              <td className="py-2">{(s.items as { name: string } | null)?.name}</td>
              <td className="py-2 text-right tabular-nums">
                {formatQuantity(s.quantity)} {s.unit_name}
              </td>
            </tr>
          ))}
          {(stockOut ?? []).length === 0 && (
            <tr>
              <td className="py-4 text-center text-muted">No stock-out today.</td>
            </tr>
          )}
        </tbody>
      </table>
      </PrintLayout>
    </>
  );
}
