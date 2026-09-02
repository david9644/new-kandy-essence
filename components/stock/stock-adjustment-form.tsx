"use client";

import { useState, useTransition } from "react";
import { TypeAheadSearch } from "@/components/shared/type-ahead-search";
import { createClient } from "@/lib/supabase/client";
import { createStockAdjustment } from "@/app/(app)/stock/adjustments/actions";
import { formatQuantity } from "@/lib/units";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";
import { KeyboardTextArea } from "@/components/keyboard/keyboard-textarea";

interface ItemOption {
  id: string;
  code: string;
  name: string;
  base_unit: string;
}

interface Batch {
  id: string;
  batch_number: string | null;
  expiry_date: string | null;
  quantity_remaining: number;
}

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
}

export function StockAdjustmentForm({ items }: { items: ItemOption[] }) {
  const [item, setItem] = useState<ItemOption | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState("");
  const [direction, setDirection] = useState<"increase" | "decrease">("decrease");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(todayIso());
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  async function selectItem(next: ItemOption) {
    setItem(next);
    setError(null);
    setSuccess(false);
    setLoadingBatches(true);

    const supabase = createClient();
    const { data } = await supabase
      .from("stock_batches")
      .select("id, batch_number, expiry_date, quantity_remaining")
      .eq("item_id", next.id)
      .order("created_at");

    setBatches(data ?? []);
    setBatchId(data?.[0]?.id ?? "");
    setLoadingBatches(false);
  }

  function reset() {
    setItem(null);
    setBatches([]);
    setBatchId("");
    setAmount("");
    setReason("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    setError(null);
    const signed = direction === "increase" ? Number(amount) || 0 : -(Number(amount) || 0);
    startTransition(async () => {
      const result = await createStockAdjustment({
        item_id: item.id,
        stock_batch_id: batchId,
        quantity_change: signed,
        reason,
        date,
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
          Adjustment recorded.
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

      {item && loadingBatches && <p className="text-sm text-muted">Loading batches...</p>}

      {item && !loadingBatches && batches.length === 0 && (
        <p className="rounded-lg bg-warning-surface px-3 py-2 text-sm text-warning">
          No batches exist for this item yet -- use Opening Stock to create one first.
        </p>
      )}

      {item && batches.length > 0 && (
        <>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Batch</label>
            <select
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none"
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_number ?? "No batch #"}
                  {b.expiry_date ? ` · exp ${b.expiry_date}` : ""} ·{" "}
                  {formatQuantity(b.quantity_remaining)} {item.base_unit} on hand
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Correction
            </label>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection("increase")}
                className={`flex h-11 items-center justify-center rounded-lg border text-sm font-medium ${
                  direction === "increase"
                    ? "border-success bg-success-surface text-success"
                    : "border-border bg-surface text-foreground"
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
                    : "border-border bg-surface text-foreground"
                }`}
              >
                Decrease (damage/loss)
              </button>
            </div>
            <KeyboardNumberInput
              value={amount}
              onChange={setAmount}
              placeholder={`Quantity in ${item.base_unit}`}
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-right text-xl font-semibold tabular-nums text-foreground focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Reason</label>
            <KeyboardTextArea
              value={reason}
              onChange={setReason}
              rows={2}
              required
              placeholder="e.g. damaged during handling, miscount during transition"
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={pending || !amount || Number(amount) <= 0 || !reason.trim()}
            className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Saving..." : "Save Adjustment"}
          </button>
        </>
      )}
    </form>
  );
}
