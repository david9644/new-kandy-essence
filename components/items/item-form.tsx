"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ItemInput, UnitInput } from "@/app/(app)/items/actions";
import { createOpeningStock } from "@/app/(app)/stock/opening/actions";
import { COMMON_UNITS } from "@/lib/units";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";

interface Category {
  id: string;
  name: string;
}

interface ItemFormProps {
  categories: Category[];
  initial?: {
    name: string;
    category_id: string | null;
    base_unit: string;
    reorder_level: number;
    batch_tracked: boolean;
    units: UnitInput[];
  };
  onSubmit: (input: ItemInput) => Promise<{ error?: string; ok?: boolean; id?: string }>;
  submitLabel: string;
}

// A <select> of common unit names plus an "Other..." escape hatch. Keeping
// this fixed vocabulary is what stops "Kg"/"kg"/"KG" from piling up across
// items -- every other unit select in the app (Purchase, Stock-Out, Opening
// Stock) is driven entirely by whatever gets saved here.
function UnitSelect({
  value,
  onChange,
  required,
  selectClassName,
  inputClassName,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  selectClassName: string;
  inputClassName: string;
}) {
  const isCommon = (COMMON_UNITS as readonly string[]).includes(value);
  const [showOther, setShowOther] = useState(value !== "" && !isCommon);

  return (
    <div className="flex flex-col gap-2">
      <select
        value={showOther ? "__other__" : value}
        onChange={(e) => {
          if (e.target.value === "__other__") {
            setShowOther(true);
            onChange("");
          } else {
            setShowOther(false);
            onChange(e.target.value);
          }
        }}
        required={required}
        className={selectClassName}
      >
        <option value="" disabled>
          Select unit
        </option>
        {COMMON_UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
        <option value="__other__">Other...</option>
      </select>
      {showOther && (
        <KeyboardTextInput
          value={value}
          onChange={onChange}
          placeholder="Enter unit name"
          required={required}
          className={inputClassName}
        />
      )}
    </div>
  );
}

export function ItemForm({ categories, initial, onSubmit, submitLabel }: ItemFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? "");
  const [baseUnit, setBaseUnit] = useState(initial?.base_unit ?? "");
  const [reorderLevel, setReorderLevel] = useState(String(initial?.reorder_level ?? 0));
  const [batchTracked, setBatchTracked] = useState(initial?.batch_tracked ?? true);
  const [units, setUnits] = useState<UnitInput[]>(initial?.units ?? []);
  const [stockQuantity, setStockQuantity] = useState("");
  const [stockCostPrice, setStockCostPrice] = useState("");
  const [stockBatchNumber, setStockBatchNumber] = useState("");
  const [stockExpiryDate, setStockExpiryDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function addUnitRow() {
    setUnits((u) => [...u, { unit_name: "", conversion_factor_to_base: 1 }]);
  }

  function updateUnitRow(index: number, patch: Partial<UnitInput>) {
    setUnits((u) => u.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeUnitRow(index: number) {
    setUnits((u) => u.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const startingQty = Number(stockQuantity) || 0;
    if (!initial && startingQty > 0 && batchTracked && !stockExpiryDate) {
      setError("Enter an expiry date for the starting stock batch, or uncheck batch tracking.");
      return;
    }

    startTransition(async () => {
      const result = await onSubmit({
        name,
        category_id: categoryId || null,
        base_unit: baseUnit,
        reorder_level: Number(reorderLevel) || 0,
        batch_tracked: batchTracked,
        units,
      });

      if (result?.error) {
        setError(result.error);
        return;
      }

      if (!initial) {
        // Create mode: land somewhere useful instead of an inline "Saved."
        // that leaves the user staring at a form they just finished.
        const itemId = result?.id;
        if (itemId && startingQty > 0) {
          const stockResult = await createOpeningStock({
            item_id: itemId,
            batch_number: stockBatchNumber,
            expiry_date: stockExpiryDate,
            quantity: startingQty,
            unit_name: baseUnit,
            cost_price: Number(stockCostPrice) || 0,
            notes: "",
          });
          if (stockResult?.error) {
            // Item exists; don't lose it over a stock-entry failure --
            // send the owner to it with a clear note instead.
            router.push(`/items/${itemId}?stockError=1`);
            return;
          }
        }
        router.push("/items");
        return;
      }

      if (result?.ok) setSaved(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {error && (
        <p className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>
      )}
      {saved && (
        <p className="rounded-lg bg-success-surface px-3 py-2 text-sm text-success">Saved.</p>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Item Name</label>
        <KeyboardTextInput
          value={name}
          onChange={setName}
          required
          className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Category</label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">
          Add new categories from Settings.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Base Unit</label>
          <UnitSelect
            value={baseUnit}
            onChange={setBaseUnit}
            required
            selectClassName="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            inputClassName="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Reorder Level
          </label>
          <KeyboardNumberInput
            value={reorderLevel}
            onChange={setReorderLevel}
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <label className="flex min-h-[44px] items-center gap-3 text-sm font-medium text-foreground">
        <input
          type="checkbox"
          checked={batchTracked}
          onChange={(e) => setBatchTracked(e.target.checked)}
          className="h-5 w-5 rounded border-border"
        />
        Track batch number &amp; expiry date for this item
      </label>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">
            Secondary Units ({baseUnit || "base unit"} is always available)
          </label>
          <button
            type="button"
            onClick={addUnitRow}
            className="flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium text-foreground active:bg-background"
          >
            + Add unit
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {units.map((unit, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
              <UnitSelect
                value={unit.unit_name}
                onChange={(v) => updateUnitRow(i, { unit_name: v })}
                required
                selectClassName="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                inputClassName="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">=</span>
                <KeyboardNumberInput
                  value={String(unit.conversion_factor_to_base)}
                  onChange={(v) =>
                    updateUnitRow(i, {
                      conversion_factor_to_base: v === "" ? 0 : Number(v),
                    })
                  }
                  className="w-20 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                />
                <span className="text-sm text-muted">{baseUnit || "base"}</span>
                <button
                  type="button"
                  onClick={() => removeUnitRow(i)}
                  className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg border border-border text-danger active:bg-danger-surface"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          {units.length === 0 && (
            <p className="text-sm text-muted">
              No secondary units yet -- items can be purchased/stocked in the base unit only.
            </p>
          )}
        </div>
      </div>

      {!initial && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-background p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Starting Stock (optional)</p>
            <p className="text-xs text-muted">
              Add opening quantity for this item now, or skip and use the Opening Stock page
              later.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Quantity</label>
              <KeyboardNumberInput
                value={stockQuantity}
                onChange={setStockQuantity}
                className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-right text-base tabular-nums text-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Cost Price
              </label>
              <KeyboardNumberInput
                value={stockCostPrice}
                onChange={setStockCostPrice}
                className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-right text-base tabular-nums text-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          {batchTracked && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Batch Number
                </label>
                <KeyboardTextInput
                  value={stockBatchNumber}
                  onChange={setStockBatchNumber}
                  className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Expiry Date
                </label>
                <input
                  type="date"
                  value={stockExpiryDate}
                  onChange={(e) => setStockExpiryDate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          )}

          <p className="text-xs text-muted">Quantity is in {baseUnit || "the base unit"}.</p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
