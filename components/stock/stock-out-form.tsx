"use client";

import { useState, useTransition } from "react";
import { TypeAheadSearch } from "@/components/shared/type-ahead-search";
import { createClient } from "@/lib/supabase/client";
import { createStockOut } from "@/app/(app)/stock/out/actions";
import { sortBatchesFefo, suggestBatch, type FefoBatch } from "@/lib/stock/fefo";
import { formatQuantity } from "@/lib/units";

interface ItemOption {
  id: string;
  code: string;
  name: string;
  base_unit: string;
  batch_tracked: boolean;
  units: { unit_name: string; conversion_factor_to_base: number }[];
}

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
}

function batchLabel(batch: FefoBatch, baseUnit: string): string {
  const parts = [batch.batch_number ?? "No batch #"];
  if (batch.expiry_date) parts.push(`exp ${batch.expiry_date}`);
  parts.push(`${formatQuantity(batch.quantity_remaining)} ${baseUnit} left`);
  return parts.join(" · ");
}

export function StockOutForm({ items }: { items: ItemOption[] }) {
  const [item, setItem] = useState<ItemOption | null>(null);
  const [batches, setBatches] = useState<FefoBatch[]>([]);
  const [batchId, setBatchId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitName, setUnitName] = useState("");
  const [date, setDate] = useState(todayIso());
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  async function selectItem(next: ItemOption) {
    setItem(next);
    setUnitName(next.base_unit);
    setQuantity("");
    setError(null);
    setSuccess(false);
    setNeedsConfirm(false);
    setLoadingBatches(true);

    const supabase = createClient();
    const { data } = await supabase
      .from("stock_batches")
      .select("id, batch_number, expiry_date, quantity_remaining, created_at")
      .eq("item_id", next.id);

    const sorted = sortBatchesFefo(data ?? []);
    setBatches(sorted);
    setBatchId(suggestBatch(sorted)?.id ?? "");
    setLoadingBatches(false);
  }

  function reset() {
    setItem(null);
    setBatches([]);
    setBatchId("");
    setQuantity("");
    setNeedsConfirm(false);
  }

  const totalAvailable = batches.reduce((sum, b) => sum + b.quantity_remaining, 0);
  const unitOptions = item ? [{ unit_name: item.base_unit, conversion_factor_to_base: 1 }, ...item.units] : [];
  const factor = unitOptions.find((u) => u.unit_name === unitName)?.conversion_factor_to_base ?? 1;
  const requestedBaseQty = (Number(quantity) || 0) * factor;
  const overAvailable = requestedBaseQty > totalAvailable;

  function submit() {
    if (!item || !batchId) return;
    if (overAvailable && !needsConfirm) {
      setNeedsConfirm(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createStockOut({
        item_id: item.id,
        stock_batch_id: batchId,
        quantity: Number(quantity) || 0,
        unit_name: unitName,
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
    <div className="flex flex-col gap-5">
      {error && (
        <p className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>
      )}
      {success && (
        <p className="rounded-lg bg-success-surface px-3 py-2 text-sm text-success">
          Stock-out recorded.
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

      {item && loadingBatches && <p className="text-sm text-muted">Loading stock...</p>}

      {item && !loadingBatches && (
        <>
          {batches.length === 0 ? (
            <p className="rounded-lg bg-warning-surface px-3 py-2 text-sm text-warning">
              No stock on hand for this item yet.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted">
                Total on hand: {formatQuantity(totalAvailable)} {item.base_unit}
              </p>

              {item.batch_tracked && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Batch (earliest expiry suggested first)
                  </label>
                  <select
                    value={batchId}
                    onChange={(e) => setBatchId(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none"
                  >
                    {batches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {batchLabel(b, item.base_unit)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Quantity
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={quantity}
                    onChange={(e) => {
                      if (/^\d*\.?\d*$/.test(e.target.value)) {
                        setQuantity(e.target.value);
                        setNeedsConfirm(false);
                      }
                    }}
                    className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-right text-xl font-semibold tabular-nums text-foreground focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Unit</label>
                  <select
                    value={unitName}
                    onChange={(e) => {
                      setUnitName(e.target.value);
                      setNeedsConfirm(false);
                    }}
                    className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none"
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
                <label className="mb-1.5 block text-sm font-medium text-foreground">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              {needsConfirm && overAvailable && (
                <p className="rounded-lg bg-warning-surface px-3 py-2 text-sm text-warning">
                  Only {formatQuantity(totalAvailable)} {item.base_unit} left, you&rsquo;re entering{" "}
                  {formatQuantity(requestedBaseQty)} {item.base_unit}. Tap again to confirm anyway.
                </p>
              )}

              <button
                type="button"
                disabled={pending || !quantity || Number(quantity) <= 0}
                onClick={submit}
                className={`flex h-14 w-full items-center justify-center rounded-xl text-lg font-semibold text-white disabled:opacity-50 ${
                  needsConfirm ? "bg-warning" : "bg-primary"
                }`}
              >
                {pending
                  ? "Saving..."
                  : needsConfirm
                    ? "Confirm & Record Anyway"
                    : "Record Stock-Out"}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
