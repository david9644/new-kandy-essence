// The bill while it is a local draft. Pure helpers; money in integer cents.

import { grossCents, num, toCents } from "../billing";
import type { ShelfItem } from "./shelf";

export interface DraftLine {
  key: string;
  itemId: string;
  unitName: string;
  quantity: string;
  /** Empty string = no price yet (blocks saving). "0" is a deliberate free line. */
  unitPrice: string;
  discount: string;
}

export function lineMissingPrice(l: DraftLine): boolean {
  return l.unitPrice.trim() === "";
}

export function lineIsFree(l: DraftLine): boolean {
  return !lineMissingPrice(l) && toCents(num(l.unitPrice)) === 0;
}

/** A tap on a tile: the same item + unit adds one, otherwise a new line. */
export function addOrIncrement(
  lines: DraftLine[],
  itemId: string,
  unitName: string,
  price: number | null,
  newKey: string
): { lines: DraftLine[]; key: string; created: boolean } {
  const existing = lines.find((l) => l.itemId === itemId && l.unitName === unitName);
  if (existing) {
    const next = String(Math.round((num(existing.quantity) + 1) * 1000) / 1000);
    return {
      lines: lines.map((l) => (l.key === existing.key ? { ...l, quantity: next } : l)),
      key: existing.key,
      created: false,
    };
  }
  return {
    lines: [
      ...lines,
      {
        key: newKey,
        itemId,
        unitName,
        quantity: "1",
        unitPrice: price === null ? "" : String(price),
        discount: "",
      },
    ],
    key: newKey,
    created: true,
  };
}

export function factorFor(item: ShelfItem | undefined, unitName: string): number {
  if (!item) return 1;
  return item.units.find((u) => u.unit_name === unitName)?.factor ?? 1;
}

export interface BillCalc {
  subtotalC: number;
  lineDiscC: number;
  /** subtotal minus line discounts ("Goods"). */
  goodsC: number;
  billDiscC: number;
  /** What there is to pay. */
  totalC: number;
  lineTotalsC: number[];
  issues: string[];
  missingPrice: boolean;
  freeLines: number;
  /** Base units asked for, per item. */
  requested: Map<string, number>;
}

export function calcBill(
  lines: DraftLine[],
  billDiscountText: string,
  itemsById: Map<string, ShelfItem>
): BillCalc {
  let subtotalC = 0;
  let lineDiscC = 0;
  let missingPrice = false;
  let freeLines = 0;
  const issues: string[] = [];
  const lineTotalsC: number[] = [];
  const requested = new Map<string, number>();

  lines.forEach((l, i) => {
    const q = num(l.quantity);
    const g = grossCents(q, num(l.unitPrice));
    const d = toCents(num(l.discount));
    subtotalC += g;
    lineDiscC += d;
    lineTotalsC.push(g - d);
    if (lineMissingPrice(l)) missingPrice = true;
    else if (lineIsFree(l)) freeLines++;
    if (!(q > 0)) issues.push(`Line ${i + 1}: enter a quantity.`);
    else if (d > g) issues.push(`Line ${i + 1}: the discount is more than the line amount.`);
    requested.set(
      l.itemId,
      (requested.get(l.itemId) ?? 0) + q * factorFor(itemsById.get(l.itemId), l.unitName)
    );
  });

  const billDiscC = toCents(num(billDiscountText));
  const goodsC = subtotalC - lineDiscC;
  const totalC = goodsC - billDiscC;

  if (missingPrice) issues.unshift("Every line needs a price: tap a line marked Set price.");
  if (billDiscC < 0 || billDiscC > goodsC) issues.push("The discount is more than the bill amount.");
  if (lines.length > 0 && totalC <= 0 && issues.length === 0) {
    issues.push("The bill total must be more than zero.");
  }

  return {
    subtotalC,
    lineDiscC,
    goodsC,
    billDiscC,
    totalC,
    lineTotalsC,
    issues,
    missingPrice,
    freeLines,
    requested,
  };
}
