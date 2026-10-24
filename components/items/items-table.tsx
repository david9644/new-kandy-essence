"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency, formatQuantity } from "@/lib/units";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";

export interface ItemRow {
  id: string;
  code: string;
  name: string;
  category_name: string | null;
  base_unit: string;
  reorder_level: number;
  /** Owner only: left out (not even sent to the browser) for a Store Keeper. */
  last_purchase_cost?: number | null;
  active: boolean;
}

// One page of items (the server pages and searches, so 3,000 items cost no
// more than 50). The search box submits to the server; Prev / Next are links.
export function ItemsTable({
  items,
  total,
  page,
  pageSize,
  query,
  showCost,
}: {
  items: ItemRow[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  /** Purchase costs are for the Owner only. */
  showCost: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(query);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  function href(p: number, q: string): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/items?${s}` : "/items";
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    router.push(href(1, text.trim()));
  }

  return (
    <div>
      <form onSubmit={submit} className="mb-4 flex gap-2">
        <KeyboardTextInput
          value={text}
          onChange={setText}
          placeholder="Search by name or code..."
          className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="submit"
          className="h-12 shrink-0 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground"
        >
          Search
        </button>
        {query && (
          <Link
            href="/items"
            className="flex h-12 shrink-0 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground"
          >
            Clear
          </Link>
        )}
      </form>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-background text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3 text-right">Reorder Lvl</th>
              {showCost && <th className="px-4 py-3 text-right">Last Cost</th>}
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <Link href={`/items/${item.id}`} className="font-medium text-primary">
                    {item.code}
                  </Link>
                </td>
                <td className="px-4 py-3 text-foreground">{item.name}</td>
                <td className="px-4 py-3 text-muted">{item.category_name ?? "-"}</td>
                <td className="px-4 py-3 text-muted">{item.base_unit}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatQuantity(item.reorder_level)}
                </td>
                {showCost && (
                  <td className="px-4 py-3 text-right tabular-nums">
                    {item.last_purchase_cost != null ? formatCurrency(item.last_purchase_cost) : "-"}
                  </td>
                )}
                <td className="px-4 py-3">
                  {item.active ? (
                    <span className="rounded-full bg-success-surface px-2 py-1 text-xs font-medium text-success">
                      Active
                    </span>
                  ) : (
                    <span className="rounded-full bg-border px-2 py-1 text-xs font-medium text-muted">
                      Inactive
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={showCost ? 7 : 6} className="px-4 py-8 text-center text-muted">
                  No items found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-muted">
        <span>
          {total} {total === 1 ? "item" : "items"} &middot; page {Math.min(page, pages)} of {pages}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={href(page - 1, query)}
              className="flex h-11 items-center rounded-lg border border-border px-4 font-medium text-foreground"
            >
              &larr; Previous
            </Link>
          )}
          {page < pages && (
            <Link
              href={href(page + 1, query)}
              className="flex h-11 items-center rounded-lg border border-border px-4 font-medium text-foreground"
            >
              Next &rarr;
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
