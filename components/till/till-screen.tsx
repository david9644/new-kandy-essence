"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DeletePinDialog } from "@/components/shared/delete-pin-dialog";
import type { CustomerOption, InitialBill } from "@/components/billing/bill-types";
import {
  createInvoice,
  loadShelf,
  updateInvoice,
  type BillInput,
  type SaveBillResult,
  type StockShortage,
} from "@/app/(app)/billing/actions";
import { fromCents, num, r2, uuid } from "@/lib/billing";
import {
  addOrIncrement,
  calcBill,
  factorFor,
  type DraftLine,
} from "@/lib/till/bill";
import { formatRs } from "@/lib/till/format";
import { UNCONFIRMED_MESSAGE, settle } from "@/lib/till/net";
import {
  buildPayments,
  cashReceivedToStore,
  computePay,
  type OtherRow,
  type PayInput,
} from "@/lib/till/pay";
import type { Shelf, ShelfItem, ShelfUnit } from "@/lib/till/shelf";
import { formatQuantity } from "@/lib/units";
import { AddItemDialog } from "./add-item-dialog";
import { BillPanel, JustSavedNotice, type JustSaved, type Phase, type SavedInfo } from "./bill-panel";
import { LineSheet } from "./line-sheet";
import { QuickAddCustomer } from "./quick-add-customer";
import { ShelfPanel } from "./shelf-panel";
import { TakeMoneyDialog, type AfterSave } from "./take-money-dialog";

const SAVE_TIMEOUT_MS = 20000;
const REFRESH_MIN_GAP_MS = 15000;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function draftFromInitial(initial?: InitialBill): DraftLine[] {
  return (initial?.lines ?? []).map((l) => ({
    key: uuid(),
    itemId: l.itemId,
    unitName: l.unitName,
    quantity: String(l.quantity),
    unitPrice: String(l.unitPrice),
    discount: l.discount ? String(l.discount) : "",
    listPrice: l.listUnitPrice,
  }));
}

// Edit: the saved payments become the dialog's starting point. Anything the bill
// leaves unpaid shows up as an explicit Credit row, so it is never silent.
function payFromInitial(
  initial: InitialBill | undefined,
  today: string
): { pay: PayInput; cashAuto: boolean } {
  if (!initial) return { pay: { cash: "", rows: [] }, cashAuto: true };
  let cashSum = 0;
  let paid = 0;
  const rows: OtherRow[] = [];
  for (const p of initial.payments) {
    paid += p.amount;
    if (p.method === "cash") cashSum += p.amount;
    else if (p.method === "bank_transfer") {
      rows.push({
        key: uuid(),
        method: "bank_transfer",
        amount: String(p.amount),
        number: "",
        bank: "",
        date: today,
        reference: p.reference ?? "",
      });
    } else if (p.method === "cheque") {
      rows.push({
        key: uuid(),
        method: "cheque",
        amount: String(p.amount),
        number: p.cheque_number ?? "",
        bank: p.cheque_bank ?? "",
        date: p.cheque_date ?? initial.date,
        reference: "",
      });
    }
  }
  const totalC = calcBill(draftFromInitial(initial), String(initial.billDiscount || ""), new Map()).totalC;
  const unpaidC = totalC - Math.round(paid * 100);
  if (unpaidC > 0) {
    rows.push({ key: uuid(), method: "credit", amount: "", number: "", bank: "", date: today, reference: "" });
  }
  const tendered = initial.cashReceived !== null && cashSum > 0 ? initial.cashReceived : cashSum;
  const auto = rows.length === 0 && initial.cashReceived === null;
  return { pay: { cash: tendered ? String(tendered) : "", rows }, cashAuto: auto };
}

