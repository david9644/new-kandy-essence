"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/units";

export interface SupplierRow {
  id: string;
  code: string;
  name: string;
  contact: string | null;
  active: boolean;
}

export function SuppliersTable({
  suppliers,
  balanceBySupplier,
}: {
  suppliers: SupplierRow[];
  balanceBySupplier?: Map<string, number>;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
    );
  }, [suppliers, query]);

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or code..."
        className="mb-4 w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-background text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Contact</th>
              {balanceBySupplier && <th className="px-4 py-3 text-right">Balance</th>}
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <Link href={`/suppliers/${s.id}`} className="font-medium text-primary">
                    {s.code}
                  </Link>
                </td>
                <td className="px-4 py-3 text-foreground">{s.name}</td>
                <td className="px-4 py-3 text-muted">{s.contact ?? "-"}</td>
                {balanceBySupplier && (
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatCurrency(balanceBySupplier.get(s.id) ?? 0)}
                  </td>
                )}
                <td className="px-4 py-3">
                  {s.active ? (
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
                <td colSpan={balanceBySupplier ? 5 : 4} className="px-4 py-8 text-center text-muted">
                  No suppliers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
