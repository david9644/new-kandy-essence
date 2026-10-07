"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCurrency } from "@/lib/units";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";

export interface WorkerRow {
  id: string;
  code: string;
  name: string;
  position: string | null;
  monthly_salary: number | null;
}

export interface LastPaid {
  date: string;
  period: string | null;
}

export function WorkersTable({
  workers,
  lastPaidByWorker,
  balanceByWorker,
}: {
  workers: WorkerRow[];
  lastPaidByWorker: Map<string, LastPaid>;
  balanceByWorker: Map<string, number>;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workers;
    return workers.filter(
      (w) => w.name.toLowerCase().includes(q) || w.code.toLowerCase().includes(q)
    );
  }, [workers, query]);

  return (
    <div>
      <KeyboardTextInput
        value={query}
        onChange={setQuery}
        placeholder="Search by name or code..."
        className="mb-4 w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-background text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Position</th>
              <th className="px-4 py-3">Last Paid</th>
              <th className="px-4 py-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((w) => {
              const lastPaid = lastPaidByWorker.get(w.id);
              const balance = balanceByWorker.get(w.id) ?? 0;
              return (
                <tr key={w.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link href={`/workers/${w.id}`} className="font-medium text-primary">
                      {w.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-foreground">{w.name}</td>
                  <td className="px-4 py-3 text-muted">{w.position ?? "-"}</td>
                  <td className="px-4 py-3 text-muted">
                    {lastPaid
                      ? `${lastPaid.date}${lastPaid.period ? ` · ${lastPaid.period}` : ""}`
                      : "-"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {w.monthly_salary == null || balance === 0 ? (
                      <span className="text-muted">-</span>
                    ) : balance > 0 ? (
                      <span className="text-foreground">Due {formatCurrency(balance)}</span>
                    ) : (
                      <span className="font-medium text-warning">
                        Advance {formatCurrency(Math.abs(balance))}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No workers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
