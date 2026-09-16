"use client";

import { useState, useTransition } from "react";
import type { SalaryPaymentInput } from "@/app/(app)/workers/actions";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";
import { KeyboardTextArea } from "@/components/keyboard/keyboard-textarea";

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
}

interface SalaryPaymentFormProps {
  initial?: SalaryPaymentInput;
  onSubmit: (input: SalaryPaymentInput) => Promise<{ error?: string; ok?: boolean }>;
  submitLabel: string;
  successMessage: string;
}

// Shared by Record Payment / Edit Payment, mirroring how TransactionForm is
// reused for the customer feature's Add Credit / Record Payment / edit.
export function SalaryPaymentForm({
  initial,
  onSubmit,
  submitLabel,
  successMessage,
}: SalaryPaymentFormProps) {
  const [date, setDate] = useState(initial?.date ?? todayIso());
  const [period, setPeriod] = useState(initial?.period ?? "");
  const [amount, setAmount] = useState(String(initial?.amount ?? ""));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setDate(todayIso());
    setPeriod("");
    setAmount("");
    setNotes("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await onSubmit({
        date,
        period,
        amount: Number(amount) || 0,
        notes,
      });
      if (result?.error) {
        setError(result.error);
      } else if (!initial) {
        setSuccess(successMessage);
        reset();
      } else if (result?.ok) {
        setSuccess("Saved.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {error && (
        <p className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>
      )}
      {success && (
        <p className="rounded-lg bg-success-surface px-3 py-2 text-sm text-success">{success}</p>
      )}

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
        <label className="mb-1.5 block text-sm font-medium text-foreground">Period</label>
        <KeyboardTextInput
          value={period}
          onChange={setPeriod}
          placeholder="e.g. September 2026"
          className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

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
        {pending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
