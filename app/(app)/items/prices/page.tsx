import Link from "next/link";
import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PriceList, type PriceRowData } from "@/components/items/price-list";

const PAGE_SIZE = 50;
const SORTS = ["name", "code", "category", "recent"] as const;

// Owner only (the database function re-checks). Server-side paging, search,
// category and "no price yet" filters: 3,000 items cost the same as 50.
export default async function ItemPricesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; nop?: string; sort?: string; page?: string }>;
}) {
  await requireOwner();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const cat = /^[0-9a-f-]{36}$/i.test(sp.cat ?? "") ? (sp.cat as string) : "";
  const nop = sp.nop === "1";
  const sort = (SORTS as readonly string[]).includes(sp.sort ?? "") ? (sp.sort as string) : "name";
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));

  const supabase = await createClient();
  const [{ data: list }, { data: categories }] = await Promise.all([
    supabase.rpc("get_item_price_list", {
      p_search: q || undefined,
      p_category: cat || undefined,
      p_only_unpriced: nop,
      p_sort: sort,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    supabase.from("categories").select("id, name").order("name"),
  ]);

  const result = (list ?? { total: 0, rows: [] }) as unknown as { total: number; rows: PriceRowData[] };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-foreground">Price list</h1>
        <Link
          href="/items"
          className="flex h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground active:bg-background"
        >
          Back to Items
        </Link>
      </div>
      <p className="mb-4 text-sm text-muted">
        One selling price per item (per base unit). It is what every bill starts with; a price typed on
        one bill never changes it. Boxes and bags use the unit&rsquo;s size times this price.
      </p>
      <PriceList
        rows={result.rows}
        total={Number(result.total)}
        page={page}
        pageSize={PAGE_SIZE}
        categories={categories ?? []}
        state={{ q, cat, nop, sort }}
      />
    </div>
  );
}
