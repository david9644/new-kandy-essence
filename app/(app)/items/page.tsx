import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { ItemsTable, type ItemRow } from "@/components/items/items-table";

export default async function ItemsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from("items")
    .select("id, code, name, base_unit, reorder_level, last_purchase_cost, active, categories(name)")
    .order("name");

  const items: ItemRow[] = (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    category_name: (row.categories as { name: string } | null)?.name ?? null,
    base_unit: row.base_unit,
    reorder_level: row.reorder_level,
    last_purchase_cost: row.last_purchase_cost,
    active: row.active,
  }));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Items</h1>
        {profile.role === "owner" && (
          <Link
            href="/items/new"
            className="flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground active:opacity-90"
          >
            + Add Item
          </Link>
        )}
      </div>
      <ItemsTable items={items} />
    </div>
  );
}
