"use client";

import { useState, useTransition } from "react";
import { TypeAheadSearch } from "@/components/shared/type-ahead-search";
import { createClient } from "@/lib/supabase/client";
import { createStockOut } from "@/app/(app)/stock/out/actions";
import { formatQuantity } from "@/lib/units";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";

interface ItemOption {
  id: string;
  code: string;
  name: string;
  base_unit: string;
  units: { unit_name: string; conversion_factor_to_base: number }[];
}

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
}

// Batch selection is fully automatic (server-side FEFO in create_stock_out) --
// this form only needs the item's total on-hand quantity to show the running
// total and drive the over-quantity warning, not the individual batches.
export function StockOutForm({ items }: { items: ItemOption[] }) {
  const [item, setItem] = useState<ItemOption | null>(null);
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [loadingTotal, setLoadingTotal] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [unitName, setUnitName] = useState("");
  const [date, setDate] = useState(todayIso());
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
    setLoadingTotal(true);

    const supabase = createClient();
    const { data } = await supabase
      .from("item_stock_summary")
      .select("total_quantity")
      .eq("item_id", next.id)
      .maybeSingle();

    setTotalAvailable(data?.total_quantity ?? 0);
    setLoadingTotal(false);
  }

  function reset() {
    setItem(null);
    setTotalAvailable(0);
    setQuantity("");
    setNeedsConfirm(false);
  }

  const unitOptions = item ? [{ unit_name: item.base_unit, conversion_factor_to_base: 1 }, ...item.units] : [];
  const factor = unitOptions.find((u) => u.unit_name === unitName)?.conversion_factor_to_base ?? 1;
  const requestedBaseQty = (Number(quantity) || 0) * factor;
  const overAvailable = requestedBaseQty > totalAvailable;

  function submit() {
    if (!item) return;
    if (overAvailable && !needsConfirm) {
      setNeedsConfirm(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createStockOut({
        item_id: item.id,
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

      {item && loadingTotal && <p className="text-sm text-muted">Loading stock...</p>}

      {item && !loadingTotal && (
        <>
          {totalAvailable <= 0 ? (
            <p className="rounded-lg bg-warning-surface px-3 py-2 text-sm text-warning">
              No stock on hand for this item yet.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted">
                Total on hand: {formatQuantity(totalAvailable)} {item.base_unit}
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Quantity
                  </label>
                  <KeyboardNumberInput
                    value={quantity}
                    onChange={(v) => {
                      setQuantity(v);
                      setNeedsConfirm(false);
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
                  needsConfirm ? "bg-warning" : "bg-accent-stock"
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
