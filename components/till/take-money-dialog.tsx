"use client";

import { useKeyboardHeight } from "./use-keyboard-height";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";
import { TypeAheadSearch } from "@/components/shared/type-ahead-search";
import type { CustomerOption } from "@/components/billing/bill-types";
import { TapButton } from "./tap-button";
import { TillDialog } from "./till-dialog";
import { formatRs } from "@/lib/till/format";
import { fromCents } from "@/lib/billing";
import {
  quickAmounts,
  type OtherMethod,
  type OtherRow,
  type PayInput,
  type PaySummary,
} from "@/lib/till/pay";

const FIELD =
  "h-12 w-full rounded-xl border border-border bg-surface px-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const NUMBER_FIELD = `${FIELD} text-right tabular-nums`;

const METHOD_LABEL: Record<OtherMethod, string> = {
  cheque: "Cheque",
  bank_transfer: "Bank transfer",
  credit: "Credit (pay later)",
};

function rs0(amount: number): string {
  return `Rs ${amount.toLocaleString("en-LK", { maximumFractionDigits: 2 })}`;
}

/** What happens right after a NEW bill is saved: print it at once, or only save. */
export type AfterSave = "print" | "only";

export interface TakeMoneyProps {
  open: boolean;
  mode: "create" | "edit";
  onClose: () => void;
  totalC: number;
  pay: PayInput;
  summary: PaySummary;
  /** The cash box follows what is still owed until the cashier types or taps. */
  cashAuto: boolean;
  onCash: (text: string) => void;
  onQuick: (amount: number) => void;
  onAddRow: () => void;
  onPatchRow: (key: string, patch: Partial<OtherRow>) => void;
  onRemoveRow: (key: string) => void;
  customer: CustomerOption | null;
  customerList: CustomerOption[];
  onCustomer: (c: CustomerOption | null) => void;
  onQuickAddCustomer: (query: string) => void;
  notes: string;
  onNotes: (text: string) => void;
  isOwner: boolean;
  date: string;
  onDate: (date: string) => void;
  saving: boolean;
  /** create mode: which button was pressed; edit mode: always "only" ("Done"). */
  onConfirm: (after: AfterSave) => void;
}

