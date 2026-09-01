import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getLowStockItems } from "@/lib/stock/alerts";
import { PrintLayout } from "@/components/shared/print-layout";
import { formatQuantity } from "@/lib/units";

export default async function LowStockReportPage() {
  await requireProfile();
  const supabase = await createClient();
  const rows = await getLowStockItems(supabase);

  return (
    <PrintLayout title="Low Stock Report" subtitle={`${rows.length} item(s) at or below reorder level`}>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted print:border-black">
          <tr>
            <th className="py-2">Code</th>
            <th className="py-2">Item</th>
            <th className="py-2 text-right">On Hand</th>
            <th className="py-2 text-right">Reorder Level</th>
            <th className="py-2 text-right">Short By</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border print:border-gray-300">
              <td className="py-2">{r.code}</td>
              <td className="py-2">{r.name}</td>
              <td className="py-2 text-right tabular-nums">
                {formatQuantity(r.total_quantity)} {r.base_unit}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatQuantity(r.reorder_level)} {r.base_unit}
              </td>
              <td className="py-2 text-right tabular-nums font-medium text-danger">
                {formatQuantity(Math.max(0, r.reorder_level - r.total_quantity))} {r.base_unit}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-muted">
                Nothing at or below reorder level.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </PrintLayout>
  );
}
