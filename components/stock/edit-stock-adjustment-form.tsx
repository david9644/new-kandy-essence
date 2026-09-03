"use client";

import { useState, useTransition } from "react";
import { updateStockAdjustment } from "@/app/(app)/stock/adjustments/actions";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";
import { KeyboardTextArea } from "@/components/keyboard/keyboard-textarea";

export function EditStockAdjustmentForm({
  adjustmentId,
  initial,
}: {
  adjustmentId: string;
  initial: { quantity_change: number; reason: string; date: string };
}) {
  const [direction, setDirection] = useState<"increase" | "decrease">(
    initial.quantity_change >= 0 ? "increase" : "decrease"
  );
  const [amount, setAmount] = useState(String(Math.abs(initial.quantity_change)));
  const [reason, setReason] = useState(initial.reason);
  const [date, setDate] = useState(initial.date);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const signed = direction === "increase" ? Number(amount) || 0 : -(Number(amount) || 0);

    startTransition(async () => {
      const result = await updateStockAdjustment(adjustmentId, {
        quantity_change: signed,
        reason,
        date,
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

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Correction</label>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setDirection("increase")}
            className={`flex h-11 items-center justify-center rounded-lg border text-sm font-medium ${
              direction === "increase"
                ? "border-success bg-success-surface text-success"
                : "border-border bg-background text-foreground"
            }`}
          >
            Increase (found stock)
          </button>
          <button
            type="button"
            onClick={() => setDirection("decrease")}
            className={`flex h-11 items-center justify-center rounded-lg border text-sm font-medium ${
              direction === "decrease"
                ? "border-danger bg-danger-surface text-danger"
                : "border-border bg-background text-foreground"
            }`}
          >
            Decrease (damage/loss)
          </button>
        </div>
        <KeyboardNumberInput
          value={amount}
          onChange={setAmount}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-right text-sm tabular-nums text-foreground focus:border-primary focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Reason</label>
        <KeyboardTextArea
          value={reason}
          onChange={setReason}
          rows={2}
          required
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={pending || !amount || Number(amount) <= 0 || !reason.trim()}
        className="flex h-11 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
