// Database errors the cashier can act on get a plain sentence. Anything else is
// passed through unchanged.

export const NO_STOCK_MESSAGE =
  "This item has no stock recorded yet. Record a purchase or opening stock first.";

/** The stock functions refuse an item that has never had a stock batch with
 * "no stock exists yet for ..." (stock-out, bills). */
export function plainBillError(message: string): string {
  if (/no stock exists yet/i.test(message)) return NO_STOCK_MESSAGE;
  return message;
}
