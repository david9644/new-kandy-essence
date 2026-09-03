import Link from "next/link";
import { requireProfile } from "@/lib/auth/session";
import { LogoutButton } from "@/components/shared/logout-button";
import { MoreNavMenu } from "@/components/shared/more-nav-menu";

const PRIMARY_NAV_ITEMS: Array<{ href: string; label: string }> = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/purchases", label: "Purchases" },
  { href: "/stock", label: "Stock" },
  { href: "/stock/out", label: "Stock-Out" },
];

// Everything that isn't a primary tab lives behind the "More" button --
// Opening Stock included, since Add Item now covers starting stock for a
// new item and this is only needed occasionally (adding stock to an item
// that already exists).
const MORE_NAV_ITEMS: Array<{ href: string; label: string; ownerOnly?: boolean }> = [
  { href: "/items", label: "Items" },
  { href: "/suppliers", label: "Suppliers" },
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
  const visibleMoreItems = MORE_NAV_ITEMS.filter(
    (item) => !item.ownerOnly || profile.role === "owner"
  );

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
          {PRIMARY_NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-[44px] items-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground active:bg-border"
            >
              {item.label}
            </Link>
          ))}
          <MoreNavMenu items={visibleMoreItems} />
        </nav>
      </header>

      <main className="p-4">{children}</main>
    </div>
  );
}
