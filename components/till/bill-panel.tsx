"use client";

import Link from "next/link";
import { memo, useEffect, useState } from "react";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";
import { QuantityInput } from "./quantity-input";
import { TapButton } from "./tap-button";
import { formatRs } from "@/lib/till/format";
import { fromCents, num } from "@/lib/billing";
import { lineAmounts } from "@/lib/line-price";
import { lineIsFree, lineMissingPrice, type BillCalc, type DraftLine } from "@/lib/till/bill";
import { UNCONFIRMED_MESSAGE } from "@/lib/till/net";
import type { StockShortage } from "@/app/(app)/billing/actions";
import { formatQuantity } from "@/lib/units";
import { useKeyboardHeight } from "./use-keyboard-height";

export type Phase = "editing" | "saving" | "unconfirmed" | "saved";

export interface SavedInfo {
  invoiceId: string;
  invoiceNo: string;
  paidC: number;
  creditC: number;
  changeC: number;
}

/** The bill that "Save only" just saved (the till itself is already empty again). */
export interface JustSaved {
  invoiceId: string;
  invoiceNo: string;
  changeC: number;
}

const CARD = "rounded-2xl border border-border bg-surface";

const LineRowView = memo(function LineRowView({
  line,
  name,
  unitLabel,
  totalC,
  normalAmount,
  warn,
  locked,
  onStep,
  onSetQuantity,
  onEditing,
  onOpen,
}: {
  line: DraftLine;
  name: string;
  unitLabel: string;
  totalC: number;
  /** The crossed-out normal amount (rupees) when this line was discounted, else null. */
  normalAmount: number | null;
  warn: boolean;
  locked: boolean;
  onStep: (key: string, delta: number) => void;
  onSetQuantity: (key: string, text: string) => string | null;
  onEditing: (editing: boolean) => void;
  onOpen: (key: string) => void;
}) {
  // why a typed quantity was not applied; it fades after a few seconds
  const [qtyMessage, setQtyMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!qtyMessage) return;
    const t = window.setTimeout(() => setQtyMessage(null), 6000);
    return () => window.clearTimeout(t);
  }, [qtyMessage]);
  const missing = lineMissingPrice(line);
  const free = lineIsFree(line);
  return (
    <li
      className={`grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 border-b border-border px-3 py-2 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto_auto] ${
        free ? "bg-warning-surface" : ""
      }`}
    >
      <button
        type="button"
        disabled={locked}
        onClick={() => onOpen(line.key)}
        className="col-span-2 min-h-[44px] min-w-0 text-left md:col-span-1 md:min-h-[52px]"
      >
        <span className="line-clamp-2 text-[15px] font-medium leading-snug text-foreground">
          {name}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          {missing ? (
            <span className="rounded-full bg-danger-surface px-2 py-0.5 font-semibold text-danger">
              Set price
            </span>
          ) : free ? (
            <span className="rounded-full bg-amber-200 px-2 py-0.5 font-semibold text-amber-900">
              Free
            </span>
          ) : (
            <span className="tabular-nums">
              {line.quantity || "0"} {unitLabel} &times; {formatRs(Number(line.unitPrice))}
            </span>
          )}
          {Number(line.discount) > 0 && <span>− {formatRs(Number(line.discount))}</span>}
          {warn && <span className="font-medium text-warning">low stock</span>}
        </span>
      </button>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={locked}
          onClick={() => onStep(line.key, -1)}
          aria-label="One less"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-xl text-foreground active:bg-background disabled:opacity-40"
        >
          −
        </button>
        <QuantityInput
          value={line.quantity}
          disabled={locked}
          label={name}
          onCommit={(text) => onSetQuantity(line.key, text)}
          onMessage={setQtyMessage}
          onEditing={onEditing}
        />
        <button
          type="button"
          disabled={locked}
          onClick={() => onStep(line.key, 1)}
          aria-label="One more"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-xl text-foreground active:bg-background disabled:opacity-40"
        >
          +
        </button>
      </div>

      <span className="min-w-[4.5rem] justify-self-end text-right text-[15px] font-semibold tabular-nums text-foreground">
        {normalAmount !== null && (
          <span
            className="block text-xs font-normal text-muted line-through"
            aria-label={`normal price ${formatRs(normalAmount)}`}
          >
            {formatRs(normalAmount)}
          </span>
        )}
        {missing ? "—" : formatRs(fromCents(totalC))}
      </span>

      {qtyMessage && (
        <p role="alert" data-testid="qty-message" className="col-span-full text-xs font-medium text-danger">
          {qtyMessage}
        </p>
      )}
    </li>
  );
});

