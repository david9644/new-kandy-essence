import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { ItemsTable, type ItemRow } from "@/components/items/items-table";

const PAGE_SIZE = 50;

// "name.ilike.*x*" is the API's filter syntax: keep the user's text from
// breaking it (commas, brackets, wildcards).
function safeTerm(q: string): string {
  return q.replace(/[,()*%_\\]/g, " ").trim();
}

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));
  const supabase = await createClient();

  let query = supabase
    .from("items")
    .select("id, code, name, base_unit, reorder_level, last_purchase_cost, active, categories(name)", {
      count: "exact",
    })
    .order("name")
    .order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const term = safeTerm(q);
  if (term) query = query.or(`name.ilike.*${term}*,code.ilike.*${term}*`);

  const { data, count } = await query;

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Items</h1>
        {profile.role === "owner" && (
          <div className="flex gap-2">
            <Link
              href="/items/prices"
              className="flex h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground active:bg-background"
            >
              Price list
            </Link>
            <Link
              href="/items/new"
              className="flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground active:opacity-90"
            >
              + Add Item
            </Link>
          </div>
        )}
      </div>
      <ItemsTable items={items} total={count ?? items.length} page={page} pageSize={PAGE_SIZE} query={q} />
    </div>
  );
}
