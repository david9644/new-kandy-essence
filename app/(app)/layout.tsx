import { requireProfile } from "@/lib/auth/session";
import { AppFooter } from "@/components/shared/app-footer";
import { LogoutButton } from "@/components/shared/logout-button";
import { MoreNavMenu } from "@/components/shared/more-nav-menu";
import { PrimaryNav, type NavAccent } from "@/components/shared/primary-nav";

const PRIMARY_NAV_ITEMS: Array<{
  href: string;
  label: string;
  ownerOnly?: boolean;
  accent?: NavAccent;
}> = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/purchases", label: "Purchases", accent: "purchases" },
  { href: "/stock/out", label: "Stock-Out", accent: "stock" },
  { href: "/stock", label: "Stock", accent: "stock" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/customers", label: "Customers", ownerOnly: true },
  { href: "/cheques", label: "Cheques", ownerOnly: true, accent: "cheques" },
  { href: "/reports", label: "Reports" },
];

// Everything that isn't a primary tab lives behind the "More" button --
// Opening Stock included, since Add Item now covers starting stock for a
// new item and this is only needed occasionally (adding stock to an item
// that already exists). Payments lives on each supplier's own ledger page
// now, not as a separate global screen.
const MORE_NAV_ITEMS: Array<{ href: string; label: string; ownerOnly?: boolean }> = [
  { href: "/items", label: "Items" },
  { href: "/stock/opening", label: "Opening Stock", ownerOnly: true },
  { href: "/stock/adjustments", label: "Adjustments", ownerOnly: true },
  { href: "/users", label: "Users", ownerOnly: true },
  { href: "/settings", label: "Settings", ownerOnly: true },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const visiblePrimaryItems = PRIMARY_NAV_ITEMS.filter(
    (item) => !item.ownerOnly || profile.role === "owner"
  );
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
          <PrimaryNav items={visiblePrimaryItems} />
          <MoreNavMenu items={visibleMoreItems} />
        </nav>
      </header>

      <main className="p-4">{children}</main>

      <AppFooter />
    </div>
  );
}