/** Shown above the till (both phone tabs) after "Save only". */
export function JustSavedNotice({
  info,
  onDismiss,
}: {
  info: JustSaved;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      data-testid="just-saved"
      className="mx-3 mt-2 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-success/40 bg-success-surface px-3 py-1 text-sm text-success md:mx-4"
    >
      <span className="font-semibold">Bill {info.invoiceNo} saved</span>
      {info.changeC > 0 && (
        <span className="font-semibold tabular-nums">
          Change to give: {formatRs(fromCents(info.changeC))}
        </span>
      )}
      <Link href={`/billing/${info.invoiceId}`} prefetch={false} className="flex min-h-[44px] items-center font-semibold underline">
        Open or print it
      </Link>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Hide this message"
        className="ml-auto flex h-11 w-11 items-center justify-center rounded-lg text-lg text-success active:bg-success/10"
      >
        ✕
      </button>
    </div>
  );
}

/** The bill printed, but the print could not be recorded on it (the print view had already
 * gone back to the till). Nothing to retry: it only means the next print will not say COPY. */
export function UnrecordedPrintNotice({
  invoiceNo,
  onDismiss,
}: {
  invoiceNo: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      data-testid="print-unrecorded"
      className="mx-3 mt-2 flex shrink-0 items-center gap-3 rounded-2xl border border-warning/40 bg-warning-surface px-3 py-1 text-sm text-warning md:mx-4"
    >
      <span className="font-semibold">
        {invoiceNo} printed, but the print could not be recorded on the bill.
      </span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Hide this message"
        className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg active:bg-warning/10"
      >
        ✕
      </button>
    </div>
  );
}

export interface BillPanelProps {
  mode: "create" | "edit";
  invoiceNo?: string;
  phase: Phase;
  lines: DraftLine[];
  nameOf: (line: DraftLine) => string;
  unitLabelOf: (line: DraftLine) => string;
  calc: BillCalc;
  lowStock: Set<string>;
  onStep: (key: string, delta: number) => void;
  onSetQuantity: (key: string, text: string) => string | null;
  onOpenLine: (key: string) => void;
  discountInput: string;
  discountApplied: string;
  onDiscountInput: (v: string) => void;
  onApplyDiscount: () => void;
  bigLabel: string;
  bigDisabled: boolean;
  /** Why the big button is greyed out (first problem), if any. */
  hint: string | null;
  onBig: () => void;
  saved: SavedInfo | null;
  saveError: string | null;
  shortages: StockShortage[] | null;
  onConfirmShortage: () => void;
  onRetry: () => void;
  onPaymentDialog?: () => void;
  onCancelBill: () => void;
  onNewBill: () => void;
  cancelEditHref?: string;
  backToBillHref?: string;
}

// The crossed-out normal amount of a line (null = nothing crossed out). Same rule
// as the saved bill page and the printed bill (lib/line-price.ts).
function normalOf(line: DraftLine, totalC: number): number | null {
  if (lineMissingPrice(line)) return null;
  const a = lineAmounts({
    quantity: num(line.quantity),
    unitPrice: num(line.unitPrice),
    listUnitPrice: line.listPrice,
    lineTotal: fromCents(totalC),
  });
  return a.struck ? a.normalAmount : null;
}

