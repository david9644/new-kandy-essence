// Money math for the billing screen is done in integer cents so a 50-line
// bill adds up exactly, and rounds half-up per line like the database does
// (round(quantity * unit_price, 2)). The server recomputes everything and
// rejects a bill whose total differs from what the screen showed.

export function toCents(amount: number): number {
  return Math.round(amount * 100 + 1e-7);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Parse a text field to a number (blank / junk -> 0). */
export function num(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function r2(n: number): number {
  return Math.round(n * 100 + 1e-7) / 100;
}

/** Line amount before discount, in cents: round(qty * round(price, 2), 2). */
export function grossCents(quantity: number, unitPrice: number): number {
  return toCents(quantity * r2(unitPrice));
}

// crypto.randomUUID only exists in secure contexts; a till PC on plain-http
// LAN would otherwise crash. Needs to be a real v4 UUID (used as the bill's
// double-tap protection key in the database).
export function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
