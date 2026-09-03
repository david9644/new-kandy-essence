"use client";

import { useState, useTransition } from "react";
import { updateOpeningStock } from "@/app/(app)/stock/opening/actions";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";
import { KeyboardTextArea } from "@/components/keyboard/keyboard-textarea";

interface UnitOption {
  unit_name: string;
  conversion_factor_to_base: number;
}

export function EditOpeningStockForm({
  entryId,
  unitOptions,
  batchTracked,
  initial,
}: {
  entryId: string;
  unitOptions: UnitOption[];
  batchTracked: boolean;
  initial: {
    batch_number: string;
    expiry_date: string;
    quantity: number;
    unit_name: string;
    cost_price: number;
    notes: string;
  };
}) {
  const [batchNumber, setBatchNumber] = useState(initial.batch_number);
  const [expiryDate, setExpiryDate] = useState(initial.expiry_date);
  const [quantity, setQuantity] = useState(String(initial.quantity));
  const [unitName, setUnitName] = useState(initial.unit_name);
  const [costPrice, setCostPrice] = useState(String(initial.cost_price));
  const [notes, setNotes] = useState(initial.notes);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (batchTracked && !expiryDate) {
      setError("Expiry date is required for this item.");
      return;
    }

    startTransition(async () => {
      const result = await updateOpeningStock(entryId, {
        batch_number: batchNumber,
        expiry_date: expiryDate,
        quantity: Number(quantity) || 0,
        unit_name: unitName,
        cost_price: Number(costPrice) || 0,
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

      {batchTracked && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Batch Number</label>
            <KeyboardTextInput
              value={batchNumber}
              onChange={setBatchNumber}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Expiry Date</label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Quantity</label>
          <KeyboardNumberInput
            value={quantity}
            onChange={setQuantity}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-right text-sm tabular-nums text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Unit</label>
          <select
            value={unitName}
            onChange={(e) => setUnitName(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-2 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            {unitOptions.map((u) => (
              <option key={u.unit_name} value={u.unit_name}>
                {u.unit_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Cost Price</label>
          <KeyboardNumberInput
            value={costPrice}
            onChange={setCostPrice}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-right text-sm tabular-nums text-foreground focus:border-primary focus:outline-none"
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
