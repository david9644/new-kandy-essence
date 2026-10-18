"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TypeAheadSearch } from "@/components/shared/type-ahead-search";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";
import { DeletePinDialog } from "@/components/shared/delete-pin-dialog";
import { PayModal } from "@/components/billing/pay-modal";
import { QuickAddCustomerModal } from "@/components/billing/quick-add-customer-modal";
import { buildPayments, computePay } from "@/components/billing/pay-calc";
import {
  factorOf,
  type BillItem,
  type BillLine,
  type CustomerOption,
  type InitialBill,
  type PayState,
} from "@/components/billing/bill-types";
import {
  createInvoice,
  getLastSalePrice,
  updateInvoice,
  type BillInput,
  type StockShortage,
} from "@/app/(app)/billing/actions";
import { formatCurrency, formatQuantity } from "@/lib/units";
import { fromCents, grossCents, num, r2, toCents, uuid } from "@/lib/billing";

const SMALL_NUMBER =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-right text-base tabular-nums text-foreground focus:border-primary focus:outline-none";

function initialPay(initial?: InitialBill): PayState {
  if (!initial) return { touched: false, cash: "", bank: "", bankRef: "", cheques: [] };
  let cash = 0;
  let bank = 0;
  let bankRef = "";
  const cheques: PayState["cheques"] = [];
  for (const p of initial.payments) {
    if (p.method === "cash") cash += p.amount;
    else if (p.method === "bank_transfer") {
      bank += p.amount;
      if (!bankRef && p.reference) bankRef = p.reference;
    } else if (p.method === "cheque") {
      cheques.push({
        key: uuid(),
        number: p.cheque_number ?? "",
        bank: p.cheque_bank ?? "",
        date: p.cheque_date ?? initial.date,
        amount: String(p.amount),
      });
    }
  }
  return {
    touched: true,
    cash: cash ? String(cash) : "",
    bank: bank ? String(bank) : "",
    bankRef,
    cheques,
  };
}

