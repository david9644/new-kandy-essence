import Link from "next/link";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getLowStockItems, getNearExpiryBatches } from "@/lib/stock/alerts";
import { formatQuantity } from "@/lib/units";
import { NEAR_EXPIRY_DAYS } from "@/lib/constants";
import { StockRealtimeRefresh } from "@/components/stock/stock-realtime-refresh";

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [lowStock, nearExpiry] = await Promise.all([
    getLowStockItems(supabase),
    getNearExpiryBatches(supabase),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <StockRealtimeRefresh />
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Welcome, {profile.full_name}</h1>
        <p className="text-sm text-muted">
          {profile.role === "owner" ? "Owner" : "Store Keeper"} view
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-medium text-foreground">Low Stock</h2>
            <span className="rounded-full bg-danger-surface px-2.5 py-1 text-xs font-semibold text-danger">
              {lowStock.length}
            </span>
          </div>
          {lowStock.length === 0 ? (
            <p className="text-sm text-muted">Nothing at or below reorder level.</p>
          ) : (
            <ul className="divide-y divide-border">
              {lowStock.slice(0, 8).map((item) => (
                <li key={item.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/stock/${item.id}`} className="font-medium text-primary">
                    {item.name}
                  </Link>
                  <span className="text-danger">
                    {formatQuantity(item.total_quantity)} / {formatQuantity(item.reorder_level)}{" "}
                    {item.base_unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {lowStock.length > 8 && (
            <Link href="/reports/low-stock" className="mt-3 block text-sm font-medium text-primary">
              View all {lowStock.length} &rarr;
            </Link>
          )}
        </section>

        <section className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-medium text-foreground">
              Near Expiry <span className="text-xs font-normal text-muted">(next {NEAR_EXPIRY_DAYS} days)</span>
            </h2>
            <span className="rounded-full bg-warning-surface px-2.5 py-1 text-xs font-semibold text-warning">
              {nearExpiry.length}
            </span>
          </div>
          {nearExpiry.length === 0 ? (
            <p className="text-sm text-muted">No batches expiring soon.</p>
          ) : (
            <ul className="divide-y divide-border">
              {nearExpiry.slice(0, 8).map((batch) => (
                <li key={batch.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <Link href={`/stock/${batch.item_id}`} className="font-medium text-primary">
                      {batch.item_name}
                    </Link>
                    <p className="text-xs text-muted">{batch.batch_number ?? "No batch #"}</p>
                  </div>
                  <span className={batch.days_remaining < 0 ? "font-medium text-danger" : "text-warning"}>
                    {batch.days_remaining < 0
                      ? "Expired"
                      : batch.days_remaining === 0
                        ? "Today"
                        : `${batch.days_remaining}d`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {nearExpiry.length > 8 && (
            <Link href="/reports/near-expiry" className="mt-3 block text-sm font-medium text-primary">
              View all {nearExpiry.length} &rarr;
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}
