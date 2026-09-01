import Link from "next/link";
import { requireProfile } from "@/lib/auth/session";
import { LogoutButton } from "@/components/shared/logout-button";

const NAV_ITEMS: Array<{ href: string; label: string; ownerOnly?: boolean }> = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/items", label: "Items" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/purchases", label: "Purchases" },
  { href: "/stock", label: "Stock" },
  { href: "/stock/out", label: "Stock-Out" },
  { href: "/stock/opening", label: "Opening Stock", ownerOnly: true },
  { href: "/stock/adjustments", label: "Adjustments", ownerOnly: true },
  { href: "/payments", label: "Payments", ownerOnly: true },
  { href: "/cheques", label: "Cheques", ownerOnly: true },
  { href: "/reports", label: "Reports" },
  { href: "/users", label: "Users", ownerOnly: true },
  { href: "/settings", label: "Settings", ownerOnly: true },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const visibleItems = NAV_ITEMS.filter((item) => !item.ownerOnly || profile.role === "owner");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-surface print:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-base font-semibold text-foreground">New Kandy Essence</p>
            <p className="text-xs text-muted">
              {profile.full_name} · {profile.role === "owner" ? "Owner" : "Store Keeper"}
            </p>
          </div>
          <LogoutButton />
        </div>
        <nav className="flex flex-wrap gap-2 px-4 pb-3">
          {visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-[44px] items-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground active:bg-border"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="p-4">{children}</main>
    </div>
  );
}
