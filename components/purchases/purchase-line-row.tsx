"use client";

import { TypeAheadSearch } from "@/components/shared/type-ahead-search";
import { formatCurrency } from "@/lib/units";

export interface ItemOption {
  id: string;
  code: string;
  name: string;
  base_unit: string;
  batch_tracked: boolean;
  units: { unit_name: string; conversion_factor_to_base: number }[];
}

export interface LineState {
  key: string;
  item: ItemOption | null;
  batchNumber: string;
  expiryDate: string;
  quantity: string;
  unitName: string;
  unitCost: string;
}

export function emptyLine(key: string): LineState {
  return {
    key,
    item: null,
    batchNumber: "",
    expiryDate: "",
    quantity: "",
    unitName: "",
    unitCost: "",
  };
}

export function lineTotal(line: LineState): number {
  const qty = Number(line.quantity) || 0;
  const cost = Number(line.unitCost) || 0;
  return qty * cost;
}

export function PurchaseLineRow({
  items,
  line,
  onChange,
  onRemove,
}: {
  items: ItemOption[];
  line: LineState;
  onChange: (next: LineState) => void;
  onRemove: () => void;
}) {
  if (!line.item) {
    return (
      <div className="rounded-lg border border-border bg-background p-3">
        <TypeAheadSearch
          items={items}
          getId={(i) => i.id}
          getLabel={(i) => i.name}
          getCode={(i) => i.code}
          placeholder="Search item by name or code..."
          onSelect={(item) =>
            onChange({ ...line, item, unitName: item.base_unit })
          }
        />
      </div>
    );
  }

  const unitOptions = [
    { unit_name: line.item.base_unit, conversion_factor_to_base: 1 },
    ...line.item.units,
  ];

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="font-medium text-foreground">{line.item.name}</p>
          <p className="text-xs text-muted">{line.item.code}</p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-danger active:bg-danger-surface"
        >
          ✕
        </button>
      </div>

      {line.item.batch_tracked && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Batch Number</label>
            <input
              value={line.batchNumber}
              onChange={(e) => onChange({ ...line, batchNumber: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Expiry Date</label>
            <input
              type="date"
              value={line.expiryDate}
              onChange={(e) => onChange({ ...line, expiryDate: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Quantity</label>
          <input
            type="text"
            inputMode="decimal"
            value={line.quantity}
            onChange={(e) => {
              if (/^\d*\.?\d*$/.test(e.target.value)) onChange({ ...line, quantity: e.target.value });
            }}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-right text-sm tabular-nums text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Unit</label>
          <select
            value={line.unitName}
            onChange={(e) => onChange({ ...line, unitName: e.target.value })}
            className="w-full rounded-lg border border-border bg-surface px-2 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            {unitOptions.map((u) => (
              <option key={u.unit_name} value={u.unit_name}>
                {u.unit_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Unit Cost</label>
          <input
            type="text"
            inputMode="decimal"
            value={line.unitCost}
            onChange={(e) => {
              if (/^\d*\.?\d*$/.test(e.target.value)) onChange({ ...line, unitCost: e.target.value });
            }}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-right text-sm tabular-nums text-foreground focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      <p className="mt-2 text-right text-sm font-medium text-foreground">
        Line total: {formatCurrency(lineTotal(line))}
      </p>
    </div>
  );
}
