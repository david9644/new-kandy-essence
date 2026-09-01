import Link from "next/link";
import { requireProfile } from "@/lib/auth/session";

const REPORTS: Array<{ href: string; label: string; description: string; ownerOnly?: boolean }> = [
  { href: "/reports/daily-summary", label: "Daily Summary", description: "One-page snapshot for today" },
  { href: "/reports/purchases", label: "Purchase Report", description: "By date range, supplier, or item" },
  { href: "/reports/valuation", label: "Stock Valuation", description: "Current stock value, batch-wise" },
  { href: "/reports/low-stock", label: "Low Stock", description: "Items at or below reorder level" },
  { href: "/reports/near-expiry", label: "Near-Expiry", description: "Batches expiring soon" },
  { href: "/reports/supplier", label: "Supplier-wise", description: "Purchases, payments, balances", ownerOnly: true },
];

export default async function ReportsIndexPage() {
  const profile = await requireProfile();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-2xl font-semibold text-foreground">Reports</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {REPORTS.filter((r) => !r.ownerOnly || profile.role === "owner").map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="rounded-xl border border-border bg-surface p-4 active:bg-background"
          >
            <p className="font-medium text-foreground">{r.label}</p>
            <p className="text-sm text-muted">{r.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
