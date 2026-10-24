"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";
import { formatQuantity } from "@/lib/units";
import { formatRs } from "@/lib/till/format";
import {
  ALL_CATEGORY,
  OTHER_CATEGORY,
  categoryHue,
  TILE_PAGE_SIZE,
  exactCodeIndexed,
  filterByCategory,
  hasMissingPrice,
  indexItems,
  pageOf,
  searchIndexed,
  suggestionsIndexed,
  type ShelfCategory,
  type ShelfItem,
  type ShelfUnit,
} from "@/lib/till/shelf";

// Soft tint + thin border of the same hue, mixed into the page surface so the
// text stays dark and readable on every colour. Uncategorised items are plain.
function tileStyle(hue: number | null): React.CSSProperties {
  if (hue === null) return { background: "var(--surface)", borderColor: "var(--border)" };
  const base = `hsl(${hue} 80% 52%)`;
  return {
    background: `color-mix(in srgb, ${base} 13%, var(--surface))`,
    borderColor: `color-mix(in srgb, ${base} 32%, var(--surface))`,
  };
}

function fallbackUnit(item: ShelfItem): ShelfUnit {
  return { unit_name: item.base_unit, factor: 1, price: null };
}

function PriceText({ unit, strong }: { unit: ShelfUnit; strong?: boolean }) {
  if (unit.price === null) {
    return (
      <span className="inline-flex items-center rounded-full border border-dashed border-primary/50 bg-white/70 px-2 py-0.5 text-xs font-medium text-primary">
        + Set price
      </span>
    );
  }
  return (
    <span className={`text-sm tabular-nums ${strong ? "font-medium text-foreground" : "text-muted"}`}>
      {formatRs(unit.price)}
    </span>
  );
}

