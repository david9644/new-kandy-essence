"use client";

import { useState, useTransition } from "react";
import { ChequeFields, type BankAccountOption } from "@/components/purchases/cheque-fields";
import { updateSupplierPayment } from "@/app/(app)/payments/actions";
import type { Database } from "@/lib/types/database.types";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";
import { KeyboardTextArea } from "@/components/keyboard/keyboard-textarea";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export function EditPaymentForm({
  paymentId,
  bankAccounts,
  initial,
}: {
  paymentId: string;
  bankAccounts: BankAccountOption[];
  initial: {
    date: string;
    amount: number;
    payment_type: PaymentMethod;
    notes: string;
    cheque: { bank_account_id: string; cheque_number: string; cheque_date: string; amount: number } | null;
  };
}) {
  const [date, setDate] = useState(initial.date);
  const [amount, setAmount] = useState(String(initial.amount));
  const [paymentType, setPaymentType] = useState<PaymentMethod>(initial.payment_type);
  const [cheque, setCheque] = useState(
    initial.cheque ?? { bank_account_id: "", cheque_number: "", cheque_date: initial.date, amount: 0 }
  );
  const [notes, setNotes] = useState(initial.notes);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateSupplierPayment(paymentId, {
        date,
        amount: Number(amount) || 0,
        payment_type: paymentType,
        cheque: paymentType === "cheque" ? { ...cheque, amount: Number(amount) || 0 } : null,
        notes,
      });
      if (result?.error) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      {error && (
        <p className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>
      )}
      {saved && (
        <p className="rounded-lg bg-success-surface px-3 py-2 text-sm text-success">Saved.</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Amount</label>
          <KeyboardNumberInput
            value={amount}
            onChange={setAmount}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-right text-sm tabular-nums text-foreground focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Payment Type</label>
        <div className="grid grid-cols-2 gap-2">
          {(["cash", "cheque"] as const).map((pt) => (
            <button
              key={pt}
              type="button"
              onClick={() => setPaymentType(pt)}
              className={`flex h-11 items-center justify-center rounded-lg border text-sm font-medium capitalize ${
                paymentType === pt
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground"
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
        <label className="mb-1 block text-xs font-medium text-muted">Notes</label>
        <KeyboardTextArea
          value={notes}
          onChange={setNotes}
          rows={2}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex h-11 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
