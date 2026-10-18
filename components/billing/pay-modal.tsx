"use client";

import { Modal } from "@/components/shared/modal";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";
import { formatCurrency } from "@/lib/units";
import { fromCents, uuid } from "@/lib/billing";
import type { PayState } from "@/components/billing/bill-types";
import type { PaySummary } from "@/components/billing/pay-calc";

const NUMBER_FIELD =
  "w-full rounded-lg border border-border bg-surface px-4 py-3 text-right text-xl font-semibold tabular-nums text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const TEXT_FIELD =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none";

export function PayModal({
  open,
  onClose,
  totalCents,
  pay,
  setPay,
  summary,
  hasCustomer,
  today,
}: {
  open: boolean;
  onClose: () => void;
  totalCents: number;
  pay: PayState;
  setPay: (updater: (prev: PayState) => PayState) => void;
  summary: PaySummary;
  hasCustomer: boolean;
  today: string;
}) {
  const total = fromCents(totalCents);

  function patch(next: Partial<PayState>) {
    setPay((prev) => ({ ...prev, ...next, touched: true }));
  }

  function patchCheque(key: string, next: Partial<PayState["cheques"][number]>) {
    setPay((prev) => ({
      ...prev,
      touched: true,
      cheques: prev.cheques.map((c) => (c.key === key ? { ...c, ...next } : c)),
    }));
  }

  return (
    <Modal open={open} onClose={onClose} title="Payment">
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-background p-3 text-center">
          <p className="text-xs text-muted">Bill total</p>
          <p className="text-3xl font-bold tabular-nums text-foreground">{formatCurrency(total)}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() =>
              setPay(() => ({
                touched: true,
                cash: String(total),
                bank: "",
                bankRef: "",
                cheques: [],
              }))
            }
            className="flex h-12 items-center justify-center rounded-lg border border-border text-sm font-medium text-foreground active:bg-background"
          >
            Full cash
          </button>
          <button
            type="button"
            onClick={() =>
              setPay(() => ({ touched: true, cash: "", bank: "", bankRef: "", cheques: [] }))
            }
            className="flex h-12 items-center justify-center rounded-lg border border-border text-sm font-medium text-foreground active:bg-background"
          >
            All credit
          </button>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Cash received <span className="font-normal text-muted">(type what the customer hands over)</span>
          </label>
          <KeyboardNumberInput
            value={pay.touched ? pay.cash : String(fromCents(summary.cashTenderedC))}
            onChange={(v) => patch({ cash: v })}
            className={NUMBER_FIELD}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Bank transfer</label>
            <KeyboardNumberInput
              value={pay.bank}
              onChange={(v) => patch({ bank: v })}
              className={NUMBER_FIELD}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Reference</label>
            <KeyboardTextInput
              value={pay.bankRef}
              onChange={(v) => patch({ bankRef: v })}
              placeholder="optional"
              className={TEXT_FIELD}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {pay.cheques.map((c) => (
            <div key={c.key} className="rounded-lg border border-border bg-background p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Cheque</p>
                <button
                  type="button"
                  onClick={() => patch({ cheques: pay.cheques.filter((x) => x.key !== c.key) })}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-danger active:bg-danger-surface"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-muted">Cheque number</label>
                  <KeyboardNumberInput
                    value={c.number}
                    allowDecimal={false}
                    onChange={(v) => patchCheque(c.key, { number: v })}
                    className={TEXT_FIELD}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted">Amount</label>
                  <KeyboardNumberInput
                    value={c.amount}
                    onChange={(v) => patchCheque(c.key, { amount: v })}
                    className={`${TEXT_FIELD} text-right tabular-nums`}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted">Bank</label>
                  <KeyboardTextInput
                    value={c.bank}
                    onChange={(v) => patchCheque(c.key, { bank: v })}
                    className={TEXT_FIELD}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted">Cheque date</label>
                  <input
                    type="date"
                    value={c.date}
                    onChange={(e) => patchCheque(c.key, { date: e.target.value })}
                    className={TEXT_FIELD}
                  />
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              patch({
                cheques: [
                  ...pay.cheques,
                  {
                    key: uuid(),
                    number: "",
                    bank: "",
                    date: today,
                    amount: String(
                      fromCents(Math.max(0, totalCents - summary.nonCashC - summary.cashAppliedC))
                    ),
                  },
                ],
              })
            }
            className="flex h-11 items-center justify-center rounded-lg border border-dashed border-border text-sm font-medium text-foreground active:bg-background"
          >
            + Add cheque
          </button>
        </div>

        {summary.overpaid && (
          <p className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">
            Bank transfer + cheques are more than the bill total.
          </p>
        )}
        {summary.chequeIssue && (
          <p className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">
            {summary.chequeIssue}
          </p>
        )}

        <div className="rounded-xl border border-border p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Paid now</span>
            <span className="tabular-nums font-medium text-foreground">
              {formatCurrency(fromCents(summary.paidC))}
            </span>
          </div>
          {summary.creditC > 0 ? (
            <div className="mt-1 flex items-center justify-between">
              <span className="text-sm font-medium text-warning">Balance due (credit)</span>
              <span className="text-2xl font-bold tabular-nums text-warning">
                {formatCurrency(fromCents(summary.creditC))}
              </span>
            </div>
          ) : (
            <div className="mt-1 flex items-center justify-between">
              <span className="text-sm font-medium text-success">Change to give</span>
              <span className="text-2xl font-bold tabular-nums text-success">
                {formatCurrency(fromCents(summary.changeC))}
              </span>
            </div>
          )}
          {summary.creditC > 0 && !hasCustomer && (
            <p className="mt-2 text-xs text-danger">
              Credit needs a registered customer -- choose one on the billing screen.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}
