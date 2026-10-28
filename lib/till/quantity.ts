// A quantity typed straight onto a bill line. Pure.
//
// The rules are the ones the line sheet's Quantity field already has: digits and one
// decimal point, at most two decimals, and more than zero (the database refuses a line
// of 0 or less). The one new limit is a ceiling that catches a slipped key. An empty,
// zero or invalid value is never applied: the caller keeps the previous quantity and
// shows the message.

export const MAX_QUANTITY = 100000;
export const MAX_QUANTITY_DECIMALS = 2;

export type QuantityResult = { ok: true; value: string } | { ok: false; message: string };

export function parseQuantity(text: string, opts: { allowDecimal?: boolean } = {}): QuantityResult {
  const allowDecimal = opts.allowDecimal ?? true;
  const t = text.trim();
  if (t === "") return { ok: false, message: "Type a quantity." };
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return { ok: false, message: "That is not a valid quantity." };
  const frac = t.split(".")[1] ?? "";
  if (frac.length > 0 && !allowDecimal) {
    return { ok: false, message: "This unit is sold in whole numbers." };
  }
  if (frac.length > MAX_QUANTITY_DECIMALS) {
    return { ok: false, message: `Use at most ${MAX_QUANTITY_DECIMALS} decimal places.` };
  }
  const n = Number(t);
  if (!(n > 0)) return { ok: false, message: "The quantity must be more than 0." };
  if (n > MAX_QUANTITY) return { ok: false, message: `The quantity cannot be more than ${MAX_QUANTITY}.` };
  // the same plain form the + and - buttons store ("5", "2.5"; never "05", "5." or "2.50")
  return { ok: true, value: String(n) };
}
