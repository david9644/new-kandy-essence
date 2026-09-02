"use client";

import { useState } from "react";

// Same key-emitting design as NumericKeypad: reports single characters plus
// "back" / "space" / "done" and leaves interpreting them to the caller. Shift
// and the letters/symbols toggle are pure presentation, so they're kept as
// local state here rather than pushed up -- callers only ever see the final
// resolved character.
export type TextKey = string | "back" | "space" | "done";

interface OnScreenKeyboardProps {
  onKey: (key: TextKey) => void;
  disabled?: boolean;
}

const LETTER_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const SYMBOL_ROWS = ["1234567890", "-/:;()$&@\"", ".,?!'#%+"];

export function OnScreenKeyboard({ onKey, disabled = false }: OnScreenKeyboardProps) {
  const [shift, setShift] = useState(false);
  const [symbols, setSymbols] = useState(false);

  function press(key: TextKey) {
    if (disabled) return;
    if (key === "back" || key === "space" || key === "done") {
      onKey(key);
      return;
    }
    onKey(shift && !symbols ? key.toUpperCase() : key);
    if (shift && !symbols) setShift(false);
  }

  function keyButton(key: TextKey, label: React.ReactNode, className = "") {
    return (
      <button
        key={typeof key === "string" ? key + label : key}
        type="button"
        disabled={disabled}
        onPointerDown={(e) => {
          e.preventDefault();
          press(key);
        }}
        className={`flex h-12 min-w-0 flex-1 items-center justify-center rounded-lg border border-border bg-surface text-base font-medium text-foreground active:bg-background disabled:opacity-30 ${className}`}
      >
        {label}
      </button>
    );
  }

  const rows = symbols ? SYMBOL_ROWS : LETTER_ROWS;

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => (
        <div key={i} className="flex justify-center gap-1.5">
          {row.split("").map((char) => keyButton(char, shift && !symbols ? char.toUpperCase() : char))}
        </div>
      ))}
      <div className="flex justify-center gap-1.5">
        {!symbols && (
          <button
            type="button"
            disabled={disabled}
            onPointerDown={(e) => {
              e.preventDefault();
              if (!disabled) setShift((s) => !s);
            }}
            className={`flex h-12 max-w-[3.5rem] flex-[1.5] items-center justify-center rounded-lg border text-base font-medium disabled:opacity-30 ${
              shift
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-surface text-foreground active:bg-background"
            }`}
          >
            ⇧
          </button>
        )}
        <button
          type="button"
          disabled={disabled}
          onPointerDown={(e) => {
            e.preventDefault();
            if (!disabled) setSymbols((s) => !s);
          }}
          className="flex h-12 max-w-[3.5rem] flex-[1.5] items-center justify-center rounded-lg border border-border bg-surface text-sm font-medium text-foreground active:bg-background disabled:opacity-30"
        >
          {symbols ? "ABC" : "123"}
        </button>
        {keyButton("space", "space", "flex-[5]")}
        {keyButton("back", "⌫", "max-w-[3.5rem] flex-[1.5]")}
        <button
          type="button"
          disabled={disabled}
          onPointerDown={(e) => {
            e.preventDefault();
            if (!disabled) onKey("done");
          }}
          className="flex h-12 max-w-[4.5rem] flex-[1.8] items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-30"
        >
          Done
        </button>
      </div>
    </div>
  );
}
