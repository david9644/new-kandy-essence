// What the till keeps in the browser between bills.
//
// The shelf (every item with its price and stock) is large on a big shop. Reloading it from
// the server after every bill made the fresh bill wait for it. The till now remembers the
// last shelf and customer list here, shows the next bill from them at once, and refreshes
// them in the background (the stock numbers are then exact again within a moment). The sold
// quantities are already taken off the remembered shelf when a bill is saved.
//
// Lives only in this browser tab's memory (a reload or a logout starts clean).
import type { CustomerOption } from "@/components/billing/bill-types";
import type { Shelf } from "./shelf";

// The page of a fresh bill that opens from this memory (the server sends no shelf with it).
export const FRESH_BILL_HREF = "/billing/new?c=1";

/** router.prefetch options asking for the WHOLE page (a dynamic page is otherwise only
 * prefetched down to its shell). The enum value is Next's own string "full". */
export const FULL_PREFETCH = { kind: "full" } as unknown as { kind: never };

let shelf: Shelf | null = null;
let customers: CustomerOption[] | null = null;

export function rememberShelf(next: Shelf | null) {
  if (next) shelf = next;
}

export function rememberCustomers(next: CustomerOption[]) {
  customers = next;
}

export function recallTill(): { shelf: Shelf | null; customers: CustomerOption[] | null } {
  return { shelf, customers };
}

// A bill that printed but whose print could not be recorded on the bill. The print view
// leaves for the fresh bill at once, so it cannot show this itself: the till does.
let unrecorded: string[] = [];
const listeners = new Set<(invoiceNo: string) => void>();

export function flagUnrecordedPrint(invoiceNo: string) {
  unrecorded = [...unrecorded, invoiceNo];
  listeners.forEach((l) => l(invoiceNo));
}

export function unrecordedPrints(): string[] {
  return [...unrecorded];
}

export function clearUnrecordedPrints() {
  unrecorded = [];
}

export function onUnrecordedPrint(cb: (invoiceNo: string) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
