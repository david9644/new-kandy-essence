// "Take the money" dialog maths. Pure. Same rules as the bill engine:
//  - only CASH can be over-tendered (the extra is change);
//  - cheque + bank transfer cannot exceed the bill;
//  - credit is whatever is left, needs a registered customer, and here it is
//    always chosen explicitly (a "Credit" row) -- never by accident.

import { fromCents, num, toCents } from "../billing";

export type OtherMethod = "cheque" | "bank_transfer" | "credit";

export interface OtherRow {
  key: string;
  method: OtherMethod;
  amount: string;
  number: string;
  bank: string;
  date: string;
  reference: string;
  /** Cheque / bank transfer only: the amount follows what is still owed (after the cash
   * typed and the other fixed rows) until the cashier types an amount into it. */
  amountAuto?: boolean;
}

export interface PayInput {
  /** What the customer handed over in cash ("" = none). */
  cash: string;
  rows: OtherRow[];
}

export interface PaySummary {
  cashTenderedC: number;
  nonCashC: number;
  /** The part of the cash that is actually payment. */
  cashAppliedC: number;
  paidC: number;
  /** Left unpaid (goes on credit). */
  creditC: number;
  /** Cash handed back. Counts every method: non-cash reduces what cash owes. */
  changeC: number;
  /** Bank + cheque amounts alone are more than the bill. */
  overpaid: boolean;
  hasCreditRow: boolean;
  issues: string[];
}

export interface BuiltPayment {
  method: "cash" | "cheque" | "bank_transfer";
  amount: number;
  cheque_number?: string;
  cheque_bank?: string;
  cheque_date?: string;
  reference?: string;
}

export function computePay(totalC: number, input: PayInput, hasCustomer: boolean): PaySummary {
  const issues: string[] = [];
  const cashTenderedC = Math.max(0, toCents(num(input.cash)));

  let nonCashC = 0;
  let creditRows = 0;
  for (const row of input.rows) {
    if (row.method === "credit") {
      creditRows++;
      continue;
    }
    const amountC = toCents(num(row.amount));
    nonCashC += amountC;
    if (amountC <= 0) {
      issues.push(
        row.method === "cheque" ? "Enter the cheque amount." : "Enter the bank transfer amount."
      );
    }
    if (row.method === "cheque") {
      if (!/^\d+$/.test(row.number)) issues.push("Enter the cheque number (digits only).");
      else if (!row.bank.trim()) issues.push("Enter the bank the cheque is drawn on.");
      else if (!row.date) issues.push("Enter the cheque date.");
    }
  }
  if (creditRows > 1) issues.push("Only one Credit row is allowed.");

  const overpaid = nonCashC > totalC;
  if (overpaid) issues.push("Cheque and bank transfer amounts are more than the bill.");

  const dueForCashC = Math.max(0, totalC - nonCashC);
  const cashAppliedC = Math.min(cashTenderedC, dueForCashC);
  const paidC = nonCashC + cashAppliedC;
  const creditC = Math.max(0, totalC - paidC);
  const hasCreditRow = creditRows > 0;

  if (!overpaid && creditC > 0) {
    if (!hasCreditRow) {
      issues.push(
        "Part of the bill is not covered: take the rest, or add Credit (needs a registered customer)."
      );
    } else if (!hasCustomer) {
      issues.push("Credit needs a registered customer. Choose one below.");
    }
  }

  return {
    cashTenderedC,
    nonCashC,
    cashAppliedC,
    paidC,
    creditC,
    changeC: Math.max(0, cashTenderedC - cashAppliedC),
    overpaid,
    hasCreditRow,
    issues,
  };
}

/** Payment rows for the server (credit is not a payment: it is the remainder). */
export function buildPayments(summary: PaySummary, input: PayInput): BuiltPayment[] {
  const out: BuiltPayment[] = [];
  if (summary.cashAppliedC > 0) {
    out.push({ method: "cash", amount: fromCents(summary.cashAppliedC) });
  }
  for (const row of input.rows) {
    if (row.method === "bank_transfer") {
      out.push({
        method: "bank_transfer",
        amount: fromCents(toCents(num(row.amount))),
        reference: row.reference.trim() || undefined,
      });
    } else if (row.method === "cheque") {
      out.push({
        method: "cheque",
        amount: fromCents(toCents(num(row.amount))),
        cheque_number: row.number,
        cheque_bank: row.bank.trim(),
        cheque_date: row.date,
      });
    }
  }
  return out;
}

/** Stored only when the customer handed over more than the cash payment (there
 * is change to show), or when an edited bill already had it recorded. */
export function cashReceivedToStore(summary: PaySummary, keepIfEqual: boolean): number | null {
  if (summary.cashAppliedC <= 0) return null;
  if (summary.cashTenderedC > summary.cashAppliedC) return fromCents(summary.cashTenderedC);
  return keepIfEqual ? fromCents(summary.cashTenderedC) : null;
}

/** Quick cash buttons: the exact amount, then the next round notes above it. */
export function quickAmounts(dueC: number): number[] {
  if (dueC <= 0) return [];
  const out: number[] = [dueC];
  for (const step of [10000, 50000, 100000, 500000, 1000000]) {
    const rounded = Math.ceil(dueC / step) * step;
    if (rounded > dueC && !out.includes(rounded)) out.push(rounded);
  }
  return out.slice(0, 5).map((c) => fromCents(c));
}

