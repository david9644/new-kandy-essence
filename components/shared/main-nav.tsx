"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { NavLink } from "@/components/shared/nav-link";
import { Modal } from "@/components/shared/modal";
import { activeNavHref } from "@/lib/nav";

export type NavAccent = "purchases" | "stock" | "cheques";

export interface MainNavItem {
  href: string;
  label: string;
  accent?: NavAccent;
}

const ACCENT_CLASSES: Record<NavAccent, string> = {
  purchases: "border-accent-purchases text-accent-purchases",
  stock: "border-accent-stock text-accent-stock",
  cheques: "border-accent-cheques text-accent-cheques",
};

const TAB =
  "flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-lg border px-3 text-sm font-medium active:bg-border";

// The main tabs plus the "More" button. On a phone the tabs are ONE row that
// scrolls sideways (nothing hidden, the current tab is scrolled into view); from
// tablet width up they wrap onto a second compact row instead. The current tab is
// whichever item (tab or More entry) is the longest match for the path.
export function MainNav({
  items,
  moreItems,
}: {
  items: MainNavItem[];
  moreItems: Array<{ href: string; label: string }>;
}) {
  const pathname = usePathname();
  const active = activeNavHref(pathname, [...items, ...moreItems].map((i) => i.href));
  const moreActive = moreItems.some((m) => m.href === active);
  const [moreOpen, setMoreOpen] = useState(false);
  const strip = useRef<HTMLDivElement>(null);

  // keep the current tab in view when the strip scrolls (phones)
  useEffect(() => {
    const box = strip.current;
    const el = box?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!box || !el || box.scrollWidth <= box.clientWidth) return;
    box.scrollTo({ left: Math.max(0, el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2) });
  }, [pathname]);

  return (
    <nav aria-label="Main">
      <div
        ref={strip}
        className="relative flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:thin] md:flex-wrap md:overflow-visible"
      >
        {items.map((item) => {
          const isActive = item.href === active;
          const look = isActive
            ? `${item.accent ? ACCENT_CLASSES[item.accent] : "border-primary text-primary"} bg-surface font-semibold`
            : "border-border bg-background text-foreground";
          return (
            <NavLink key={item.href} href={item.href} current={isActive} className={`${TAB} ${look}`}>
              {item.label}
            </NavLink>
          );
        })}
        {moreItems.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-current={moreActive ? "page" : undefined}
            className={`${TAB} ${
              moreActive
                ? "border-primary bg-surface font-semibold text-primary"
                : "border-border bg-background text-foreground"
            }`}
          >
            More
          </button>
        )}
      </div>
      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="flex flex-col gap-2">
          {moreItems.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              current={item.href === active}
              onClick={() => setMoreOpen(false)}
              className={`flex min-h-[44px] items-center rounded-lg border px-4 text-sm font-medium active:bg-border ${
                item.href === active
                  ? "border-primary bg-surface font-semibold text-primary"
                  : "border-border bg-background text-foreground"
              }`}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </Modal>
    </nav>
  );
}
