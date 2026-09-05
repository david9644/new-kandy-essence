"use client";

import { useMemo, useRef, useState } from "react";
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

  // Distinguishes a tap from a scroll/drag inside the results list. Touch
  // pointers implicitly capture to whichever element received pointerdown,
  // so pointermove/pointerup below keep firing on that same row even once
  // the finger has moved off it -- letting a scroll gesture that starts on
  // a row cancel that row's selection instead of firing it.
  const pointerRef = useRef<{ startY: number; moved: boolean } | null>(null);

  function handlePointerDown(e: React.PointerEvent) {
    // preventDefault stops the native focus-blur that a pointerdown on a
    // non-input element would otherwise trigger on the search input. On
    // the touch station, that blur closes the on-screen keyboard panel and
    // shifts the layout (its reserved bottom padding collapses) before the
    // deferred click event fires, so the click lands on whatever is now
    // under the finger instead of this button -- selecting on pointerup
    // (once confirmed to be a tap, not a scroll) is what makes a single
    // tap register reliably.
    e.preventDefault();
    pointerRef.current = { startY: e.clientY, moved: false };
  }

  function handlePointerMove(e: React.PointerEvent) {
    const state = pointerRef.current;
    if (!state || state.moved) return;
    if (Math.abs(e.clientY - state.startY) > 10) {
      state.moved = true;
    }
  }

  function handlePointerUp(onTap: () => void) {
    const state = pointerRef.current;
    pointerRef.current = null;
    if (state && !state.moved) {
      onTap();
    }
  }

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
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={() =>
                  handlePointerUp(() => {
                    onSelect(item);
                    setQuery("");
                    setOpen(false);
                  })
                }
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
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={() =>
                  handlePointerUp(() => {
                    setOpen(false);
                    onCreateNew(trimmedQuery);
                  })
                }
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
