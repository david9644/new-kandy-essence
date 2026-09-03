"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/shared/modal";
import { createItem } from "@/app/(app)/items/actions";
import { COMMON_UNITS } from "@/lib/units";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";

interface Category {
  id: string;
  name: string;
}

export interface QuickItem {
  id: string;
  code: string;
  name: string;
  base_unit: string;
  batch_tracked: boolean;
  units: { unit_name: string; conversion_factor_to_base: number }[];
}

// Minimal item capture for "get unblocked and keep entering the purchase" --
// not a replacement for the full Add Item screen, which still handles
// secondary units, reorder level, and starting stock.
export function QuickAddItemModal({
  initialName,
  categories,
  onClose,
  onCreated,
}: {
  initialName: string;
  categories: Category[];
  onClose: () => void;
  onCreated: (item: QuickItem) => void;
}) {
  const [name, setName] = useState(initialName);
  const [categoryId, setCategoryId] = useState("");
  const [baseUnit, setBaseUnit] = useState("");
  const [batchTracked, setBatchTracked] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // This form is rendered through a portal (Modal -> document.body), but
    // React still bubbles its submit event through the React tree -- up
    // into the purchase form this modal was opened from -- unless stopped
    // here. Without this, submitting the modal also fires the outer form's
    // onSubmit with whatever state it happened to have at that instant.
    e.stopPropagation();
    setError(null);
    startTransition(async () => {
      const result = await createItem({
        name,
        category_id: categoryId || null,
        base_unit: baseUnit,
        reorder_level: 0,
        batch_tracked: batchTracked,
        units: [],
      });
      if (result?.error || !result?.id || !result?.code) {
        setError(result?.error ?? "Could not create item.");
        return;
      }
      onCreated({
        id: result.id,
        code: result.code,
        name: name.trim(),
        base_unit: baseUnit,
        batch_tracked: batchTracked,
        units: [],
      });
    });
  }

  return (
    <Modal open onClose={onClose} title="Add Item">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <p className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Name</label>
          <KeyboardTextInput
            value={name}
            onChange={setName}
            required
            autoFocus
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Base Unit</label>
          <select
            value={baseUnit}
            onChange={(e) => setBaseUnit(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 flex-1 items-center justify-center rounded-lg border border-border text-sm font-medium text-foreground active:bg-background"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex h-12 flex-1 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Saving..." : "Add Item"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
