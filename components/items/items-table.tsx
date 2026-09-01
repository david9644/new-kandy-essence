"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCurrency, formatQuantity } from "@/lib/units";

export interface ItemRow {
  id: string;
  code: string;
  name: string;
  category_name: string | null;
  base_unit: string;
  reorder_level: number;
  last_purchase_cost: number | null;
  active: boolean;
}

export function ItemsTable({ items }: { items: ItemRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)
    );
  }, [items, query]);

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or code..."
        className="mb-4 w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-background text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3 text-right">Reorder Lvl</th>
              <th className="px-4 py-3 text-right">Last Cost</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
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
                <td className="px-4 py-3 text-right tabular-nums">
                  {item.last_purchase_cost != null ? formatCurrency(item.last_purchase_cost) : "-"}
                </td>
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  No items found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
