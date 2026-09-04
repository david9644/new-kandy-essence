"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/units";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";

export interface CustomerRow {
  id: string;
  code: string;
  name: string;
  contact: string | null;
}

export function CustomersTable({
  customers,
  balanceByCustomer,
}: {
  customers: CustomerRow[];
  balanceByCustomer: Map<string, number>;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [customers, query]);

  return (
    <div>
      <KeyboardTextInput
        value={query}
        onChange={setQuery}
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
              <th className="px-4 py-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <Link href={`/customers/${c.id}`} className="font-medium text-primary">
                    {c.code}
                  </Link>
                </td>
                <td className="px-4 py-3 text-foreground">{c.name}</td>
                <td className="px-4 py-3 text-muted">{c.contact ?? "-"}</td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {formatCurrency(balanceByCustomer.get(c.id) ?? 0)}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  No customers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
