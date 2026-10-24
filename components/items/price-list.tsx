"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";
import { setItemSalePrice } from "@/app/(app)/items/actions";

export interface PriceRowData {
  id: string;
  code: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
  base_unit: string;
  sale_price: number | null;
  last_received: string | null;
}

interface FilterState {
  q: string;
  cat: string;
  nop: boolean;
  sort: string;
}

function hrefFor(state: FilterState, page: number): string {
  const p = new URLSearchParams();
  if (state.q) p.set("q", state.q);
  if (state.cat) p.set("cat", state.cat);
  if (state.nop) p.set("nop", "1");
  if (state.sort !== "name") p.set("sort", state.sort);
  if (page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `/items/prices?${s}` : "/items/prices";
}

const SORT_LABELS: Record<string, string> = {
  name: "Name",
  code: "Code",
  category: "Category",
  recent: "Recently received",
};

export function PriceList({
  rows,
  total,
  page,
  pageSize,
  categories,
  state,
}: {
  rows: PriceRowData[];
  total: number;
  page: number;
  pageSize: number;
  categories: { id: string; name: string }[];
  state: FilterState;
}) {
  const router = useRouter();
  const [text, setText] = useState(state.q);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  function go(patch: Partial<FilterState>) {
    router.push(hrefFor({ ...state, ...patch }, 1));
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <form
          className="flex min-w-[16rem] flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: text.trim() });
          }}
        >
          <KeyboardTextInput
            value={text}
            onChange={setText}
            placeholder="Search by name or code..."
            className="h-12 w-full rounded-lg border border-border bg-surface px-4 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="submit"
            className="h-12 shrink-0 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground"
          >
            Search
          </button>
        </form>
        <select
          value={state.cat}
          onChange={(e) => go({ cat: e.target.value })}
          aria-label="Category"
          className="h-12 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={state.sort}
          onChange={(e) => go({ sort: e.target.value })}
          aria-label="Sort by"
          className="h-12 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
        >
          {Object.entries(SORT_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              Sort: {label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => go({ nop: !state.nop })}
          aria-pressed={state.nop}
          className={`h-12 rounded-lg border px-4 text-sm font-medium ${
            state.nop
              ? "border-[#111827] bg-[#111827] text-white"
              : "border-border bg-surface text-foreground"
          }`}
        >
          No price yet
        </button>
        {(state.q || state.cat || state.nop || state.sort !== "name") && (
          <Link
            href="/items/prices"
            className="flex h-12 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground"
          >
            Clear
          </Link>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-background text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-3">Code</th>
              <th className="px-3 py-3">Name</th>
              <th className="px-3 py-3">Category</th>
              <th className="px-3 py-3">Unit</th>
              <th className="px-3 py-3">Selling price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <PriceRow key={r.id} row={r} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  {state.nop ? "Every matching item has a price." : "No items found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-muted">
        <span>
          {total} {total === 1 ? "item" : "items"} &middot; page {Math.min(page, pages)} of {pages}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={hrefFor(state, page - 1)}
              className="flex h-11 items-center rounded-lg border border-border px-4 font-medium text-foreground"
            >
              &larr; Previous
            </Link>
          )}
          {page < pages && (
            <Link
              href={hrefFor(state, page + 1)}
              className="flex h-11 items-center rounded-lg border border-border px-4 font-medium text-foreground"
            >
              Next &rarr;
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// One item's price. Saving touches only this item (set_item_sale_price).
function PriceRow({ row }: { row: PriceRowData }) {
  const [saved, setSaved] = useState<number | null>(row.sale_price);
  const [value, setValue] = useState(row.sale_price != null ? String(row.sale_price) : "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const parsed = value.trim() === "" ? null : Number(value);
  const dirty = parsed !== saved && !(parsed === null && saved === null);
  const invalid = parsed !== null && !(Number.isFinite(parsed) && parsed >= 0);

  function save() {
    if (!dirty || invalid || pending) return;
    setMessage(null);
    startTransition(async () => {
      const result = await setItemSalePrice(row.id, parsed, "price list");
      if ("error" in result) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      setSaved(parsed);
      setMessage({ ok: true, text: parsed === null ? "Price removed" : "Saved" });
    });
  }

  return (
    <tr className="border-t border-border align-middle">
      <td className="px-3 py-2 font-medium text-foreground">{row.code}</td>
      <td className="px-3 py-2 text-foreground">{row.name}</td>
      <td className="px-3 py-2 text-muted">{row.category_name ?? "-"}</td>
      <td className="px-3 py-2 text-muted">{row.base_unit}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="w-32">
            <KeyboardNumberInput
              value={value}
              onChange={(v) => {
                setValue(v);
                setMessage(null);
              }}
              placeholder="No price"
              aria-label={`Selling price for ${row.name}`}
              className={`h-11 w-full rounded-lg border bg-surface px-3 text-right text-base tabular-nums text-foreground focus:border-primary focus:outline-none ${
                saved === null && !dirty ? "border-dashed border-primary/60" : "border-border"
              }`}
            />
          </div>
          <button
            type="button"
            onClick={save}
            // The on-screen pad closes on an outside tap and moves the row: keep a
            // mouse press tied to this button so the click still lands (touch does so itself).
            onPointerDown={(e) => {
              if (e.pointerType !== "mouse") return;
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                /* fall back to the ordinary click */
              }
            }}
            disabled={!dirty || invalid || pending}
            className="h-11 min-w-[4.5rem] rounded-lg bg-[#111827] px-4 text-sm font-semibold text-white disabled:opacity-30"
          >
            {pending ? "..." : "Save"}
          </button>
          {saved === null && !message && (
            <span className="rounded-full bg-warning-surface px-2 py-1 text-xs font-medium text-warning">
              No price yet
            </span>
          )}
          {message && (
            <span className={`text-xs font-medium ${message.ok ? "text-success" : "text-danger"}`}>
              {message.text}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
