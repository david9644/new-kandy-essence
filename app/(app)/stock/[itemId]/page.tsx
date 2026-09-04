import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatQuantity } from "@/lib/units";
import { NEAR_EXPIRY_DAYS, BUSINESS_TIMEZONE } from "@/lib/constants";
import { StockRealtimeRefresh } from "@/components/stock/stock-realtime-refresh";

function daysUntil(dateStr: string): number {
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: BUSINESS_TIMEZONE }));
  const target = new Date(dateStr);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export default async function StockBatchesPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  await requireProfile();
  const supabase = await createClient();

  const [{ data: item }, { data: batches }] = await Promise.all([
    supabase.from("items").select("*").eq("id", itemId).maybeSingle(),
    supabase
      .from("stock_batches")
      .select("id, batch_number, expiry_date, quantity_remaining, unit_cost, created_at")
      .eq("item_id", itemId)
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
  ]);

  if (!item) notFound();

  const activeBatches = (batches ?? []).filter((b) => b.quantity_remaining !== 0);

  return (
    <div className="border-t-[3px] border-t-accent-stock pt-3">
      <StockRealtimeRefresh />
      <h1 className="text-2xl font-semibold text-foreground">{item.name}</h1>
      <p className="mb-4 text-sm text-muted">
        {item.code} &middot; Base unit: {item.base_unit}
        {item.batch_tracked ? "" : " · not batch-tracked"}
      </p>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-background text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Batch</th>
              <th className="px-4 py-3">Expiry</th>
              <th className="px-4 py-3 text-right">Remaining</th>
              <th className="px-4 py-3 text-right">Unit Cost</th>
              <th className="px-4 py-3 text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {activeBatches.map((batch) => {
              const negative = batch.quantity_remaining < 0;
              const nearExpiry =
                batch.expiry_date != null && daysUntil(batch.expiry_date) <= NEAR_EXPIRY_DAYS;
              return (
                <tr key={batch.id} className="border-t border-border">
                  <td className="px-4 py-3 text-foreground">{batch.batch_number ?? "-"}</td>
                  <td className="px-4 py-3">
                    {batch.expiry_date ? (
                      <span className={nearExpiry ? "font-medium text-warning" : "text-foreground"}>
                        {batch.expiry_date}
                        {nearExpiry ? " (soon)" : ""}
                      </span>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={negative ? "font-semibold text-danger" : "text-foreground"}>
                      {formatQuantity(batch.quantity_remaining)} {item.base_unit}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatCurrency(batch.unit_cost)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatCurrency(batch.quantity_remaining * batch.unit_cost)}
                  </td>
                </tr>
              );
            })}
            {activeBatches.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No stock recorded for this item yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
