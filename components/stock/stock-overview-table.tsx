"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCurrency, formatQuantity } from "@/lib/units";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";

export interface StockRow {
  id: string;
  code: string;
  name: string;
  base_unit: string;
  reorder_level: number;
  secondary_unit: { unit_name: string; conversion_factor_to_base: number } | null;
  total_quantity: number;
  total_value: number;
}

export function StockOverviewTable({ rows }: { rows: StockRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)
    );
  }, [rows, query]);

  return (
    <div>
      <KeyboardTextInput
        value={query}
        onChange={setQuery}
        placeholder="Search by name or code..."
        className="mb-4 w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-background text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3 text-right">On Hand</th>
              <th className="px-4 py-3 text-right">Avg Cost</th>
              <th className="px-4 py-3 text-right">Stock Value</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const low = row.total_quantity <= row.reorder_level;
              const avgCost = row.total_quantity !== 0 ? row.total_value / row.total_quantity : 0;
              const secondaryQty = row.secondary_unit
                ? row.total_quantity / row.secondary_unit.conversion_factor_to_base
                : null;
              return (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link href={`/stock/${row.id}`} className="font-medium text-primary">
                      {row.name}
                    </Link>
                    <p className="text-xs text-muted">{row.code}</p>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={low ? "font-semibold text-danger" : "text-foreground"}>
                      {formatQuantity(row.total_quantity)} {row.base_unit}
                    </span>
                    {secondaryQty != null && (
                      <p className="text-xs text-muted">
                        {formatQuantity(secondaryQty)} {row.secondary_unit!.unit_name}
                      </p>
                    )}
                    {low && <p className="text-xs text-danger">Reorder</p>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatCurrency(avgCost)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatCurrency(row.total_value)}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
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
