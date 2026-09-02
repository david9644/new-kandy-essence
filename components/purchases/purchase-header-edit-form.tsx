"use client";

import { useState, useTransition } from "react";
import { updatePurchaseHeader } from "@/app/(app)/purchases/actions";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";
import { KeyboardTextArea } from "@/components/keyboard/keyboard-textarea";

export function PurchaseHeaderEditForm({
  purchaseId,
  initial,
}: {
  purchaseId: string;
  initial: { date: string; reference_no: string; notes: string };
}) {
  const [date, setDate] = useState(initial.date);
  const [referenceNo, setReferenceNo] = useState(initial.reference_no);
  const [notes, setNotes] = useState(initial.notes);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updatePurchaseHeader(purchaseId, { date, reference_no: referenceNo, notes });
      if (result?.error) setError(result.error);
      else setSaved(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      {error && <p className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}
      {saved && <p className="rounded-lg bg-success-surface px-3 py-2 text-sm text-success">Saved.</p>}
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
          <label className="mb-1 block text-xs font-medium text-muted">Reference No.</label>
          <KeyboardTextInput
            value={referenceNo}
            onChange={setReferenceNo}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </div>
      </div>
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
