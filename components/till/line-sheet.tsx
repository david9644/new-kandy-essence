"use client";

import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";
import { TapButton } from "./tap-button";
import { TillDialog } from "./till-dialog";
import { formatRs } from "@/lib/till/format";
import { fromCents, grossCents, num, toCents } from "@/lib/billing";
import { lineIsFree, lineMissingPrice, type DraftLine } from "@/lib/till/bill";
import type { ShelfItem } from "@/lib/till/shelf";

const FIELD =
  "h-12 w-full rounded-xl border border-border bg-surface px-3 text-right text-lg tabular-nums text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

// One bill line, opened by tapping it: exact quantity, price, discount, unit.
export function LineSheet({
  line,
  item,
  itemName,
  warn,
  onPatch,
  onUnit,
  onRemove,
  onClose,
}: {
  line: DraftLine | null;
  item: ShelfItem | undefined;
  itemName: string;
  warn: string | null;
  onPatch: (key: string, patch: Partial<DraftLine>) => void;
  onUnit: (key: string, unitName: string) => void;
  onRemove: (key: string) => void;
  onClose: () => void;
}) {
  if (!line) return null;
  const units = item?.units ?? [];
  const lineTotalC = grossCents(num(line.quantity), num(line.unitPrice)) - toCents(num(line.discount));
  const missing = lineMissingPrice(line);

  return (
    <TillDialog
      open
      title={itemName}
      onClose={onClose}
      width="max-w-md"
      footer={
        <div className="flex gap-2">
          <TapButton
            onTap={() => {
              onRemove(line.key);
              onClose();
            }}
            className="flex h-14 flex-1 items-center justify-center rounded-xl border border-danger/40 text-base font-medium text-danger active:bg-danger-surface"
          >
            Remove line
          </TapButton>
          <TapButton
            onTap={onClose}
            className="flex h-14 flex-[2] items-center justify-center rounded-xl bg-[#111827] text-base font-semibold text-white active:opacity-80"
          >
            Done
          </TapButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {units.length > 1 && (
          <div>
            <p className="mb-1 text-xs text-muted">Unit</p>
            <div className="flex flex-wrap gap-2">
              {units.map((u) => (
                <button
                  key={u.unit_name}
                  type="button"
                  onClick={() => onUnit(line.key, u.unit_name)}
                  className={`h-11 rounded-xl border px-4 text-sm font-medium ${
                    u.unit_name === line.unitName
                      ? "border-[#111827] bg-[#111827] text-white"
                      : "border-border bg-surface text-foreground"
                  }`}
                >
                  {u.unit_name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs text-muted">Quantity</label>
          <KeyboardNumberInput
            value={line.quantity}
            onChange={(v) => onPatch(line.key, { quantity: v })}
            className={FIELD}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted">
            Price for one {line.unitName} (Rs)
          </label>
          <KeyboardNumberInput
            value={line.unitPrice}
            onChange={(v) => onPatch(line.key, { unitPrice: v })}
            autoFocus={missing}
            className={FIELD}
          />
          {missing && (
            <p className="mt-1 text-xs font-medium text-danger">Type the price to continue.</p>
          )}
          {lineIsFree(line) && (
            <p className="mt-1 text-xs font-medium text-warning">
              Price is 0, so this line is free. That is allowed.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted">Discount on this line (Rs)</label>
          <KeyboardNumberInput
            value={line.discount}
            onChange={(v) => onPatch(line.key, { discount: v })}
            className={FIELD}
          />
        </div>

        <div className="flex items-center justify-between rounded-xl bg-background px-4 py-3">
          <span className="text-sm text-muted">Line total</span>
          <span className="text-xl font-semibold tabular-nums text-foreground">
            {formatRs(fromCents(lineTotalC))}
          </span>
        </div>

        {warn && <p className="text-sm font-medium text-warning">{warn}</p>}
      </div>
    </TillDialog>
  );
}
