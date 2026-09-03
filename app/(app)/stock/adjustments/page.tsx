import Link from "next/link";
import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StockAdjustmentForm } from "@/components/stock/stock-adjustment-form";
import { formatQuantity } from "@/lib/units";

export default async function StockAdjustmentsPage() {
  await requireOwner();
  const supabase = await createClient();

  const [{ data: items }, { data: recent }] = await Promise.all([
    supabase.from("items").select("id, code, name, base_unit").eq("active", true).order("name"),
    supabase
      .from("stock_adjustments")
      .select("id, quantity_change, reason, date, items(name, base_unit)")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-2xl font-semibold text-foreground">Stock Adjustment</h1>
      <p className="mb-4 text-sm text-muted">
        Correct a count -- damage, wastage, or a miscount found during the manual-to-digital
        transition.
      </p>
      <StockAdjustmentForm items={items ?? []} />

      <h2 className="mb-2 mt-8 text-lg font-medium text-foreground">Recent Adjustments</h2>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {(recent ?? []).map((a) => {
          const item = a.items as { name: string; base_unit: string } | null;
          return (
            <li key={a.id}>
              <Link
                href={`/stock/adjustments/${a.id}`}
                className="flex min-h-[44px] items-center justify-between px-4 py-3 text-sm active:bg-background"
              >
                <div>
                  <p className="font-medium text-foreground">{item?.name}</p>
                  <p className="text-xs text-muted">
                    {a.date} &middot; {a.reason}
                  </p>
                </div>
                <span className={a.quantity_change >= 0 ? "tabular-nums text-success" : "tabular-nums text-danger"}>
                  {a.quantity_change >= 0 ? "+" : ""}
                  {formatQuantity(a.quantity_change)} {item?.base_unit}
                </span>
              </Link>
            </li>
          );
        })}
        {(recent ?? []).length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted">No adjustments yet.</li>
        )}
      </ul>
    </div>
  );
}
