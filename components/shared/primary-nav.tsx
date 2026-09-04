"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavAccent = "purchases" | "stock" | "cheques";

export interface PrimaryNavItem {
  href: string;
  label: string;
  accent?: NavAccent;
}

const ACCENT_CLASSES: Record<NavAccent, string> = {
  purchases: "border-accent-purchases text-accent-purchases",
  stock: "border-accent-stock text-accent-stock",
  cheques: "border-accent-cheques text-accent-cheques",
};

function isActiveHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// The current tab is whichever item's href is both a match and the longest
// (most specific) one -- e.g. on /stock/out, "/stock/out" wins over the
// shorter "/stock" even though both match as prefixes.
function activeHrefFor(pathname: string, items: PrimaryNavItem[]): string | null {
  let best: string | null = null;
  for (const item of items) {
    if (isActiveHref(pathname, item.href) && (!best || item.href.length > best.length)) {
      best = item.href;
    }
  }
  return best;
}

export function PrimaryNav({ items }: { items: PrimaryNavItem[] }) {
  const pathname = usePathname();
  const activeHref = activeHrefFor(pathname, items);

  return (
    <>
      {items.map((item) => {
        const active = item.href === activeHref;
        const accentClasses = active
          ? (item.accent ? ACCENT_CLASSES[item.accent] : "border-primary text-primary")
          : "border-border bg-background text-foreground";
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex min-h-[44px] items-center rounded-lg border px-4 text-sm font-medium active:bg-border ${accentClasses} ${
              active ? "bg-surface font-semibold" : ""
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
