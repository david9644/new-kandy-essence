import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getNearExpiryBatches } from "@/lib/stock/alerts";
import { PrintLayout } from "@/components/shared/print-layout";
import { formatQuantity } from "@/lib/units";
import { NEAR_EXPIRY_DAYS } from "@/lib/constants";

export default async function NearExpiryReportPage() {
  await requireProfile();
  const supabase = await createClient();
  const rows = await getNearExpiryBatches(supabase);

  return (
    <PrintLayout
      title="Near-Expiry Report"
      subtitle={`${rows.length} batch(es) expiring within ${NEAR_EXPIRY_DAYS} days`}
    >
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted print:border-black">
          <tr>
            <th className="py-2">Item</th>
            <th className="py-2">Batch</th>
            <th className="py-2">Expiry Date</th>
            <th className="py-2 text-right">Days Left</th>
            <th className="py-2 text-right">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border print:border-gray-300">
              <td className="py-2">
                {r.item_name} <span className="text-muted">({r.item_code})</span>
              </td>
              <td className="py-2">{r.batch_number ?? "-"}</td>
              <td className="py-2">{r.expiry_date}</td>
              <td className="py-2 text-right tabular-nums font-medium text-warning">
                {r.days_remaining < 0 ? "Expired" : r.days_remaining}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatQuantity(r.quantity_remaining)} {r.base_unit}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-muted">
                No batches expiring soon.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </PrintLayout>
  );
}
