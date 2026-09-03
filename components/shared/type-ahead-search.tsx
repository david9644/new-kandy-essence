"use client";

import { useMemo, useState } from "react";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";

interface TypeAheadSearchProps<T> {
  items: T[];
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  getCode: (item: T) => string;
  getSubtext?: (item: T) => string | null | undefined;
  onSelect: (item: T) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** When provided, a "+ Add new {createLabel} '<query>'" row appears at the
   * bottom of the results once the user has typed something, so a missing
   * item/supplier never has to block the flow the search box is inside. */
  onCreateNew?: (query: string) => void;
  createLabel?: string;
}

// Filters an already-fetched, in-memory list as the user types -- at the
// scale here (1,500 items / 200 suppliers) this is instant and avoids a
// server round-trip per keystroke.
export function TypeAheadSearch<T>({
  items,
  getId,
  getLabel,
  getCode,
  getSubtext,
  onSelect,
  placeholder = "Search by name or code...",
  disabled,
  autoFocus,
  onCreateNew,
  createLabel = "item",
}: TypeAheadSearchProps<T>) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 50);
    return items
      .filter(
        (item) =>
          getLabel(item).toLowerCase().includes(q) || getCode(item).toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [items, query, getLabel, getCode]);

  const trimmedQuery = query.trim();

  return (
    <div className="relative w-full">
      <KeyboardTextInput
        value={query}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(v) => {
          setQuery(v);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
      />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
            {results.length === 0 && (
              <div className="px-4 py-4 text-sm text-muted">No matches.</div>
            )}
            {results.map((item) => (
              <button
                key={getId(item)}
                type="button"
                onClick={() => {
                  onSelect(item);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full min-h-[44px] flex-col items-start gap-0.5 border-b border-border px-4 py-3 text-left last:border-b-0 active:bg-background"
              >
                <span className="text-base font-medium text-foreground">{getLabel(item)}</span>
                <span className="text-sm text-muted">
                  {getCode(item)}
                  {getSubtext?.(item) ? ` · ${getSubtext(item)}` : ""}
                </span>
              </button>
            ))}
            {onCreateNew && trimmedQuery && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onCreateNew(trimmedQuery);
                }}
                className="flex w-full min-h-[44px] items-center border-t border-border px-4 py-3 text-left text-sm font-medium text-primary active:bg-background"
              >
                + Add new {createLabel} &lsquo;{trimmedQuery}&rsquo;
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
