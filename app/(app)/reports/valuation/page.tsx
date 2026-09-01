import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PrintLayout } from "@/components/shared/print-layout";
import { formatCurrency, formatQuantity } from "@/lib/units";

export default async function StockValuationReportPage() {
  await requireProfile();
  const supabase = await createClient();

  const { data: batches } = await supabase
    .from("stock_batches")
    .select("id, batch_number, expiry_date, quantity_remaining, unit_cost, items(id, code, name, base_unit)")
    .neq("quantity_remaining", 0)
    .order("item_id");

  const byItem = new Map<
    string,
    { code: string; name: string; base_unit: string; rows: typeof batches }
  >();

  for (const batch of batches ?? []) {
    const item = batch.items as { id: string; code: string; name: string; base_unit: string };
    if (!byItem.has(item.id)) {
      byItem.set(item.id, { code: item.code, name: item.name, base_unit: item.base_unit, rows: [] });
    }
    byItem.get(item.id)!.rows!.push(batch);
  }

  const groups = [...byItem.values()].sort((a, b) => a.name.localeCompare(b.name));
  const grandTotal = (batches ?? []).reduce((sum, b) => sum + b.quantity_remaining * b.unit_cost, 0);

  return (
    <PrintLayout title="Stock Valuation Report" subtitle="Current stock, batch-wise breakdown">
      {groups.map((group) => {
        const itemQty = group.rows!.reduce((s, b) => s + b.quantity_remaining, 0);
        const itemValue = group.rows!.reduce((s, b) => s + b.quantity_remaining * b.unit_cost, 0);
        return (
          <div key={group.code} className="mb-4 break-inside-avoid">
            <div className="flex items-baseline justify-between border-b border-border pb-1 print:border-black">
              <p className="font-medium text-foreground">
                {group.name} <span className="text-xs text-muted">({group.code})</span>
              </p>
              <p className="text-sm font-medium text-foreground">
                {formatQuantity(itemQty)} {group.base_unit} &middot; {formatCurrency(itemValue)}
              </p>
            </div>
            <table className="w-full text-left text-sm">
              <tbody>
                {group.rows!.map((b) => (
                  <tr key={b.id} className="border-b border-border text-muted print:border-gray-200">
                    <td className="py-1 pl-3">{b.batch_number ?? "No batch #"}</td>
                    <td className="py-1">{b.expiry_date ?? "-"}</td>
                    <td className="py-1 text-right tabular-nums">
                      {formatQuantity(b.quantity_remaining)} {group.base_unit}
                    </td>
                    <td className="py-1 text-right tabular-nums">{formatCurrency(b.unit_cost)}</td>
                    <td className="py-1 pr-1 text-right tabular-nums">
                      {formatCurrency(b.quantity_remaining * b.unit_cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      {groups.length === 0 && <p className="py-8 text-center text-muted">No stock on hand.</p>}

      <div className="mt-4 flex justify-between border-t-2 border-foreground pt-2 print:border-black">
        <p className="font-semibold text-foreground">Grand Total</p>
        <p className="font-semibold text-foreground">{formatCurrency(grandTotal)}</p>
      </div>
    </PrintLayout>
  );
}