const LineRow = memo(function LineRow({
  line,
  index,
  item,
  warn,
  onPatch,
  onUnit,
  onRemove,
}: {
  line: BillLine;
  index: number;
  item: BillItem | undefined;
  warn: string | null;
  onPatch: (key: string, patch: Partial<BillLine>) => void;
  onUnit: (key: string, unitName: string) => void;
  onRemove: (key: string) => void;
}) {
  const unitOptions = item
    ? [{ unit_name: item.base_unit, conversion_factor_to_base: 1 }, ...item.units]
    : [{ unit_name: line.unitName, conversion_factor_to_base: 1 }];
  const gross = grossCents(num(line.quantity), num(line.unitPrice));
  const lineTotal = gross - toCents(num(line.discount));

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-foreground">
            <span className="mr-1 text-muted">#{index + 1}</span>
            {item?.name ?? "Unknown item"}
          </p>
          <p className="text-xs text-muted">{item?.code}</p>
        </div>
        <button
          type="button"
          onClick={() => onRemove(line.key)}
          aria-label="Remove line"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-danger active:bg-danger-surface"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div>
          <label className="mb-0.5 block text-xs text-muted">Quantity</label>
          <KeyboardNumberInput
            value={line.quantity}
            onChange={(v) => onPatch(line.key, { quantity: v })}
            className={SMALL_NUMBER}
          />
        </div>
        <div>
          <label className="mb-0.5 block text-xs text-muted">Unit</label>
          <select
            value={line.unitName}
            onChange={(e) => onUnit(line.key, e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-2 py-2.5 text-base text-foreground focus:border-primary focus:outline-none"
          >
            {unitOptions.map((u) => (
              <option key={u.unit_name} value={u.unit_name}>
                {u.unit_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-xs text-muted">Unit price</label>
          <KeyboardNumberInput
            value={line.unitPrice}
            onChange={(v) => onPatch(line.key, { unitPrice: v, priceTouched: true })}
            className={SMALL_NUMBER}
          />
        </div>
        <div>
          <label className="mb-0.5 block text-xs text-muted">Discount</label>
          <KeyboardNumberInput
            value={line.discount}
            onChange={(v) => onPatch(line.key, { discount: v })}
            className={SMALL_NUMBER}
          />
        </div>
        <div className="col-span-2 flex flex-col justify-end sm:col-span-1">
          <label className="mb-0.5 block text-xs text-muted">Line total</label>
          <p className="py-2.5 text-right text-lg font-semibold tabular-nums text-foreground">
            {formatCurrency(fromCents(lineTotal))}
          </p>
        </div>
      </div>

      {warn && <p className="mt-2 text-xs font-medium text-warning">{warn}</p>}
    </div>
  );
});

export function BillingScreen({
  mode,
  items,
  customers,
  isOwner,
  today,
  initial,
  heldBase,
}: {
  mode: "create" | "edit";
  items: BillItem[];
  customers: CustomerOption[];
  isOwner: boolean;
  today: string;
  initial?: InitialBill;
  /** Edit only: base quantity per item the bill already holds (it is
   * restored before the new lines are applied, so it counts as available). */
  heldBase?: Record<string, number>;
}) {
  const router = useRouter();
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const itemByIdRef = useRef(itemById);
  useEffect(() => {
    itemByIdRef.current = itemById;
  }, [itemById]);

  const [lines, setLines] = useState<BillLine[]>(() =>
    (initial?.lines ?? []).map((l) => ({
      key: uuid(),
      itemId: l.itemId,
      unitName: l.unitName,
      quantity: String(l.quantity),
      unitPrice: String(l.unitPrice),
      discount: l.discount ? String(l.discount) : "",
      priceTouched: true,
    }))
  );
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);
  const [customer, setCustomer] = useState<CustomerOption | null>(initial?.customer ?? null);
  const [customerList, setCustomerList] = useState<CustomerOption[]>(customers);
  const [quickAddQuery, setQuickAddQuery] = useState<string | null>(null);
  const [date, setDate] = useState(initial?.date ?? today);
  const [billDiscount, setBillDiscount] = useState(
    initial && initial.billDiscount ? String(initial.billDiscount) : ""
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [pay, setPay] = useState<PayState>(() => initialPay(initial));
  const [payOpen, setPayOpen] = useState(false);
  const [changed, setChanged] = useState(false);
  const [shortages, setShortages] = useState<StockShortage[] | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const confirmRef = useRef(false);
  const clientKey = useRef(uuid());
  const leaveOk = useRef(false);

  const touch = useCallback(() => {
    setChanged(true);
    setShortages(null);
    setSaveError(null);
  }, []);

  const setPayTouch = useCallback(
    (updater: (prev: PayState) => PayState) => {
      setPay(updater);
      touch();
    },
    [touch]
  );

  // ── line editing ─────────────────────────────────────────────────────
  const patchLine = useCallback(
    (key: string, patch: Partial<BillLine>) => {
      setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
      touch();
    },
    [touch]
  );

  const removeLine = useCallback(
    (key: string) => {
      setLines((prev) => prev.filter((l) => l.key !== key));
      touch();
    },
    [touch]
  );

  // Price auto-fill: item default price x the unit's size, else the price
  // this item+unit was last billed at, else empty.
  const fillPrice = useCallback((key: string, item: BillItem, unitName: string) => {
    const factor = factorOf(item, unitName);
    if (item.sale_price != null) {
      const price = String(r2(item.sale_price * factor));
      setLines((prev) =>
        prev.map((l) => (l.key === key && !l.priceTouched ? { ...l, unitPrice: price } : l))
      );
      return;
    }
    void getLastSalePrice(item.id, unitName).then((last) => {
      if (last == null) return;
      setLines((prev) =>
        prev.map((l) =>
          l.key === key && !l.priceTouched && l.unitName === unitName
            ? { ...l, unitPrice: String(last) }
            : l
        )
      );
    });
  }, []);

  const changeUnit = useCallback(
    (key: string, unitName: string) => {
      const current = linesRef.current.find((l) => l.key === key);
      setLines((prev) =>
        prev.map((l) =>
          l.key === key ? { ...l, unitName, unitPrice: l.priceTouched ? l.unitPrice : "" } : l
        )
      );
      touch();
      const item = current ? itemByIdRef.current.get(current.itemId) : undefined;
      if (item && current && !current.priceTouched) fillPrice(key, item, unitName);
    },
    [touch, fillPrice]
  );

  function addItem(item: BillItem) {
    const key = uuid();
    setLines((prev) => [
      ...prev,
      {
        key,
        itemId: item.id,
        unitName: item.base_unit,
        quantity: "1",
        unitPrice: item.sale_price != null ? String(r2(item.sale_price)) : "",
        discount: "",
        priceTouched: false,
      },
    ]);
    touch();
    if (item.sale_price == null) fillPrice(key, item, item.base_unit);
  }

  // ── totals (integer cents) ───────────────────────────────────────────
  const calc = useMemo(() => {
    let subtotalC = 0;
    let lineDiscC = 0;
    const lineIssues: string[] = [];
    const requested = new Map<string, number>();
    lines.forEach((l, i) => {
      const item = itemById.get(l.itemId);
      const q = num(l.quantity);
      const g = grossCents(q, num(l.unitPrice));
      const d = toCents(num(l.discount));
      subtotalC += g;
      lineDiscC += d;
      if (!(q > 0)) lineIssues.push(`Line ${i + 1}: enter a quantity.`);
      else if (d > g) lineIssues.push(`Line ${i + 1}: the discount is more than the line amount.`);
      requested.set(l.itemId, (requested.get(l.itemId) ?? 0) + q * factorOf(item, l.unitName));
    });
    const billDiscC = toCents(num(billDiscount));
    const totalC = subtotalC - lineDiscC - billDiscC;

    const short: StockShortage[] = [];
    const perItemWarn = new Map<string, string>();
    requested.forEach((req, itemId) => {
      const item = itemById.get(itemId);
      if (!item) return;
      const available = item.on_hand + (heldBase?.[itemId] ?? 0);
      if (req > available + 1e-9) {
        short.push({
          item_id: itemId,
          item_name: item.name,
          base_unit: item.base_unit,
          available,
          requested: req,
        });
        perItemWarn.set(
          itemId,
          `Only ${formatQuantity(available)} ${item.base_unit} left (billing ${formatQuantity(req)}).`
        );
      }
    });
    return { subtotalC, lineDiscC, billDiscC, totalC, lineIssues, short, perItemWarn };
  }, [lines, billDiscount, itemById, heldBase]);

  const summary = useMemo(() => computePay(Math.max(calc.totalC, 0), pay), [calc.totalC, pay]);

  const problems: string[] = [];
  if (lines.length === 0) problems.push("Add at least one item.");
  if (calc.lineIssues.length) problems.push(calc.lineIssues[0]);
  if (calc.billDiscC < 0 || calc.billDiscC > calc.subtotalC - calc.lineDiscC) {
    problems.push("The bill discount is more than the bill amount.");
  }
  if (lines.length > 0 && calc.totalC <= 0 && calc.lineIssues.length === 0) {
    problems.push("The bill total must be more than zero.");
  }
  if (summary.overpaid) problems.push("Bank transfer + cheques are more than the bill total.");
  if (summary.chequeIssue) problems.push(summary.chequeIssue);
  if (summary.creditC > 0 && !customer && calc.totalC > 0) {
    problems.push("Choose a customer to leave credit on this bill (or take full payment).");
  }

  const dirty = mode === "create" ? lines.length > 0 : changed;

  // ── leaving with an unsaved bill ─────────────────────────────────────
  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(e: BeforeUnloadEvent) {
      if (leaveOk.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    function onLinkClick(e: MouseEvent) {
      if (leaveOk.current) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      if (!window.confirm("You have an unsaved bill. Leave without saving?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onLinkClick, true);
    };
  }, [dirty]);

  // ── saving ───────────────────────────────────────────────────────────
  function buildInput(confirmShortage: boolean): BillInput {
    return {
      date: isOwner ? date : today,
      customer_id: customer?.id ?? null,
      bill_discount: fromCents(calc.billDiscC),
      notes,
      lines: lines.map((l) => ({
        item_id: l.itemId,
        unit_name: l.unitName,
        quantity: num(l.quantity),
        unit_price: r2(num(l.unitPrice)),
        line_discount: r2(num(l.discount)),
      })),
      payments: buildPayments(summary, pay),
      expected_total: fromCents(calc.totalC),
      confirm_shortage: confirmShortage,
    };
  }

  function finish(invoiceId: string) {
    leaveOk.current = true;
    router.push(`/billing/${invoiceId}`);
  }

  async function doCreate(confirmShortage: boolean) {
    setSaving(true);
    setSaveError(null);
    const result = await createInvoice(buildInput(confirmShortage), clientKey.current);
    setSaving(false);
    if ("ok" in result) return finish(result.invoiceId);
    if ("shortages" in result) {
      setShortages(result.shortages);
      return;
    }
    setSaveError(result.error);
  }

  function proceed(confirmShortage: boolean) {
    confirmRef.current = confirmShortage;
    if (mode === "edit") setPinOpen(true);
    else void doCreate(confirmShortage);
  }

  function onSave() {
    if (problems.length > 0 || saving) return;
    if (calc.short.length > 0) {
      setShortages(calc.short);
      return;
    }
    proceed(false);
  }

  const hasShortageBanner = shortages !== null && shortages.length > 0;

  return (
    <div className="mx-auto max-w-5xl">
      {/* Always-visible totals + Save (top, so the on-screen keyboard docked
          at the bottom can never cover them) */}
      <div
        className="sticky z-20 -mx-4 mb-3 border-b border-border bg-surface px-4 py-3 shadow-sm"
        style={{ top: "var(--app-header-h, 0px)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted">
              {lines.length} {lines.length === 1 ? "line" : "lines"} · Subtotal{" "}
              {formatCurrency(fromCents(calc.subtotalC))}
              {calc.lineDiscC + Math.max(calc.billDiscC, 0) > 0 &&
                ` · Discounts ${formatCurrency(fromCents(calc.lineDiscC + Math.max(calc.billDiscC, 0)))}`}
            </p>
            <p className="text-3xl font-bold tabular-nums leading-tight text-foreground">
              {formatCurrency(fromCents(Math.max(calc.totalC, 0)))}
            </p>
            <p className="text-xs text-muted">
              Paid {formatCurrency(fromCents(summary.paidC))}
              {summary.creditC > 0 ? (
                <span className="font-medium text-warning">
                  {" "}
                  · Credit {formatCurrency(fromCents(summary.creditC))}
                </span>
              ) : summary.changeC > 0 ? (
                <span className="font-medium text-success">
                  {" "}
                  · Change {formatCurrency(fromCents(summary.changeC))}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPayOpen(true)}
              className="flex h-14 items-center rounded-xl border border-border px-5 text-base font-semibold text-foreground active:bg-background"
            >
              Pay
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={problems.length > 0 || saving}
              className="flex h-14 items-center rounded-xl bg-primary px-6 text-lg font-semibold text-primary-foreground disabled:opacity-40"
            >
              {saving ? "Saving..." : mode === "edit" ? "Save Changes" : "Save Bill"}
            </button>
          </div>
        </div>
        {problems.length > 0 && lines.length > 0 && (
          <p className="mt-1 text-xs text-danger">{problems[0]}</p>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-foreground">
          {mode === "edit" ? `Edit ${initial?.invoiceNo ?? "bill"}` : "New Bill"}
        </h1>
        <div className="flex items-center gap-2">
          {isOwner ? (
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                touch();
              }}
              className="h-11 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          ) : (
            <span className="text-sm text-muted">{today}</span>
          )}
          <Link
            href={mode === "edit" && initial ? `/billing/${initial.invoiceId}` : "/billing"}
            className="flex h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground active:bg-background"
          >
            {mode === "edit" ? "Cancel edit" : "Bills"}
          </Link>
        </div>
      </div>

      {mode === "edit" && (
        <p className="mb-3 rounded-lg bg-warning-surface px-3 py-2 text-sm text-warning">
          Saving replaces this bill&rsquo;s lines, payments, stock deductions and customer
          entries. You&rsquo;ll be asked for the Delete PIN.
        </p>
      )}

      {saveError && (
        <p className="mb-3 rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">
          {saveError}
        </p>
      )}

      {hasShortageBanner && (
        <div className="mb-3 rounded-lg bg-warning-surface px-3 py-3 text-sm text-warning">
          <ul className="mb-2 list-disc pl-5">
            {shortages!.map((s) => (
              <li key={s.item_id}>
                {s.item_name}: only {formatQuantity(s.available)} {s.base_unit} left, you&rsquo;re
                billing {formatQuantity(s.requested)} {s.base_unit}.
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => proceed(true)}
            disabled={saving || problems.length > 0}
            className="flex h-12 items-center rounded-lg bg-warning px-4 text-base font-semibold text-white disabled:opacity-50"
          >
            Confirm &amp; Save anyway
          </button>
        </div>
      )}

      <div className="mb-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-3">
          <label className="mb-1.5 block text-sm font-medium text-foreground">Customer</label>
          {customer ? (
            <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{customer.name}</p>
                <p className="text-xs text-muted">{customer.code}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCustomer(null);
                  touch();
                }}
                className="flex h-10 items-center rounded-lg border border-border px-3 text-sm font-medium text-foreground active:bg-surface"
              >
                Walk-in
              </button>
            </div>
          ) : (
            <TypeAheadSearch
              items={customerList}
              getId={(c) => c.id}
              getLabel={(c) => c.name}
              getCode={(c) => c.code}
              placeholder="Walk-in (or search a customer)..."
              onSelect={(c) => {
                setCustomer(c);
                touch();
              }}
              onCreateNew={setQuickAddQuery}
              createLabel="customer"
            />
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-3">
          <label className="mb-1.5 block text-sm font-medium text-foreground">Add item</label>
          <TypeAheadSearch
            items={items}
            getId={(i) => i.id}
            getLabel={(i) => i.name}
            getCode={(i) => i.code}
            getSubtext={(i) =>
              [
                i.sale_price != null ? `${formatCurrency(i.sale_price)}/${i.base_unit}` : null,
                `${formatQuantity(i.on_hand)} ${i.base_unit} in stock`,
              ]
                .filter(Boolean)
                .join(" · ")
            }
            placeholder="Search item by name or code..."
            onSelect={addItem}
            autoFocus={mode === "create"}
          />
        </div>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface p-3">
        <div>
          <label className="mb-1 block text-xs text-muted">Bill discount (LKR)</label>
          <KeyboardNumberInput
            value={billDiscount}
            onChange={(v) => {
              setBillDiscount(v);
              touch();
            }}
            className={SMALL_NUMBER}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Notes</label>
          <KeyboardTextInput
            value={notes}
            onChange={(v) => {
              setNotes(v);
              touch();
            }}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base text-foreground focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {/* newest line first, so the item just added is always on screen */}
      <div className="flex flex-col gap-2 pb-6">
        {[...lines]
          .map((line, index) => ({ line, index }))
          .reverse()
          .map(({ line, index }) => (
            <LineRow
              key={line.key}
              line={line}
              index={index}
              item={itemById.get(line.itemId)}
              warn={calc.perItemWarn.get(line.itemId) ?? null}
              onPatch={patchLine}
              onUnit={changeUnit}
              onRemove={removeLine}
            />
          ))}
        {lines.length === 0 && (
          <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
            Search an item above to start the bill.
          </p>
        )}
      </div>

      <PayModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        totalCents={Math.max(calc.totalC, 0)}
        pay={pay}
        setPay={setPayTouch}
        summary={summary}
        hasCustomer={customer !== null}
        today={today}
      />

      {quickAddQuery !== null && (
        <QuickAddCustomerModal
          initialName={quickAddQuery}
          onClose={() => setQuickAddQuery(null)}
          onCreated={(c) => {
            setCustomerList((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
            setCustomer(c);
            setQuickAddQuery(null);
            touch();
          }}
        />
      )}

      {mode === "edit" && initial && (
        <DeletePinDialog
          open={pinOpen}
          title="Save changes to this bill"
          description="Enter your Delete PIN to confirm."
          submitLabel="Save"
          onCancel={() => setPinOpen(false)}
          onSubmit={async (pin) => {
            const result = await updateInvoice(initial.invoiceId, buildInput(confirmRef.current), pin);
            if ("ok" in result) {
              finish(result.invoiceId);
              return undefined;
            }
            if ("shortages" in result) {
              setShortages(result.shortages);
              setPinOpen(false);
              return undefined;
            }
            if (result.code) return result; // PIN problem: stay in the dialog
            setSaveError(result.error);
            setPinOpen(false);
            return undefined;
          }}
        />
      )}
    </div>
  );
}