export function TakeMoneyDialog(p: TakeMoneyProps) {
  const { summary } = p;
  const dueForCashC = Math.max(0, p.totalC - summary.nonCashC);
  const quicks = quickAmounts(dueForCashC);
  const blocked = summary.issues.length > 0 || p.saving;
  const padOpen = useKeyboardHeight() > 0;

  return (
    <TillDialog
      open={p.open}
      title={p.mode === "edit" ? "Payment & customer" : "Take the money"}
      onClose={p.onClose}
      closeDisabled={p.saving}
      footer={
        <div className="flex flex-col gap-2">
          {summary.issues.length > 0 && (
            <p className={`rounded-lg bg-danger-surface px-3 text-danger ${padOpen ? "py-1 text-xs" : "py-2 text-sm"}`}>
              {summary.issues[0]}
            </p>
          )}
          <TapButton
            onTap={() => p.onConfirm(p.mode === "edit" ? "only" : "print")}
            disabled={blocked}
            className={`flex w-full items-center justify-center rounded-2xl bg-[#111827] text-lg font-semibold text-white active:opacity-80 disabled:opacity-40 ${padOpen ? "h-12" : "h-16"}`}
          >
            {p.saving
              ? "Saving..."
              : p.mode === "edit"
                ? "Done"
                : `Save & Print: ${formatRs(fromCents(p.totalC))}`}
          </TapButton>
          {p.mode !== "edit" && (
            <TapButton
              onTap={() => p.onConfirm("only")}
              disabled={blocked}
              className="flex h-12 w-full items-center justify-center rounded-xl border border-border bg-surface text-base font-medium text-foreground active:bg-background disabled:opacity-40"
            >
              Save only
            </TapButton>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-baseline justify-between rounded-xl bg-background px-4 py-3">
          <span className="text-sm text-muted">To pay</span>
          <span className="text-3xl font-bold tabular-nums text-foreground">
            {formatRs(fromCents(p.totalC))}
          </span>
        </div>

        {/* ── cash ── */}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Cash</h3>
          {quicks.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {quicks.map((amount, i) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => p.onQuick(amount)}
                  className="h-12 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground active:bg-background"
                >
                  {i === 0 ? `Exact ${rs0(amount)}` : rs0(amount)}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Cash received (Rs)</label>
              <KeyboardNumberInput value={p.pay.cash} onChange={p.onCash} className={NUMBER_FIELD} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Change</label>
              <p
                className={`flex h-12 items-center justify-end rounded-xl px-3 text-lg font-semibold tabular-nums ${
                  summary.changeC > 0 ? "bg-success-surface text-success" : "bg-background text-muted"
                }`}
              >
                {formatRs(fromCents(summary.changeC))}
              </p>
            </div>
          </div>
        </section>

        {/* ── other ── */}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Other</h3>
          <div className="flex flex-col gap-3">
            {p.pay.rows.map((row) => (
              <OtherPaymentRow
                key={row.key}
                row={row}
                creditC={summary.creditC}
                onPatch={(patch) => p.onPatchRow(row.key, patch)}
                onRemove={() => p.onRemoveRow(row.key)}
              />
            ))}
            <button
              type="button"
              onClick={p.onAddRow}
              className="flex h-12 items-center justify-center rounded-xl border border-dashed border-border text-sm font-medium text-foreground active:bg-background"
            >
              + Add cheque, bank transfer or credit
            </button>
          </div>
        </section>

        {/* ── customer ── */}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Customer</h3>
          {p.customer ? (
            <div className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{p.customer.name}</p>
                <p className="text-xs text-muted">{p.customer.code}</p>
              </div>
              <button
                type="button"
                onClick={() => p.onCustomer(null)}
                className="flex h-11 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground"
              >
                Walk-in
              </button>
            </div>
          ) : (
            <TypeAheadSearch
              items={p.customerList}
              getId={(c) => c.id}
              getLabel={(c) => c.name}
              getCode={(c) => c.code}
              placeholder="Walk-in (or search a customer)..."
              onSelect={p.onCustomer}
              onCreateNew={p.onQuickAddCustomer}
              createLabel="customer"
            />
          )}
        </section>

        {/* ── note / date ── */}
        <section className={p.isOwner ? "grid grid-cols-[1fr_auto] gap-3" : ""}>
          <div>
            <label className="mb-1 block text-sm font-semibold text-foreground">Note (optional)</label>
            <KeyboardTextInput value={p.notes} onChange={p.onNotes} className={FIELD} />
          </div>
          {p.isOwner && (
            <div>
              <label className="mb-1 block text-sm font-semibold text-foreground">Date</label>
              <input
                type="date"
                value={p.date}
                onChange={(e) => p.onDate(e.target.value)}
                className="h-12 rounded-xl border border-border bg-surface px-3 text-base text-foreground focus:border-primary focus:outline-none"
              />
            </div>
          )}
        </section>
      </div>
    </TillDialog>
  );
}

function OtherPaymentRow({
  row,
  creditC,
  onPatch,
  onRemove,
}: {
  row: OtherRow;
  creditC: number;
  onPatch: (patch: Partial<OtherRow>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center gap-2">
        <select
          value={row.method}
          onChange={(e) => onPatch({ method: e.target.value as OtherMethod })}
          aria-label="Payment method"
          className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-base text-foreground focus:border-primary focus:outline-none"
        >
          {(Object.keys(METHOD_LABEL) as OtherMethod[]).map((m) => (
            <option key={m} value={m}>
              {METHOD_LABEL[m]}
            </option>
          ))}
        </select>
        {row.method === "credit" ? (
          <p className="flex h-12 w-36 items-center justify-end rounded-xl bg-warning-surface px-3 text-base font-semibold tabular-nums text-warning">
            {formatRs(fromCents(creditC))}
          </p>
        ) : (
          <div className="w-36 shrink-0">
            <KeyboardNumberInput
              value={row.amount}
              onChange={(v) => onPatch({ amount: v })}
              placeholder="Amount"
              className={NUMBER_FIELD}
            />
          </div>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove this payment"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border text-danger active:bg-danger-surface"
        >
          ✕
        </button>
      </div>

      {row.method === "credit" && (
        <p className="mt-2 text-xs text-muted">
          Leaves the rest of the bill unpaid on the customer&rsquo;s account. Needs a registered
          customer.
        </p>
      )}

      {row.method === "bank_transfer" && (
        <div className="mt-2">
          <KeyboardTextInput
            value={row.reference}
            onChange={(v) => onPatch({ reference: v })}
            placeholder="Reference (optional)"
            className={FIELD}
          />
        </div>
      )}

      {row.method === "cheque" && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <KeyboardNumberInput
            value={row.number}
            onChange={(v) => onPatch({ number: v })}
            allowDecimal={false}
            placeholder="Cheque number"
            className={NUMBER_FIELD}
          />
          <KeyboardTextInput
            value={row.bank}
            onChange={(v) => onPatch({ bank: v })}
            placeholder="Bank"
            className={FIELD}
          />
          <input
            type="date"
            value={row.date}
            onChange={(e) => onPatch({ date: e.target.value })}
            aria-label="Cheque date"
            className="col-span-2 h-12 rounded-xl border border-border bg-surface px-3 text-base text-foreground focus:border-primary focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}