export function TillScreen({
  mode,
  initialShelf,
  extraItems,
  customers,
  isOwner,
  today,
  initial,
  heldBase,
}: {
  mode: "create" | "edit";
  initialShelf: Shelf | null;
  /** Edit only: items on the bill that are no longer on the shelf (deactivated). */
  extraItems?: ShelfItem[];
  customers: CustomerOption[];
  isOwner: boolean;
  today: string;
  initial?: InitialBill;
  /** Edit only: base quantity per item the bill already holds (it is restored
   * before the new lines are applied, so it counts as available). */
  heldBase?: Record<string, number>;
}) {
  const router = useRouter();

  // ── shelf ─────────────────────────────────────────────────────────────
  const [shelf, setShelf] = useState<Shelf | null>(initialShelf);
  const items = useMemo(() => {
    const base = shelf?.items ?? [];
    if (!extraItems?.length) return base;
    const have = new Set(base.map((i) => i.id));
    return [...base, ...extraItems.filter((i) => !have.has(i.id))];
  }, [shelf, extraItems]);
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const refreshShelf = useCallback(async () => {
    try {
      const next = await loadShelf();
      if (next) setShelf(next);
    } catch {
      // keep what we have: a failed refresh must never disturb a bill in progress
    }
  }, []);

  useEffect(() => {
    let last = Date.now();
    function run() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < REFRESH_MIN_GAP_MS) return;
      last = Date.now();
      void refreshShelf();
    }
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [refreshShelf]);

  // ── the bill (a local draft until it is saved) ───────────────────────
  const [lines, setLinesState] = useState<DraftLine[]>(() => draftFromInitial(initial));
  const linesRef = useRef(lines);
  const setLines = useCallback((next: DraftLine[]) => {
    linesRef.current = next;
    setLinesState(next);
  }, []);

  const [discountInput, setDiscountInput] = useState(
    initial && initial.billDiscount ? String(initial.billDiscount) : ""
  );
  const [discountApplied, setDiscountApplied] = useState(discountInput);
  const [customer, setCustomer] = useState<CustomerOption | null>(initial?.customer ?? null);
  const [customerList, setCustomerList] = useState<CustomerOption[]>(customers);
  const [quickAddQuery, setQuickAddQuery] = useState<string | null>(null);
  // "+ Add item" (Owner only): the typed name to start from, or null when closed
  const [addItemName, setAddItemName] = useState<string | null>(null);
  // tells the shelf to show the item that was just added
  const [reveal, setReveal] = useState<{ name: string; n: number } | null>(null);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [date, setDate] = useState(initial?.date ?? today);

  const startPay = useMemo(() => payFromInitial(initial, today), [initial, today]);
  const [pay, setPay] = useState<PayInput>(startPay.pay);
  const [cashAuto, setCashAuto] = useState(startPay.cashAuto);
  const payRef = useRef(pay);
  useEffect(() => {
    payRef.current = pay;
  }, [pay]);

  const [changed, setChanged] = useState(false);
  const [phase, setPhase] = useState<Phase>("editing");
  const phaseRef = useRef<Phase>("editing");
  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);
  const [saved, setSaved] = useState<SavedInfo | null>(null);
  // "Save only": the till is already empty again; this is the line that says what was saved
  const [justSaved, setJustSaved] = useState<JustSaved | null>(null);
  // Which button the cashier pressed (Save & Print / Save only). It stays the same
  // through the over-stock confirmation, a Retry and a late answer.
  const afterSaveRef = useRef<AfterSave>("print");
  // onSaved is memoised, so it reaches the current reset / refresh through this ref
  const actionsRef = useRef({ startFresh: () => {} });
  const [shortages, setShortages] = useState<StockShortage[] | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [tab, setTab] = useState<"items" | "bill">("items");
  const [moneyOpen, setMoneyOpen] = useState(false);
  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const [pinOpen, setPinOpen] = useState(false);

  // One key per bill (create) / per edit session: pressing twice, or retrying
  // after a lost answer, can only ever save once.
  const clientKey = useRef(uuid());
  const editKey = useRef(uuid());
  const confirmRef = useRef(false);
  const pendingInput = useRef<BillInput | null>(null);
  const pendingMeta = useRef<Pick<SavedInfo, "paidC" | "creditC" | "changeC">>({
    paidC: 0,
    creditC: 0,
    changeC: 0,
  });
  const inFlight = useRef(false);

  const billChanged = useCallback(() => {
    setChanged(true);
    setShortages(null);
    setSaveError(null);
    // cash follows what is owed again, unless the rest was deliberately left on credit
    if (!payRef.current.rows.some((r) => r.method === "credit")) setCashAuto(true);
  }, []);

  // ── adding / changing lines ──────────────────────────────────────────
  const onPick = useCallback(
    (item: ShelfItem, unit: ShelfUnit) => {
      if (phaseRef.current !== "editing") return;
      const res = addOrIncrement(linesRef.current, item.id, unit.unit_name, unit.price, uuid());
      setLines(res.lines);
      billChanged();
      if (res.created && unit.price === null) setSheetKey(res.key);
    },
    [setLines, billChanged]
  );

  const onStep = useCallback(
    (key: string, delta: number) => {
      const current = linesRef.current;
      const line = current.find((l) => l.key === key);
      if (!line) return;
      const q = round3(num(line.quantity) + delta);
      if (q <= 0) setLines(current.filter((l) => l.key !== key));
      else setLines(current.map((l) => (l.key === key ? { ...l, quantity: String(q) } : l)));
      billChanged();
    },
    [setLines, billChanged]
  );

  const patchLine = useCallback(
    (key: string, patch: Partial<DraftLine>) => {
      setLines(linesRef.current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
      billChanged();
    },
    [setLines, billChanged]
  );

  const removeLine = useCallback(
    (key: string) => {
      setLines(linesRef.current.filter((l) => l.key !== key));
      billChanged();
    },
    [setLines, billChanged]
  );

  const itemsByIdRef = useRef(itemsById);
  useEffect(() => {
    itemsByIdRef.current = itemsById;
  }, [itemsById]);

  const changeUnit = useCallback(
    (key: string, unitName: string) => {
      const line = linesRef.current.find((l) => l.key === key);
      const unit = line ? itemsByIdRef.current.get(line.itemId)?.units.find((u) => u.unit_name === unitName) : undefined;
      // A price belongs to one unit: switching starts from that unit's shelf price.
      patchLine(key, {
        unitName,
        unitPrice: unit?.price != null ? String(unit.price) : "",
        listPrice: unit?.price ?? null,
      });
    },
    [patchLine]
  );

  const applyDiscount = useCallback(() => {
    setDiscountApplied(discountInput);
    billChanged();
  }, [discountInput, billChanged]);

  // ── totals ───────────────────────────────────────────────────────────
  const calc = useMemo(() => calcBill(lines, discountApplied, itemsById), [lines, discountApplied, itemsById]);

  const { short, lowStock } = useMemo(() => {
    const shortList: StockShortage[] = [];
    const low = new Set<string>();
    calc.requested.forEach((req, itemId) => {
      const item = itemsById.get(itemId);
      if (!item) return;
      const available = item.stock + (heldBase?.[itemId] ?? 0);
      if (req > available + 1e-9) {
        low.add(itemId);
        shortList.push({
          item_id: itemId,
          item_name: item.name,
          base_unit: item.base_unit,
          available,
          requested: req,
        });
      }
    });
    return { short: shortList, lowStock: low };
  }, [calc.requested, itemsById, heldBase]);

  const totalC = Math.max(calc.totalC, 0);
  const effectivePay = useMemo<PayInput>(() => {
    if (!cashAuto) return pay;
    const hasCredit = pay.rows.some((r) => r.method === "credit");
    let nonCashC = 0;
    for (const r of pay.rows) if (r.method !== "credit") nonCashC += Math.round(num(r.amount) * 100);
    const cashC = hasCredit ? 0 : Math.max(0, totalC - nonCashC);
    return { ...pay, cash: cashC > 0 ? String(fromCents(cashC)) : "" };
  }, [pay, cashAuto, totalC]);
  const summary = useMemo(
    () => computePay(totalC, effectivePay, customer !== null),
    [totalC, effectivePay, customer]
  );

  const discountDirty = discountInput.trim() !== discountApplied.trim();
  let hint: string | null = null;
  if (lines.length > 0) {
    if (discountDirty) hint = "Tap Apply to use the discount you typed.";
    else if (calc.issues.length > 0) hint = calc.issues[0];
    else if (mode === "edit" && summary.issues.length > 0) hint = `Payment: ${summary.issues[0]}`;
  }
  const bigDisabled = phase !== "editing" || lines.length === 0 || hint !== null;

  const dirty = phase !== "saved" && (mode === "create" ? lines.length > 0 : changed);

  // ── leaving with an unsaved bill ─────────────────────────────────────
  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    function onLinkClick(e: MouseEvent) {
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
      bill_discount: fromCents(Math.max(calc.billDiscC, 0)),
      notes,
      lines: lines.map((l) => ({
        item_id: l.itemId,
        unit_name: l.unitName,
        quantity: num(l.quantity),
        unit_price: r2(num(l.unitPrice)),
        line_discount: r2(num(l.discount)),
      })),
      payments: buildPayments(summary, effectivePay),
      expected_total: fromCents(calc.totalC),
      confirm_shortage: confirmShortage,
      cash_received: cashReceivedToStore(summary, initial?.cashReceived != null),
    };
  }

  function captureMeta() {
    pendingMeta.current = {
      paidC: summary.paidC,
      creditC: summary.creditC,
      changeC: summary.changeC,
    };
  }

  // The server confirmed it: show the receipt panel and take the sold stock off
  // the shelf counts locally (the next refresh makes them exact).
  const onSaved = useCallback(
    (invoiceId: string, invoiceNo: string) => {
      if (phaseRef.current === "saved") return;
      setSaved({ invoiceId, invoiceNo, ...pendingMeta.current });
      setPhaseBoth("saved");
      setChanged(false);
      setShortages(null);
      setSaveError(null);
      setMoneyOpen(false);
      setPinOpen(false);
      setTab("bill");
      if (mode === "create") {
        const sold = new Map<string, number>();
        for (const l of linesRef.current) {
          const f = factorFor(itemsByIdRef.current.get(l.itemId), l.unitName);
          sold.set(l.itemId, (sold.get(l.itemId) ?? 0) + num(l.quantity) * f);
        }
        setShelf((prev) =>
          prev
            ? { ...prev, items: prev.items.map((i) => (sold.has(i.id) ? { ...i, stock: i.stock - (sold.get(i.id) ?? 0) } : i)) }
            : prev
        );
        // what comes next is decided by the button that was pressed
        if (afterSaveRef.current === "print") {
          // straight to the print view in auto-print mode; replace, so Back never returns to it
          router.replace(`/billing/${invoiceId}/print?auto=1&next=new`);
        } else {
          setJustSaved({ invoiceId, invoiceNo, changeC: pendingMeta.current.changeC });
          actionsRef.current.startFresh();
        }
      }
    },
    [mode, setPhaseBoth, router]
  );

  const onResult = useCallback(
    (result: SaveBillResult) => {
      if (phaseRef.current === "saved") return;
      if ("ok" in result) return onSaved(result.invoiceId, result.invoiceNo);
      setPhaseBoth("editing");
      if ("shortages" in result) setShortages(result.shortages);
      else setSaveError(result.error);
    },
    [onSaved, setPhaseBoth]
  );

  async function runCreate(input: BillInput) {
    if (inFlight.current) return;
    inFlight.current = true;
    pendingInput.current = input;
    setJustSaved(null);
    setPhaseBoth("saving");
    setSaveError(null);
    setMoneyOpen(false);
    const outcome = await settle(createInvoice(input, clientKey.current), SAVE_TIMEOUT_MS, (late) => {
      if (phaseRef.current === "unconfirmed" || phaseRef.current === "saving") onResult(late);
    });
    inFlight.current = false;
    if (outcome.kind === "unconfirmed") {
      if (phaseRef.current !== "saved") setPhaseBoth("unconfirmed");
      return;
    }
    onResult(outcome.value);
  }

  function retry() {
    if (pendingInput.current) void runCreate(pendingInput.current);
  }

  // The first press: open the money dialog (create) or the Delete PIN (edit).
  function onBig() {
    if (bigDisabled) return;
    if (mode === "edit") {
      if (short.length > 0) return void setShortages(short);
      confirmRef.current = false;
      setPinOpen(true);
    } else {
      setMoneyOpen(true);
    }
  }

  function confirmMoney(after: AfterSave) {
    if (summary.issues.length > 0 || calc.issues.length > 0 || phaseRef.current !== "editing") return;
    if (mode === "edit") return void setMoneyOpen(false);
    afterSaveRef.current = after;
    setMoneyOpen(false);
    if (short.length > 0) return void setShortages(short);
    captureMeta();
    void runCreate(buildInput(false));
  }

  function confirmShortage() {
    if (calc.issues.length > 0 || phaseRef.current !== "editing") return;
    if (mode === "edit") {
      confirmRef.current = true;
      setPinOpen(true);
      return;
    }
    if (summary.issues.length > 0) return void setMoneyOpen(true);
    captureMeta();
    void runCreate(buildInput(true));
  }

  async function submitPin(pin: string) {
    if (!initial) return undefined;
    captureMeta();
    const outcome = await settle(
      updateInvoice(initial.invoiceId, buildInput(confirmRef.current), pin, editKey.current),
      SAVE_TIMEOUT_MS,
      (late) => {
        if ("ok" in late) onSaved(late.invoiceId, late.invoiceNo || initial.invoiceNo);
      }
    );
    if (outcome.kind === "unconfirmed") return { error: UNCONFIRMED_MESSAGE };
    const result = outcome.value;
    if ("ok" in result) {
      onSaved(result.invoiceId, result.invoiceNo || initial.invoiceNo);
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
  }

  // ── resetting ────────────────────────────────────────────────────────
  function resetBill() {
    setLines([]);
    setDiscountInput("");
    setDiscountApplied("");
    setCustomer(null);
    setNotes("");
    setDate(today);
    setPay({ cash: "", rows: [] });
    setCashAuto(true);
    setChanged(false);
    setShortages(null);
    setSaveError(null);
    setSaved(null);
    setSheetKey(null);
    setMoneyOpen(false);
    pendingInput.current = null;
    clientKey.current = uuid();
    setPhaseBoth("editing");
    setTab("items");
  }

  function cancelBill() {
    if (linesRef.current.length === 0) return;
    if (!window.confirm("Clear this bill and start again?")) return;
    resetBill();
  }

  function newBill() {
    resetBill();
    void refreshShelf();
  }

  useEffect(() => {
    actionsRef.current = {
      startFresh: () => {
        resetBill();
        void refreshShelf();
      },
    };
  });

  // ── payment dialog plumbing ──────────────────────────────────────────
  const addRow = useCallback(() => {
    setPay((p) => ({
      ...p,
      rows: [
        ...p.rows,
        { key: uuid(), method: "bank_transfer", amount: "", number: "", bank: "", date: today, reference: "" },
      ],
    }));
  }, [today]);

  const patchRow = useCallback((key: string, patch: Partial<OtherRow>) => {
    setPay((p) => {
      const rows = p.rows.map((r) => (r.key === key ? { ...r, ...patch } : r));
      const hadCredit = p.rows.some((r) => r.method === "credit");
      const hasCredit = rows.some((r) => r.method === "credit");
      if (!hadCredit && hasCredit) {
        // "leave the rest on credit": nothing is taken in cash unless typed
        setCashAuto(false);
        return { cash: "", rows };
      }
      if (hadCredit && !hasCredit) setCashAuto(true);
      return { ...p, rows };
    });
  }, []);

  const removeRow = useCallback((key: string) => {
    setPay((p) => {
      const rows = p.rows.filter((r) => r.key !== key);
      if (p.rows.some((r) => r.method === "credit") && !rows.some((r) => r.method === "credit")) {
        setCashAuto(true);
      }
      return { ...p, rows };
    });
  }, []);

  // ── rendering helpers ────────────────────────────────────────────────
  const nameOf = (line: DraftLine) => itemsById.get(line.itemId)?.name ?? "Unknown item";
  const unitLabelOf = (line: DraftLine) => line.unitName;
  const sheetLine = sheetKey ? (lines.find((l) => l.key === sheetKey) ?? null) : null;
  const sheetItem = sheetLine ? itemsById.get(sheetLine.itemId) : undefined;
  const sheetWarn =
    sheetLine && lowStock.has(sheetLine.itemId) && sheetItem
      ? `Only ${formatQuantity(sheetItem.stock + (heldBase?.[sheetItem.id] ?? 0))} ${sheetItem.base_unit} left.`
      : null;

  if (!shelf) {
    return (
      <div className="m-4 rounded-2xl border border-danger/40 bg-danger-surface p-6 text-center text-danger">
        <p className="font-semibold">The item list could not be loaded.</p>
        <button
          type="button"
          onClick={() => void refreshShelf()}
          className="mt-4 h-12 rounded-xl bg-danger px-6 text-base font-semibold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  const locked = phase !== "editing";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* phone: two tabs in a strip at the top (the keypad docks at the bottom) */}
      <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-border bg-surface px-3 py-2 md:hidden">
        <button
          type="button"
          onClick={() => setTab("items")}
          className={`h-12 rounded-xl text-base font-semibold ${
            tab === "items" ? "bg-[#111827] text-white" : "border border-border bg-surface text-foreground"
          }`}
        >
          Items
        </button>
        <button
          type="button"
          onClick={() => setTab("bill")}
          className={`h-12 rounded-xl px-2 text-base font-semibold ${
            tab === "bill" ? "bg-[#111827] text-white" : "border border-border bg-surface text-foreground"
          }`}
        >
          Bill ({lines.length}) {formatRs(fromCents(totalC))}
        </button>
      </div>

      {justSaved && phase === "editing" && (
        <JustSavedNotice info={justSaved} onDismiss={() => setJustSaved(null)} />
      )}

      <div className="flex min-h-0 flex-1 gap-4 p-3 md:p-4">
        <section className={`${tab === "items" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col gap-2 md:flex`}>
          {mode === "edit" && (
            <p className="shrink-0 rounded-xl bg-warning-surface px-3 py-2 text-xs text-warning">
              Saving replaces this bill&rsquo;s lines, payments, stock deductions and customer
              entries. You&rsquo;ll be asked for the Delete PIN.
            </p>
          )}
          <ShelfPanel
            categories={shelf.categories}
            items={items}
            onPick={onPick}
            locked={locked}
            onAddItem={isOwner ? setAddItemName : undefined}
            reveal={reveal}
          />
        </section>

        <aside
          className={`${tab === "bill" ? "flex" : "hidden"} min-h-0 w-full flex-col md:flex md:w-[380px] md:shrink-0 lg:w-[400px]`}
        >
          <BillPanel
            mode={mode}
            invoiceNo={initial?.invoiceNo}
            phase={phase}
            lines={lines}
            nameOf={nameOf}
            unitLabelOf={unitLabelOf}
            calc={calc}
            lowStock={lowStock}
            onStep={onStep}
            onOpenLine={setSheetKey}
            discountInput={discountInput}
            discountApplied={discountApplied}
            onDiscountInput={setDiscountInput}
            onApplyDiscount={applyDiscount}
            bigLabel={mode === "edit" ? "Save changes" : `Take the money: ${formatRs(fromCents(totalC))}`}
            bigDisabled={bigDisabled}
            hint={hint}
            onBig={onBig}
            saved={saved}
            saveError={saveError}
            shortages={shortages}
            onConfirmShortage={confirmShortage}
            onRetry={retry}
            onPaymentDialog={() => setMoneyOpen(true)}
            onCancelBill={cancelBill}
            onNewBill={newBill}
            cancelEditHref={initial ? `/billing/${initial.invoiceId}` : "/billing"}
            backToBillHref={initial ? `/billing/${initial.invoiceId}` : "/billing"}
          />
        </aside>
      </div>

      <LineSheet
        line={sheetLine}
        item={sheetItem}
        itemName={sheetLine ? nameOf(sheetLine) : ""}
        warn={sheetWarn}
        onPatch={patchLine}
        onUnit={changeUnit}
        onRemove={removeLine}
        onClose={() => setSheetKey(null)}
      />

      <TakeMoneyDialog
        open={moneyOpen}
        mode={mode}
        onClose={() => setMoneyOpen(false)}
        totalC={totalC}
        pay={effectivePay}
        summary={summary}
        cashAuto={cashAuto}
        onCash={(text) => {
          setCashAuto(false);
          setPay((p) => ({ ...p, cash: text }));
        }}
        onQuick={(amount) => {
          setCashAuto(false);
          setPay((p) => ({ ...p, cash: String(amount) }));
        }}
        onAddRow={addRow}
        onPatchRow={patchRow}
        onRemoveRow={removeRow}
        customer={customer}
        customerList={customerList}
        onCustomer={(c) => {
          setCustomer(c);
          setChanged(true);
        }}
        onQuickAddCustomer={setQuickAddQuery}
        notes={notes}
        onNotes={(t) => {
          setNotes(t);
          setChanged(true);
        }}
        isOwner={isOwner}
        date={date}
        onDate={(d) => {
          setDate(d);
          setChanged(true);
        }}
        saving={phase !== "editing"}
        onConfirm={confirmMoney}
      />

      {quickAddQuery !== null && (
        <QuickAddCustomer
          initialName={quickAddQuery}
          onClose={() => setQuickAddQuery(null)}
          onCreated={(c) => {
            setCustomerList((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
            setCustomer(c);
            setChanged(true);
            setQuickAddQuery(null);
          }}
        />
      )}

      {isOwner && addItemName !== null && (
        <AddItemDialog
          initialName={addItemName}
          categories={shelf.categories}
          onClose={() => setAddItemName(null)}
          onCategoryCreated={(c) =>
            setShelf((prev) =>
              prev && !prev.categories.some((x) => x.id === c.id)
                ? { ...prev, categories: [...prev.categories, c] }
                : prev
            )
          }
          onCreated={(item) => {
            // straight onto the held shelf (no reload); the bill is untouched
            setShelf((prev) =>
              prev && !prev.items.some((x) => x.id === item.id)
                ? { ...prev, items: [...prev.items, item] }
                : prev
            );
            setReveal((r) => ({ name: item.name, n: (r?.n ?? 0) + 1 }));
            setAddItemName(null);
            setTab("items");
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
          onSubmit={submitPin}
        />
      )}
    </div>
  );
}
