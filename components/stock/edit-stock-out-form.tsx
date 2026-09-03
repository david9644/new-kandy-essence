"use client";

import { useState, useTransition } from "react";
import { updateStockOut } from "@/app/(app)/stock/out/actions";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";

interface UnitOption {
  unit_name: string;
  conversion_factor_to_base: number;
}

export function EditStockOutForm({
  stockOutId,
  unitOptions,
  initial,
}: {
  stockOutId: string;
  unitOptions: UnitOption[];
  initial: { quantity: number; unit_name: string; date: string };
}) {
  const [quantity, setQuantity] = useState(String(initial.quantity));
  const [unitName, setUnitName] = useState(initial.unit_name);
  const [date, setDate] = useState(initial.date);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateStockOut(stockOutId, {
        quantity: Number(quantity) || 0,
        unit_name: unitName,
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

      <div className="grid grid-cols-2 gap-3">
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
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            {unitOptions.map((u) => (
              <option key={u.unit_name} value={u.unit_name}>
                {u.unit_name}
              </option>
            ))}
          </select>
        </div>
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
        disabled={pending}
        className="flex h-11 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
