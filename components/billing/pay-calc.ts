import { fromCents, num, toCents } from "@/lib/billing";
import type { BillPaymentInput } from "@/app/(app)/billing/actions";
import type { PayState } from "@/components/billing/bill-types";

export interface PaySummary {
  cashTenderedC: number;
  bankC: number;
  chequeC: number;
  nonCashC: number;
  cashAppliedC: number;
  paidC: number;
  creditC: number;
  changeC: number;
  /** Bank + cheque amounts already exceed the bill total. */
  overpaid: boolean;
  chequeIssue: string | null;
}

function chequeIsBlank(c: PayState["cheques"][number]): boolean {
  return !c.number && !c.bank && !c.amount;
}

// Credit is whatever the payments don't cover. Cash is "tendered": anything
// above what's still due is change, never recorded as a payment.
export function computePay(totalC: number, pay: PayState): PaySummary {
  const cashTenderedC = pay.touched ? toCents(num(pay.cash)) : totalC;
  const bankC = toCents(num(pay.bank));
  const rows = pay.cheques.filter((c) => !chequeIsBlank(c));
  const chequeC = rows.reduce((sum, c) => sum + toCents(num(c.amount)), 0);
  const nonCashC = bankC + chequeC;
  const dueForCashC = Math.max(0, totalC - nonCashC);
  const cashAppliedC = Math.min(cashTenderedC, dueForCashC);
  const paidC = nonCashC + cashAppliedC;

  let chequeIssue: string | null = null;
  for (const c of rows) {
    if (!/^\d+$/.test(c.number)) chequeIssue = "Enter the cheque number (digits only).";
    else if (!c.bank.trim()) chequeIssue = "Enter the bank the cheque is drawn on.";
    else if (!c.date) chequeIssue = "Enter the cheque date.";
    else if (toCents(num(c.amount)) <= 0) chequeIssue = "Enter the cheque amount.";
    if (chequeIssue) break;
  }

  return {
    cashTenderedC,
    bankC,
    chequeC,
    nonCashC,
    cashAppliedC,
    paidC,
    creditC: Math.max(0, totalC - paidC),
    changeC: Math.max(0, cashTenderedC - cashAppliedC),
    overpaid: nonCashC > totalC,
    chequeIssue,
  };
}

export function buildPayments(summary: PaySummary, pay: PayState): BillPaymentInput[] {
  const out: BillPaymentInput[] = [];
  if (summary.cashAppliedC > 0) {
    out.push({ method: "cash", amount: fromCents(summary.cashAppliedC) });
  }
  if (summary.bankC > 0) {
    out.push({
      method: "bank_transfer",
      amount: fromCents(summary.bankC),
      reference: pay.bankRef.trim() || undefined,
    });
  }
  for (const c of pay.cheques) {
    if (chequeIsBlank(c)) continue;
    out.push({
      method: "cheque",
      amount: fromCents(toCents(num(c.amount))),
      cheque_number: c.number,
      cheque_bank: c.bank.trim(),
      cheque_date: c.date,
    });
  }
  return out;
}
