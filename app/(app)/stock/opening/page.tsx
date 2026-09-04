import Link from "next/link";
import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { OpeningStockForm } from "@/components/stock/opening-stock-form";
import { formatQuantity } from "@/lib/units";

export default async function OpeningStockPage() {
  await requireOwner();
  const supabase = await createClient();

  const [{ data: itemsData }, { data: recent }] = await Promise.all([
    supabase
      .from("items")
      .select("id, code, name, base_unit, batch_tracked, item_units(unit_name, conversion_factor_to_base)")
      .eq("active", true)
      .order("name"),
    supabase
      .from("opening_stock_entries")
      .select("id, quantity, unit_name, created_at, items(name)")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const items = (itemsData ?? []).map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    base_unit: item.base_unit,
    batch_tracked: item.batch_tracked,
    units: item.item_units,
  }));

  return (
    <div className="mx-auto max-w-lg border-t-[3px] border-t-accent-stock pt-3">
      <h1 className="mb-1 text-2xl font-semibold text-foreground">Opening Stock Entry</h1>
      <p className="mb-4 text-sm text-muted">
        For go-live data entry from your manual books, or adding a found batch. Creates a stock
        batch directly -- no supplier or purchase record is involved.
      </p>
      <OpeningStockForm items={items} />

      <h2 className="mb-2 mt-8 text-lg font-medium text-foreground">Recent Entries</h2>
      <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
        {(recent ?? []).map((e) => (
          <li key={e.id}>
            <Link
              href={`/stock/opening/${e.id}`}
              className="flex min-h-[44px] items-center justify-between px-4 py-3 text-sm active:bg-background"
            >
              <p className="font-medium text-foreground">
                {(e.items as { name: string } | null)?.name}
              </p>
              <span className="tabular-nums text-foreground">
                {formatQuantity(e.quantity)} {e.unit_name}
              </span>
            </Link>
          </li>
        ))}
        {(recent ?? []).length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted">No entries yet.</li>
        )}
      </ul>
    </div>
  );
}
