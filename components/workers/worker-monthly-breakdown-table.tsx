import { formatCurrency } from "@/lib/units";
import { formatMonth } from "@/components/workers/format-month";

export interface BreakdownRow {
  month: string;
  salary: number;
  paid: number;
  running_balance: number;
}

// Read-only; rows arrive oldest-first from get_worker_monthly_breakdown and are
// shown newest-first. A negative running balance means salary was paid ahead.
export function WorkerMonthlyBreakdownTable({ rows }: { rows: BreakdownRow[] }) {
  const newestFirst = [...rows].reverse();

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="bg-background text-xs uppercase text-muted">
          <tr>
            <th className="px-4 py-3">Month</th>
            <th className="px-4 py-3 text-right">Salary</th>
            <th className="px-4 py-3 text-right">Paid</th>
            <th className="px-4 py-3 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {newestFirst.map((row) => (
            <tr key={row.month} className="border-t border-border">
              <td className="px-4 py-3 text-foreground">{formatMonth(row.month)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-foreground">
                {row.salary ? formatCurrency(row.salary) : "-"}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-foreground">
                {row.paid ? formatCurrency(row.paid) : "-"}
              </td>
              <td
                className={`px-4 py-3 text-right tabular-nums font-medium ${
                  row.running_balance < 0 ? "text-warning" : "text-foreground"
                }`}
              >
                {formatCurrency(row.running_balance)}
              </td>
            </tr>
          ))}
          {newestFirst.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-muted">
                No months to show yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
