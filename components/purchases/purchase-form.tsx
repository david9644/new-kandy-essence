"use client";

import { useMemo, useState, useTransition } from "react";
import { TypeAheadSearch } from "@/components/shared/type-ahead-search";
import { PurchaseLineRow, emptyLine, lineTotal, type ItemOption, type LineState } from "./purchase-line-row";
import { ChequeFields, type BankAccountOption } from "./cheque-fields";
import { createPurchase } from "@/app/(app)/purchases/actions";
import { formatCurrency } from "@/lib/units";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";
import { KeyboardTextArea } from "@/components/keyboard/keyboard-textarea";
import type { Database } from "@/lib/types/database.types";

type PaymentType = Database["public"]["Enums"]["purchase_payment_type"];

export interface SupplierOption {
  id: string;
  code: string;
  name: string;
}

let keyCounter = 0;
function nextKey() {
  keyCounter += 1;
  return `line-${keyCounter}`;
}

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
}

export function PurchaseForm({
  suppliers,
  items,
  bankAccounts,
}: {
  suppliers: SupplierOption[];
  items: ItemOption[];
  bankAccounts: BankAccountOption[];
}) {
  const [supplier, setSupplier] = useState<SupplierOption | null>(null);
  const [date, setDate] = useState(todayIso());
  const [paymentType, setPaymentType] = useState<PaymentType>("cash");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [cheque, setCheque] = useState({
    bank_account_id: "",
    cheque_number: "",
    cheque_date: todayIso(),
    amount: 0,
  });
  const [lines, setLines] = useState<LineState[]>([emptyLine(nextKey())]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const grandTotal = useMemo(() => lines.reduce((sum, l) => sum + lineTotal(l), 0), [lines]);

  function updateLine(key: string, next: LineState) {
    setLines((prev) => prev.map((l) => (l.key === key ? next : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine(nextKey())]);
  }

  function reset() {
    setSupplier(null);
    setDate(todayIso());
    setPaymentType("cash");
    setReferenceNo("");
    setNotes("");
    setCheque({ bank_account_id: "", cheque_number: "", cheque_date: todayIso(), amount: 0 });
    setLines([emptyLine(nextKey())]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!supplier) {
      setError("Select a supplier.");
      return;
    }
    const validLines = lines.filter((l) => l.item);
    if (validLines.length === 0) {
      setError("Add at least one item.");
      return;
    }

    const supplierName = supplier.name;
    const total = grandTotal;

    startTransition(async () => {
      const result = await createPurchase({
        supplier_id: supplier.id,
        date,
        payment_type: paymentType,
        reference_no: referenceNo,
        notes,
        cheque: paymentType === "cheque" ? cheque : null,
        lines: validLines.map((l) => ({
          item_id: l.item!.id,
          batch_number: l.batchNumber.trim() || null,
          expiry_date: l.expiryDate || null,
          quantity: Number(l.quantity) || 0,
          unit_name: l.unitName || l.item!.base_unit,
          unit_cost: Number(l.unitCost) || 0,
        })),
      });
      if (result?.error) {
        setError(result.error);
      } else if (result?.ok) {
        setSuccessMessage(`Purchase of ${formatCurrency(total)} from ${supplierName} saved.`);
        reset();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {error && (
        <p className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>
      )}
      {successMessage && (
        <p className="rounded-lg bg-success-surface px-3 py-2 text-sm text-success">
          {successMessage}
        </p>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Supplier</label>
        {supplier ? (
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
            <div>
              <p className="font-medium text-foreground">{supplier.name}</p>
              <p className="text-xs text-muted">{supplier.code}</p>
            </div>
            <button
              type="button"
              onClick={() => setSupplier(null)}
              className="text-sm font-medium text-primary"
            >
              Change
            </button>
          </div>
        ) : (
          <TypeAheadSearch
            items={suppliers}
            getId={(s) => s.id}
            getLabel={(s) => s.name}
            getCode={(s) => s.code}
            placeholder="Search supplier by name or code..."
            onSelect={setSupplier}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Reference / Invoice No.
          </label>
          <KeyboardTextInput
            value={referenceNo}
            onChange={setReferenceNo}
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Payment Type</label>
        <div className="grid grid-cols-3 gap-2">
          {(["cash", "credit", "cheque"] as const).map((pt) => (
            <button
              key={pt}
              type="button"
              onClick={() => setPaymentType(pt)}
              className={`flex h-12 items-center justify-center rounded-lg border text-sm font-medium capitalize ${
                paymentType === pt
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-foreground"
              }`}
            >
              {pt}
            </button>
          ))}
        </div>
      </div>

      {paymentType === "cheque" && (
        <ChequeFields bankAccounts={bankAccounts} value={cheque} onChange={setCheque} />
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">Items</label>
          <button
            type="button"
            onClick={addLine}
            className="flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium text-foreground active:bg-background"
          >
            + Add Item
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {lines.map((line) => (
            <PurchaseLineRow
              key={line.key}
              items={items}
              line={line}
              onChange={(next) => updateLine(line.key, next)}
              onRemove={() => removeLine(line.key)}
            />
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Notes</label>
        <KeyboardTextArea
          value={notes}
          onChange={setNotes}
          rows={2}
          className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div className="flex items-center justify-between rounded-lg bg-background px-4 py-3">
        <span className="text-sm font-medium text-muted">Grand Total</span>
        <span className="text-xl font-semibold text-foreground">{formatCurrency(grandTotal)}</span>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save Purchase"}
      </button>
    </form>
  );
}