export function BillPanel(p: BillPanelProps) {
  // While the number pad is up (typing a discount) the three small buttons step
  // aside, so the bill, the total and the big button all still fit above it.
  const padOpen = useKeyboardHeight() > 0;
  // A quantity is being typed: the discount and totals step aside as well, so the bill's
  // lines (and the line being edited) keep the room above the pad.
  const [editingQty, setEditingQty] = useState(false);
  const typingQty = padOpen && editingQty;
  const locked = p.phase !== "editing";
  const goods = fromCents(p.calc.goodsC);
  const discount = fromCents(Math.max(p.calc.billDiscC, 0));
  const toPay = fromCents(Math.max(p.calc.totalC, 0));
  const discountDirty = p.discountInput.trim() !== p.discountApplied.trim();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {p.phase === "unconfirmed" && (
        <div className="shrink-0 rounded-2xl border border-danger/40 bg-danger-surface p-3 text-sm text-danger">
          <p className="font-semibold">Not confirmed</p>
          <p className="mt-1">{UNCONFIRMED_MESSAGE}</p>
          <TapButton
            onTap={p.onRetry}
            className="mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-danger text-base font-semibold text-white active:opacity-80"
          >
            Retry
          </TapButton>
        </div>
      )}

      {p.saveError && p.phase === "editing" && (
        <p className="shrink-0 rounded-2xl bg-danger-surface px-3 py-2 text-sm text-danger">
          {p.saveError}
        </p>
      )}

      {p.shortages && p.shortages.length > 0 && p.phase === "editing" && (
        <div className="shrink-0 rounded-2xl bg-warning-surface p-3 text-sm text-warning">
          <ul className="mb-2 list-disc pl-5">
            {p.shortages.map((s) => (
              <li key={s.item_id}>
                {s.item_name}: only {formatQuantity(s.available)} {s.base_unit} left, you&rsquo;re
                billing {formatQuantity(s.requested)} {s.base_unit}.
              </li>
            ))}
          </ul>
          <TapButton
            onTap={p.onConfirmShortage}
            disabled={p.bigDisabled}
            className="flex h-12 items-center rounded-xl bg-warning px-4 text-base font-semibold text-white disabled:opacity-50"
          >
            Confirm &amp; Save anyway
          </TapButton>
        </div>
      )}

      {p.phase === "saved" && p.saved && (
        <div className="shrink-0 rounded-2xl border border-success/40 bg-success-surface p-3 text-success">
          <p className="text-lg font-semibold">
            {p.mode === "edit" ? "Changes saved" : "Bill saved"}: {p.saved.invoiceNo}
          </p>
          <p className="mt-1 text-sm">
            Paid {formatRs(fromCents(p.saved.paidC))}
            {p.saved.creditC > 0 && <> &middot; On credit {formatRs(fromCents(p.saved.creditC))}</>}
          </p>
          {p.saved.changeC > 0 && (
            <p className="mt-1 text-xl font-bold tabular-nums">
              Change to give: {formatRs(fromCents(p.saved.changeC))}
            </p>
          )}
        </div>
      )}

      {/* ── the bill ── */}
      <div className={`${CARD} flex min-h-0 flex-1 flex-col overflow-clip`}>
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-foreground">
            {p.mode === "edit" ? `Editing ${p.invoiceNo ?? "bill"}` : "This bill"}
          </h2>
          <span className="text-sm text-muted">
            {p.lines.length} {p.lines.length === 1 ? "line" : "lines"}
          </span>
        </div>
        {p.lines.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">
            Tap an item to start the bill.
          </p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {p.lines.map((line, i) => (
              <LineRowView
                key={line.key}
                line={line}
                name={p.nameOf(line)}
                unitLabel={p.unitLabelOf(line)}
                totalC={p.calc.lineTotalsC[i] ?? 0}
                normalAmount={normalOf(line, p.calc.lineTotalsC[i] ?? 0)}
                warn={p.lowStock.has(line.itemId)}
                locked={locked}
                onStep={p.onStep}
                onSetQuantity={p.onSetQuantity}
                onEditing={setEditingQty}
                onOpen={p.onOpenLine}
              />
            ))}
          </ul>
        )}
      </div>

      {/* ── discount ── */}
      <div className={`${CARD} shrink-0 px-4 py-3 ${typingQty ? "hidden" : ""} ${locked ? "pointer-events-none opacity-60" : ""}`}>
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          Discount on the bill (Rs)
        </label>
        <div className="flex gap-2">
          <KeyboardNumberInput
            value={p.discountInput}
            onChange={p.onDiscountInput}
            aria-label="Discount on the bill"
            className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-right text-lg tabular-nums text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <TapButton
            onTap={p.onApplyDiscount}
            className={`h-12 shrink-0 rounded-xl border px-5 text-base font-semibold ${
              discountDirty
                ? "border-[#111827] bg-[#111827] text-white"
                : "border-border bg-surface text-foreground"
            }`}
          >
            Apply
          </TapButton>
        </div>
      </div>

      {/* ── totals ── */}
      <div className={`${CARD} shrink-0 px-4 py-3 ${typingQty ? "hidden" : ""}`}>
        <div className="flex items-center justify-between text-sm text-muted">
          <span>Items</span>
          <span className="tabular-nums" data-testid="item-count">
            {p.lines.length}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-sm text-muted">
          <span>Goods</span>
          <span className="tabular-nums">{formatRs(goods)}</span>
        </div>
        {discount > 0 && (
          <div className="mt-1 flex items-center justify-between text-sm text-muted">
            <span>Discount</span>
            <span className="tabular-nums">− {formatRs(discount)}</span>
          </div>
        )}
        <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2">
          <span className="text-base font-semibold text-foreground">To pay</span>
          <span className="text-2xl font-bold tabular-nums text-foreground">{formatRs(toPay)}</span>
        </div>
      </div>

      {/* ── actions ── */}
      <div className="flex shrink-0 flex-col gap-2">
        {p.hint && p.phase === "editing" && (
          <p className="px-1 text-xs text-danger">{p.hint}</p>
        )}
        {p.phase === "saved" ? (
          <div className="flex h-16 w-full items-center justify-center rounded-2xl bg-success text-xl font-semibold text-white">
            Saved
          </div>
        ) : (
          <TapButton
            onTap={p.onBig}
            disabled={p.bigDisabled}
            className="flex h-16 w-full items-center justify-center rounded-2xl bg-[#111827] px-3 text-xl font-semibold text-white active:opacity-80 disabled:opacity-40"
          >
            {p.phase === "saving" ? "Saving..." : p.bigLabel}
          </TapButton>
        )}

        {p.mode === "edit" && p.phase === "editing" && p.onPaymentDialog && (
          <TapButton
            onTap={p.onPaymentDialog}
            className="flex h-12 w-full items-center justify-center rounded-xl border border-border bg-surface text-base font-medium text-foreground active:bg-background"
          >
            Payment &amp; customer…
          </TapButton>
        )}

        <div className={`grid-cols-3 gap-2 ${padOpen ? "hidden" : "grid"}`}>
          {p.phase === "saved" && p.saved ? (
            <Link
              href={`/billing/${p.saved.invoiceId}/print?auto=1`}
              prefetch={false}
              className="flex h-12 items-center justify-center rounded-xl border border-border bg-surface px-1 text-center text-sm font-medium text-foreground active:bg-background"
            >
              Print the bill
            </Link>
          ) : (
            <span className="flex h-12 items-center justify-center rounded-xl border border-border bg-surface px-1 text-center text-sm font-medium text-foreground opacity-40">
              Print the bill
            </span>
          )}

          {p.mode === "edit" ? (
            <Link
              href={p.phase === "saved" && p.backToBillHref ? p.backToBillHref : (p.cancelEditHref ?? "/billing")}
              className="flex h-12 items-center justify-center rounded-xl border border-border bg-surface px-1 text-center text-sm font-medium text-foreground active:bg-background"
            >
              {p.phase === "saved" ? "Back to the bill" : "Cancel edit"}
            </Link>
          ) : (
            <TapButton
              onTap={p.onCancelBill}
              disabled={locked || p.lines.length === 0}
              className="flex h-12 items-center justify-center rounded-xl border border-border bg-surface px-1 text-center text-sm font-medium text-foreground active:bg-background disabled:opacity-40"
            >
              Cancel this bill
            </TapButton>
          )}

          {p.mode === "edit" ? (
            <Link
              href="/billing/new"
              className="flex h-12 items-center justify-center rounded-xl border border-border bg-surface px-1 text-center text-sm font-medium text-foreground active:bg-background"
            >
              Start a new bill
            </Link>
          ) : (
            <TapButton
              onTap={p.onNewBill}
              disabled={p.phase !== "saved"}
              className="flex h-12 items-center justify-center rounded-xl border border-border bg-surface px-1 text-center text-sm font-medium text-foreground active:bg-background disabled:opacity-40"
            >
              Start a new bill
            </TapButton>
          )}
        </div>
      </div>
    </div>
  );
}
