"use client";

import { useState, useTransition } from "react";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";
import { addTillCategory, addTillItem } from "@/app/(app)/billing/actions";
import { COMMON_UNITS } from "@/lib/units";
import type { ShelfCategory, ShelfItem } from "@/lib/till/shelf";
import { TapButton } from "./tap-button";
import { TillDialog } from "./till-dialog";

const FIELD =
  "h-12 w-full rounded-xl border border-border bg-surface px-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

// "+ Add item" on the till (Owner only): the same few fields as the purchase
// screen's quick-add -- name, category, base unit, selling price -- and nothing
// about cost or stock. Sits above the on-screen keyboard like every till dialog.
export function AddItemDialog({
  initialName,
  categories,
  onClose,
  onCreated,
  onCategoryCreated,
}: {
  initialName: string;
  categories: ShelfCategory[];
  onClose: () => void;
  /** The item as the shelf shows it (no stock yet). */
  onCreated: (item: ShelfItem) => void;
  onCategoryCreated: (category: ShelfCategory) => void;
}) {
  const [name, setName] = useState(initialName);
  const [categoryId, setCategoryId] = useState("");
  const [baseUnit, setBaseUnit] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [batchTracked, setBatchTracked] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ready = name.trim() !== "" && baseUnit !== "";

  function submit() {
    if (pending) return;
    if (!name.trim()) return void setError("Type the item's name.");
    if (!baseUnit) return void setError("Choose the unit the item is sold in.");
    const price = salePrice.trim() === "" ? null : Number(salePrice);
    if (price !== null && !(Number.isFinite(price) && price >= 0)) {
      return void setError("The selling price must be empty, zero or more.");
    }
    setError(null);
    startTransition(async () => {
      const result = await addTillItem({
        name,
        category_id: categoryId || null,
        base_unit: baseUnit,
        batch_tracked: batchTracked,
        sale_price: price,
      });
      if ("error" in result || !result.id || !result.code) {
        setError(("error" in result && result.error) || "Could not add the item.");
        return;
      }
      const saved = price !== null && !result.warning ? price : null;
      onCreated({
        id: result.id,
        code: result.code,
        name: name.trim(),
        category_id: categoryId || null,
        base_unit: baseUnit,
        stock: 0,
        sold_90d: 0,
        units: [{ unit_name: baseUnit, factor: 1, price: saved }],
        fresh: true,
      });
    });
  }

  return (
    <>
      <TillDialog
        open
        title="Add item"
        onClose={onClose}
        width="max-w-md"
        closeDisabled={pending}
        footer={
          <TapButton
            onTap={submit}
            disabled={pending || !ready}
            className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#111827] text-lg font-semibold text-white active:opacity-80 disabled:opacity-40"
          >
            {pending ? "Saving..." : "Add item"}
          </TapButton>
        }
      >
        <div className="flex flex-col gap-4">
          {error && (
            <p className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Name</label>
            <KeyboardTextInput value={name} onChange={setName} autoFocus className={FIELD} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Unit</label>
              <select
                value={baseUnit}
                onChange={(e) => setBaseUnit(e.target.value)}
                className={FIELD}
                aria-label="Unit"
              >
                <option value="" disabled>
                  Select unit
                </option>
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                Selling price{baseUnit ? ` per ${baseUnit}` : ""}
              </label>
              <KeyboardNumberInput
                value={salePrice}
                onChange={setSalePrice}
                className={`${FIELD} text-right tabular-nums`}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Category</label>
            <div className="flex gap-2">
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={FIELD}
                aria-label="Category"
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setNewCategory("")}
                className="flex h-12 shrink-0 items-center whitespace-nowrap rounded-xl border border-border px-3 text-sm font-medium text-foreground active:bg-background"
              >
                + New
              </button>
            </div>
          </div>
          <label className="flex min-h-[44px] items-center gap-3 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={batchTracked}
              onChange={(e) => setBatchTracked(e.target.checked)}
              className="h-5 w-5 rounded border-border"
            />
            Track batch number &amp; expiry date
          </label>
          <p className="text-xs text-muted">
            No purchase cost and no stock are added here &mdash; record a purchase or opening stock
            for the item before selling it.
          </p>
        </div>
      </TillDialog>

      {newCategory !== null && (
        <NewCategoryDialog
          onClose={() => setNewCategory(null)}
          onCreated={(c) => {
            onCategoryCreated(c);
            setCategoryId(c.id);
            setNewCategory(null);
          }}
        />
      )}
    </>
  );
}

function NewCategoryDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (category: ShelfCategory) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (pending || !name.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await addTillCategory(name);
      if ("error" in result || !result.id) {
        setError(("error" in result && result.error) || "Could not add the category.");
        return;
      }
      onCreated({ id: result.id, name: name.trim() });
    });
  }

  return (
    <TillDialog
      open
      title="New category"
      onClose={onClose}
      width="max-w-sm"
      closeDisabled={pending}
      footer={
        <TapButton
          onTap={submit}
          disabled={pending || !name.trim()}
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#111827] text-lg font-semibold text-white active:opacity-80 disabled:opacity-40"
        >
          {pending ? "Saving..." : "Add category"}
        </TapButton>
      }
    >
      <div className="flex flex-col gap-3">
        {error && (
          <p className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>
        )}
        <label className="block text-sm font-medium text-foreground">Name</label>
        <KeyboardTextInput value={name} onChange={setName} autoFocus className={FIELD} />
      </div>
    </TillDialog>
  );
}
