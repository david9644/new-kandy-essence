"use client";

import { useState, useTransition } from "react";
import { TypeAheadSearch } from "@/components/shared/type-ahead-search";
import { createOpeningStock } from "@/app/(app)/stock/opening/actions";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";
import { KeyboardTextArea } from "@/components/keyboard/keyboard-textarea";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";

interface ItemOption {
  id: string;
  code: string;
  name: string;
  base_unit: string;
  batch_tracked: boolean;
  units: { unit_name: string; conversion_factor_to_base: number }[];
}

export function OpeningStockForm({ items }: { items: ItemOption[] }) {
  const [item, setItem] = useState<ItemOption | null>(null);
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitName, setUnitName] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function selectItem(next: ItemOption) {
    setItem(next);
    setUnitName(next.base_unit);
    setError(null);
    setSuccess(false);
  }

  function reset() {
    setItem(null);
    setBatchNumber("");
    setExpiryDate("");
    setQuantity("");
    setCostPrice("");
    setNotes("");
  }

  const unitOptions = item ? [{ unit_name: item.base_unit, conversion_factor_to_base: 1 }, ...item.units] : [];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    setError(null);
    startTransition(async () => {
      const result = await createOpeningStock({
        item_id: item.id,
        batch_number: batchNumber,
        expiry_date: expiryDate,
        quantity: Number(quantity) || 0,
        unit_name: unitName,
        cost_price: Number(costPrice) || 0,
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
          Opening stock recorded. No purchase or supplier balance was affected.
        </p>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Item</label>
        {item ? (
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
            <div>
              <p className="font-medium text-foreground">{item.name}</p>
              <p className="text-xs text-muted">{item.code}</p>
            </div>
            <button type="button" onClick={reset} className="text-sm font-medium text-primary">
              Change
            </button>
          </div>
        ) : (
          <TypeAheadSearch
            items={items}
            getId={(i) => i.id}
            getLabel={(i) => i.name}
            getCode={(i) => i.code}
            placeholder="Search item by name or code..."
            onSelect={selectItem}
            autoFocus
          />
        )}
      </div>

      {item && (
        <>
          {item.batch_tracked && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Batch Number
                </label>
                <KeyboardTextInput
                  value={batchNumber}
                  onChange={setBatchNumber}
                  className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Expiry Date
                </label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  required
                  className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Quantity</label>
              <KeyboardNumberInput
                value={quantity}
                onChange={setQuantity}
                className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-right text-base tabular-nums text-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Unit</label>
              <select
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-2 py-3 text-base text-foreground focus:border-primary focus:outline-none"
              >
                {unitOptions.map((u) => (
                  <option key={u.unit_name} value={u.unit_name}>
                    {u.unit_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Cost Price
              </label>
              <KeyboardNumberInput
                value={costPrice}
                onChange={setCostPrice}
                className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-right text-base tabular-nums text-foreground focus:border-primary focus:outline-none"
              />
            </div>
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
            disabled={pending || !quantity || Number(quantity) <= 0}
            className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Saving..." : "Save Opening Stock"}
          </button>
        </>
      )}
    </form>
  );
}
