import Link from "next/link";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { StockOutForm } from "@/components/stock/stock-out-form";
import { formatQuantity } from "@/lib/units";

export default async function StockOutPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: itemsData }, { data: recent }] = await Promise.all([
    supabase
      .from("items")
      .select("id, code, name, base_unit, item_units(unit_name, conversion_factor_to_base)")
      .eq("active", true)
      .order("name"),
    supabase
      .from("stock_out")
      .select("id, quantity, unit_name, date, items(name)")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const items = (itemsData ?? []).map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    base_unit: item.base_unit,
    units: item.item_units,
  }));

  return (
    <div className="mx-auto max-w-lg border-t-[3px] border-t-accent-stock pt-3">
      <h1 className="mb-4 text-2xl font-semibold text-foreground">Stock-Out</h1>
      <StockOutForm items={items} />

      <h2 className="mb-2 mt-8 text-lg font-medium text-foreground">Recent Stock-Outs</h2>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {(recent ?? []).map((s) => (
          <li key={s.id}>
            <Link
              href={`/stock/out/${s.id}`}
              className="flex min-h-[44px] items-center justify-between px-4 py-3 text-sm active:bg-background"
            >
              <div>
                <p className="font-medium text-foreground">
                  {(s.items as { name: string } | null)?.name}
                </p>
                <p className="text-xs text-muted">{s.date}</p>
              </div>
              <span className="tabular-nums text-foreground">
                {formatQuantity(s.quantity)} {s.unit_name}
              </span>
            </Link>
          </li>
        ))}
        {(recent ?? []).length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted">No stock-outs yet.</li>
        )}
      </ul>
      {profile.role !== "owner" && (
        <p className="mt-2 text-xs text-muted">Only the Owner can edit or delete an entry.</p>
      )}
    </div>
  );
}
