// The "crossed-out normal price" rule for a bill line, in ONE place: the till's
// bill column, the saved bill page and the print engine all call this, so they
// can never disagree about whether a line shows a strike-through.
//
//   normal unit price N = max(list price, unit price) when a list price exists,
//                         else the unit price itself
//   normal line amount  = quantity x N            (rounded to cents)
//   final line amount   = the line total (already includes the line discount)
//   struck              = normal - final > 0.005
//
// So a line is struck when the cashier gave a line discount OR typed a price
// below the list price; typing a price ABOVE the list price (N = unit price)
// or giving no discount shows the single amount as before. The whole-bill
// discount is not part of any line and never strikes anything.

export interface LinePriceInput {
  quantity: number;
  unitPrice: number;
  /** The item's list price for THIS unit when the line was billed; null/undefined
   * = none recorded (old bills, or an item that had no selling price). */
  listUnitPrice?: number | null;
  /** quantity x unit price - line discount, as billed. */
  lineTotal: number;
}

export interface LineAmounts {
  normalUnitPrice: number;
  normalAmount: number;
  finalAmount: number;
  struck: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100 + 1e-7) / 100;
}

export function lineAmounts(l: LinePriceInput): LineAmounts {
  const list =
    l.listUnitPrice !== null && l.listUnitPrice !== undefined && Number.isFinite(l.listUnitPrice)
      ? l.listUnitPrice
      : null;
  const normalUnitPrice = list !== null ? Math.max(list, l.unitPrice) : l.unitPrice;
  const normalAmount = round2(l.quantity * normalUnitPrice);
  const finalAmount = round2(l.lineTotal);
  return {
    normalUnitPrice,
    normalAmount,
    finalAmount,
    struck: normalAmount - finalAmount > 0.005,
  };
}