const ItemTile = memo(function ItemTile({
  item,
  onPick,
}: {
  item: ShelfItem;
  onPick: (item: ShelfItem, unit: ShelfUnit) => void;
}) {
  const units = item.units.length ? item.units : [fallbackUnit(item)];
  const style = tileStyle(categoryHue(item.category_id));
  const out = item.stock <= 0;
  const stockText = out ? "Out of stock" : `${formatQuantity(item.stock)} ${item.base_unit}`;

  if (units.length === 1) {
    return (
      <button
        type="button"
        onClick={() => onPick(item, units[0])}
        style={style}
        className={`flex min-h-[112px] flex-col justify-between rounded-2xl border p-3 text-left transition-transform active:scale-[0.98] ${out ? "opacity-60" : ""}`}
      >
        <span className="line-clamp-2 text-[15px] font-medium leading-snug text-foreground">
          {item.name}
        </span>
        <span className="flex items-end justify-between gap-2">
          <PriceText unit={units[0]} />
          <span className={`text-[11px] ${out ? "font-medium text-danger" : "text-muted"}`}>
            {stockText}
          </span>
        </span>
      </button>
    );
  }

  return (
    <div
      style={style}
      className={`col-span-2 flex min-h-[112px] flex-col justify-between gap-2 rounded-2xl border p-3 ${out ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-[15px] font-medium leading-snug text-foreground">
          {item.name}
        </span>
        <span className={`shrink-0 text-[11px] ${out ? "font-medium text-danger" : "text-muted"}`}>
          {stockText}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {units.map((u) => (
          <button
            key={u.unit_name}
            type="button"
            onClick={() => onPick(item, u)}
            className="flex min-h-[44px] min-w-[80px] flex-1 flex-col items-center justify-center rounded-xl border border-border bg-white px-2 py-1 transition-transform active:scale-[0.97]"
          >
            <span className="text-xs font-semibold text-foreground">{u.unit_name}</span>
            <PriceText unit={u} strong />
          </button>
        ))}
      </div>
    </div>
  );
});

export const ShelfPanel = memo(function ShelfPanel({
  categories,
  items,
  onPick,
  locked,
}: {
  categories: ShelfCategory[];
  items: ShelfItem[];
  onPick: (item: ShelfItem, unit: ShelfUnit) => void;
  locked: boolean;
}) {
  const [category, setCategory] = useState<string>(ALL_CATEGORY);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  // How many tiles are drawn: one page, then "Show more" adds another.
  const [shown, setShown] = useState(TILE_PAGE_SIZE);
  // What the suggestions are computed from: the typed text, a moment later,
  // so fast typing on a big shelf never searches on every keystroke.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query), 120);
    return () => window.clearTimeout(t);
  }, [query]);

  // names/codes lower-cased once per shelf, not once per keystroke
  const index = useMemo(() => indexItems(items), [items]);

  const hasOther = useMemo(() => items.some((i) => i.category_id === null), [items]);
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );

  const matching = useMemo(
    () => (submitted !== null ? searchIndexed(index, submitted, 500) : filterByCategory(items, category)),
    [index, items, category, submitted]
  );
  const { visible, remaining } = useMemo(() => pageOf(matching, shown), [matching, shown]);
  const suggestions = useMemo(() => suggestionsIndexed(index, debounced), [index, debounced]);
  const showHint = useMemo(() => visible.some(hasMissingPrice), [visible]);

  function pickSuggestion(item: ShelfItem) {
    onPick(item, item.units[0] ?? fallbackUnit(item));
    setQuery("");
    setSubmitted(null);
    setSuggestOpen(false);
  }

  function find() {
    setSuggestOpen(false);
    const q = query.trim();
    setSubmitted(q === "" ? null : q);
    setShown(TILE_PAGE_SIZE);
  }

  function enter() {
    // Enter is a scan only when the text is exactly an item code; anything else
    // is just "Find" (never a silent pick of the first suggestion).
    const hit = exactCodeIndexed(index, query);
    if (hit) pickSuggestion(hit);
    else find();
  }

  function chooseCategory(id: string) {
    setCategory(id);
    setSubmitted(null);
    setQuery("");
    setSuggestOpen(false);
    setShown(TILE_PAGE_SIZE);
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-3 ${locked ? "pointer-events-none opacity-60" : ""}`}>
      <div className="relative z-20 rounded-2xl border border-border bg-surface p-3">
        <div className="flex gap-2">
          <KeyboardTextInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setSuggestOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                enter();
              }
            }}
            placeholder="Search name or code"
            aria-label="Search items"
            className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="button"
            onClick={find}
            className="h-12 shrink-0 rounded-xl bg-[#111827] px-6 text-base font-semibold text-white active:opacity-80"
          >
            Find
          </button>
        </div>

        {suggestOpen && suggestions.length > 0 && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setSuggestOpen(false)} />
            <div className="absolute inset-x-3 top-[calc(100%-4px)] z-20 max-h-72 overflow-y-auto rounded-xl border border-border bg-surface shadow-lg">
              {suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => pickSuggestion(item)}
                  className="flex min-h-[48px] w-full items-center justify-between gap-3 border-b border-border px-4 py-2 text-left last:border-b-0 active:bg-background"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-base font-medium text-foreground">
                      {item.name}
                    </span>
                    <span className="block text-xs text-muted">{item.code}</span>
                  </span>
                  <span className="shrink-0">
                    <PriceText unit={item.units[0] ?? fallbackUnit(item)} />
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="-mx-1 flex shrink-0 gap-2 overflow-x-auto px-1 pb-1">
        <Chip
          label="All"
          active={submitted === null && category === ALL_CATEGORY}
          onClick={() => chooseCategory(ALL_CATEGORY)}
        />
        {sortedCategories.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            hue={categoryHue(c.id)}
            active={submitted === null && category === c.id}
            onClick={() => chooseCategory(c.id)}
          />
        ))}
        {hasOther && (
          <Chip
            label="Other"
            active={submitted === null && category === OTHER_CATEGORY}
            onClick={() => chooseCategory(OTHER_CATEGORY)}
          />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {submitted !== null && (
          <p className="mb-2 text-sm text-muted">
            {matching.length} {matching.length === 1 ? "result" : "results"} for &lsquo;{submitted}
            &rsquo; &middot; pick a category above to see the grid again.
          </p>
        )}
        {showHint && (
          <p className="mb-2 text-xs text-muted">
            Tiles marked &lsquo;Set price&rsquo; have no price yet &mdash; tap one and type the price
            for this bill, or set it for good in Items &rarr; Price list.
          </p>
        )}
        {matching.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
            {submitted !== null ? "No items match that search." : "No items in this category."}
          </p>
        ) : (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gridAutoFlow: "dense" }}
          >
            {visible.map((item) => (
              <ItemTile key={item.id} item={item} onPick={onPick} />
            ))}
          </div>
        )}
        {remaining > 0 && (
          <button
            type="button"
            onClick={() => setShown((n) => n + TILE_PAGE_SIZE)}
            className="mt-3 flex h-12 w-full items-center justify-center rounded-xl border border-border bg-surface text-sm font-medium text-foreground active:bg-background"
          >
            Show more ({remaining} more)
          </button>
        )}
      </div>
    </div>
  );
});

function Chip({
  label,
  active,
  hue,
  onClick,
}: {
  label: string;
  active: boolean;
  hue?: number | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors ${
        active
          ? "border-[#111827] bg-[#111827] text-white"
          : "border-border bg-surface text-foreground active:bg-background"
      }`}
    >
      {hue != null && (
        <span
          aria-hidden
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: `hsl(${hue} 70% 50%)` }}
        />
      )}
      {label}
    </button>
  );
}
