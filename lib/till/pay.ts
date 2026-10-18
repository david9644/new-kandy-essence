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
