"use client";

import { useState, useTransition } from "react";
import { TypeAheadSearch } from "@/components/shared/type-ahead-search";
import { ChequeFields, type BankAccountOption } from "@/components/purchases/cheque-fields";
import { createSupplierPayment } from "@/app/(app)/payments/actions";
import type { Database } from "@/lib/types/database.types";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";
import { KeyboardTextArea } from "@/components/keyboard/keyboard-textarea";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

interface SupplierOption {
  id: string;
  code: string;
  name: string;
}

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
}

export function PaymentForm({
  suppliers,
  bankAccounts,
  lockedSupplier,
}: {
  suppliers?: SupplierOption[];
  bankAccounts: BankAccountOption[];
  /** When set, the supplier is fixed (shown as plain text, no search) and
   * every reset keeps it locked -- used when this form is opened from a
   * specific supplier's own ledger page rather than the general flow. */
  lockedSupplier?: SupplierOption;
}) {
  const [supplier, setSupplier] = useState<SupplierOption | null>(lockedSupplier ?? null);
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentMethod>("cash");
  const [cheque, setCheque] = useState({
    bank_account_id: "",
    cheque_number: "",
    cheque_date: todayIso(),
    amount: 0,
  });
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    setSupplier(lockedSupplier ?? null);
    setAmount("");
    setNotes("");
    setPaymentType("cash");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplier) {
      setError("Select a supplier.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createSupplierPayment({
        supplier_id: supplier.id,
        date,
        amount: Number(amount) || 0,
        payment_type: paymentType,
        cheque: paymentType === "cheque" ? { ...cheque, amount: Number(amount) || 0 } : null,
        notes,
      });
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        reset();
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {error && (
        <p className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>
      )}
      {success && (
        <p className="rounded-lg bg-success-surface px-3 py-2 text-sm text-success">
          Payment recorded.
        </p>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Supplier</label>
        {lockedSupplier ? (
          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <p className="font-medium text-foreground">{lockedSupplier.name}</p>
            <p className="text-xs text-muted">{lockedSupplier.code}</p>
          </div>
        ) : supplier ? (
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
            items={suppliers ?? []}
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
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Amount</label>
          <KeyboardNumberInput
            value={amount}
            onChange={setAmount}
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-right text-base tabular-nums text-foreground focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Payment Type</label>
        <div className="grid grid-cols-2 gap-2">
          {(["cash", "cheque"] as const).map((pt) => (
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
        <label className="mb-1.5 block text-sm font-medium text-foreground">Notes</label>
        <KeyboardTextArea
          value={notes}
          onChange={setNotes}
          rows={2}
          className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={pending || !amount || Number(amount) <= 0}
        className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save Payment"}
      </button>
    </form>
  );
}