// ── the dialog's rows: what changes when the cashier picks a method ────────────────
//
// Cash is pre-filled with the amount to pay ("auto"). Picking an other method (cheque or
// bank transfer) clears that pre-filled cash, and the new row takes what is still owed
// (also "auto"), so the bill balances without typing. Typing cash afterwards makes the
// row's amount follow (the bill stays balanced, a split). Typing an amount into the row
// fixes it. Credit is still the explicit "leave the rest unpaid" row: no cash unless typed.

export interface PayState {
  pay: PayInput;
  /** The cash box follows what is still owed until the cashier types or taps. */
  cashAuto: boolean;
}

const hasCredit = (rows: OtherRow[]) => rows.some((r) => r.method === "credit");
const hasAutoRow = (rows: OtherRow[]) =>
  rows.some((r) => r.method !== "credit" && r.amountAuto === true);

export function emptyRow(key: string, method: OtherMethod, today: string): OtherRow {
  return { key, method, amount: "", number: "", bank: "", date: today, reference: "" };
}

/** "+ Add cheque, bank transfer or credit": a bank transfer row for the rest. */
export function addOtherRow(s: PayState, key: string, today: string): PayState {
  // after an explicit Credit the cashier decides the amount: nothing is taken for them
  const auto = !hasCredit(s.pay.rows);
  const row: OtherRow = { ...emptyRow(key, "bank_transfer", today), amountAuto: auto };
  return {
    pay: { cash: s.cashAuto && auto ? "" : s.pay.cash, rows: [...s.pay.rows, row] },
    cashAuto: s.cashAuto && !auto,
  };
}

/** Typing or tapping a cash amount (it is then the cashier's, no longer pre-filled). */
export function setCashText(s: PayState, text: string): PayState {
  return { pay: { ...s.pay, cash: text }, cashAuto: false };
}

export function patchOtherRow(s: PayState, key: string, patch: Partial<OtherRow>): PayState {
  const old = s.pay.rows.find((r) => r.key === key);
  if (!old) return s;
  const next: OtherRow = { ...old, ...patch };
  if (patch.amount !== undefined) next.amountAuto = false;

  const toCredit = next.method === "credit" && old.method !== "credit";
  const fromCredit = old.method === "credit" && next.method !== "credit";
  let cash = s.pay.cash;
  let cashAuto = s.cashAuto;

  if (toCredit) {
    // "leave the rest on credit": nothing is taken in cash unless typed
    next.amount = "";
    next.amountAuto = false;
    if (!hasCredit(s.pay.rows)) {
      cash = "";
      cashAuto = false;
    }
  } else if (fromCredit) {
    // the row stops being the credit remainder and takes what is owed, in cheque / transfer
    next.amount = "";
    next.amountAuto = true;
    if (cashAuto) cash = "";
    cashAuto = false;
  }
  // cheque <-> bank transfer: the amount (typed or following) stays as it is
  const rows = s.pay.rows.map((r) => (r.key === key ? next : r));
  return { pay: { cash, rows }, cashAuto };
}

/** Removing a row: with nothing left that covers the bill, cash is pre-filled again. */
export function removeOtherRow(s: PayState, key: string): PayState {
  const gone = s.pay.rows.find((r) => r.key === key);
  const rows = s.pay.rows.filter((r) => r.key !== key);
  if (!gone) return s;
  const restore =
    rows.length === 0 ||
    ((gone.method === "credit" || gone.amountAuto === true) && !hasCredit(rows) && !hasAutoRow(rows));
  return restore ? { pay: { cash: "", rows }, cashAuto: true } : { pay: { ...s.pay, rows }, cashAuto: s.cashAuto };
}

/** The bill changed: cash follows what is owed again, unless the rest was deliberately left
 * on credit or an other method is following the amount owed. */
export function afterBillChange(s: PayState): PayState {
  if (hasCredit(s.pay.rows) || hasAutoRow(s.pay.rows)) return s;
  return s.cashAuto ? s : { ...s, cashAuto: true };
}

/** The payment exactly as the dialog shows it and the bill is saved with: the pre-filled
 * cash and the following amounts worked out. */
export function effectivePayment(totalC: number, s: PayState): PayInput {
  const { rows } = s.pay;
  const credit = hasCredit(rows);
  const auto = hasAutoRow(rows) && !credit;

  if (!auto) {
    if (!s.cashAuto) return s.pay;
    let nonCashC = 0;
    for (const r of rows) if (r.method !== "credit") nonCashC += toCents(num(r.amount));
    const cashC = credit ? 0 : Math.max(0, totalC - nonCashC);
    return { ...s.pay, cash: cashC > 0 ? String(fromCents(cashC)) : "" };
  }

  // some rows follow what is owed: whatever the cash and the typed rows leave, in row order
  let leftC = totalC - Math.max(0, toCents(num(s.cashAuto ? "" : s.pay.cash)));
  for (const r of rows) {
    if (r.method !== "credit" && r.amountAuto !== true) leftC -= toCents(num(r.amount));
  }
  const out = rows.map((r) => {
    if (r.method === "credit" || r.amountAuto !== true) return r;
    const c = Math.max(0, leftC);
    leftC -= c;
    return { ...r, amount: c > 0 ? String(fromCents(c)) : "" };
  });
  return { cash: s.cashAuto ? "" : s.pay.cash, rows: out };
}
