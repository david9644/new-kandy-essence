"use client";

import { useEffect, useRef } from "react";
import { NumericKeypad, type NumericKey } from "@/components/NumericKeypad";

export const MAX_PIN_LENGTH = 6;

// Masked PIN entry: dots instead of digits plus the same big on-screen
// numeric keypad the login screen uses. There is deliberately no <input>, so
// the on-screen keyboard panel / OS keyboard never opens and can't cover it
// on the touch stations. A physical keyboard still works (digits, Backspace,
// Enter) because the wrapper takes focus.
export function PinPad({
  value,
  onChange,
  onSubmit,
  disabled = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (pin: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus) {
      // Drop focus from any field underneath (e.g. an edit form in a modal)
      // so physical digits don't also land there.
      (document.activeElement as HTMLElement | null)?.blur?.();
      wrapperRef.current?.focus();
    }
  }, [autoFocus]);

  function press(key: NumericKey) {
    if (disabled) return;
    if (key === "back") onChange(value.slice(0, -1));
    else if (key === "clear") onChange("");
    else if (/^\d$/.test(key) && value.length < MAX_PIN_LENGTH) onChange(value + key);
  }

  return (
    <div
      ref={wrapperRef}
      tabIndex={-1}
      className="outline-none"
      onKeyDown={(e) => {
        if (disabled) return;
        if (/^\d$/.test(e.key)) {
          e.preventDefault();
          press(e.key as NumericKey);
        } else if (e.key === "Backspace") {
          e.preventDefault();
          press("back");
        } else if (e.key === "Enter") {
          e.preventDefault();
          onSubmit?.();
        }
      }}
    >
      <div className="mb-4 flex justify-center gap-3" aria-label={`${value.length} digits entered`}>
        {Array.from({ length: Math.max(value.length, 4) }).map((_, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full border-2 border-primary ${
              i < value.length ? "bg-primary" : "bg-transparent"
            }`}
          />
        ))}
      </div>
      <NumericKeypad onKey={press} allowDecimal={false} disabled={disabled} />
    </div>
  );
}
