"use client";

import { useEffect, useRef, useState } from "react";
import { applyNumericKey } from "@/components/keyboard/keyboard-number-input";
import { useOnScreenKeyboard } from "@/components/keyboard/keyboard-context";
import type { NumericKey } from "@/components/NumericKeypad";

// The quantity between the + and - buttons of a bill line, typed directly.
//
// Focus (a tap, a click, Tab) selects the whole number so the next key replaces it, and
// opens the number pad like every other number field. The value is applied when the
// cashier presses Enter, the pad's Done, or taps / clicks anywhere else; Escape puts the
// old number back. A value the bill rejects (empty, zero, invalid, too big) is never
// applied: the previous quantity comes back and `onMessage` says why.
export function QuantityInput({
  value,
  disabled,
  label,
  onCommit,
  onMessage,
  onEditing,
}: {
  /** The quantity on the line. */
  value: string;
  disabled: boolean;
  /** For screen readers: which line. */
  label: string;
  /** Applies the typed text; returns why it was refused, or null when it was applied. */
  onCommit: (text: string) => string | null;
  onMessage: (message: string | null) => void;
  /** True while the number is being typed (the bill gives its line list the room). */
  onEditing: (editing: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { active, open, close } = useOnScreenKeyboard();

  // null = not being edited (the line's own quantity is shown)
  const [draft, setDraft] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const setDraftBoth = (d: string | null) => {
    draftRef.current = d;
    setDraft(d);
  };
  // true from focus until the first key: the whole number is selected, a pad key replaces it
  const fresh = useRef(false);

  const latest = useRef({ value, onCommit, onMessage, onEditing });
  useEffect(() => {
    latest.current = { value, onCommit, onMessage, onEditing };
  });
  // the line is never left marked as "being edited" if it goes away mid-edit
  useEffect(() => () => latest.current.onEditing(false), []);

  function finish() {
    const text = draftRef.current;
    if (text === null) return;
    setDraftBoth(null);
    fresh.current = false;
    const { value: before, onCommit: commit, onMessage: say, onEditing: editing } = latest.current;
    editing(false);
    const why = commit(text);
    say(why ? `${why} Kept ${before}.` : null);
  }
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  function handleKey(key: NumericKey) {
    const current = draftRef.current ?? latest.current.value;
    let next: string;
    if (fresh.current) {
      fresh.current = false;
      next = key === "back" || key === "clear" ? "" : key === "." ? "0." : key;
    } else {
      next = applyNumericKey(current, key, true);
    }
    setDraftBoth(next);
  }

  // The pad went away while this field was being edited (Done, or a tap elsewhere closed it):
  // apply what was typed.
  const padIsMine = active?.targetRef === inputRef;
  const padWasMine = useRef(false);
  useEffect(() => {
    if (padIsMine) {
      padWasMine.current = true;
      return;
    }
    if (padWasMine.current) {
      padWasMine.current = false;
      finishRef.current();
      inputRef.current?.blur();
    }
  }, [padIsMine]);

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="none"
      autoComplete="off"
      maxLength={9}
      disabled={disabled}
      aria-label={`Quantity of ${label}`}
      data-testid="qty-input"
      value={draft ?? value}
      onChange={(e) => {
        const v = e.target.value;
        if (!/^\d*\.?\d{0,2}$/.test(v)) return;
        fresh.current = false;
        setDraftBoth(v);
      }}
      onFocus={(e) => {
        const el = e.currentTarget;
        setDraftBoth(draftRef.current ?? latest.current.value);
        fresh.current = true;
        latest.current.onMessage(null);
        latest.current.onEditing(true);
        open({ type: "numeric", allowDecimal: true, onKey: handleKey, targetRef: inputRef });
        // after the browser has placed the caret (a finger tap does that on release)
        window.setTimeout(() => {
          if (fresh.current && document.activeElement === el) el.select();
        }, 0);
      }}
      onClick={(e) => {
        if (fresh.current) e.currentTarget.select();
      }}
      onBlur={() => finish()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish();
          e.currentTarget.blur();
          close();
        } else if (e.key === "Tab") {
          // focus moves on by itself: apply the number and put the pad away with it
          finish();
          close();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraftBoth(null);
          fresh.current = false;
          latest.current.onEditing(false);
          e.currentTarget.blur();
          close();
        }
      }}
      className="h-11 w-16 touch-manipulation rounded-xl border border-border bg-surface px-1 text-center text-base font-semibold tabular-nums text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-40"
    />
  );
}
