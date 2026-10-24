// Which navigation tab is "current" for a path: the item whose href matches the
// path (exactly, or as a parent folder) and is the longest such href. So
// /items/prices is Price list, not Items; /stock/out is Stock-Out, not Stock;
// /billing, /billing/new and /billing/<id> are all Billing.

function matches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function activeNavHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (matches(pathname, href) && (!best || href.length > best.length)) best = href;
  }
  return best;
}
