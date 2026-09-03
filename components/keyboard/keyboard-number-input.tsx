"use client";

import { useEffect, useRef, type InputHTMLAttributes } from "react";
import type { NumericKey } from "@/components/NumericKeypad";
import { useOnScreenKeyboard } from "./keyboard-context";

type NativeProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode"
>;

interface KeyboardNumberInputProps extends NativeProps {
  value: string;
  onChange: (value: string) => void;
  allowDecimal?: boolean;
  /** Caps total character count (e.g. a 6-digit PIN). Enforced for both the
   * floating NumericKeypad and native typing (via the input's maxLength). */
  maxLength?: number;
}

function applyNumericKey(
  current: string,
  key: NumericKey,
  allowDecimal: boolean,
  maxLength?: number
): string {
  if (key === "back") return current.slice(0, -1);
  if (key === "clear") return "";
  if (key === ".") {
    if (!allowDecimal || current.includes(".")) return current;
    if (maxLength != null && current.length >= maxLength) return current;
    return current + ".";
  }
  // digit: cap at two decimal places, matching the validation every numeric
  // field in the app already expects
  if (current.includes(".") && current.split(".")[1]?.length >= 2) return current;
  if (maxLength != null && current.length >= maxLength) return current;
  return current + key;
}

// Drop-in replacement for `<input inputMode="decimal">`. inputMode="none"
// suppresses the OS/browser's own software keyboard (which would otherwise
// pop up alongside our custom NumericKeypad on the touch station); physical
// keyboard input keeps working unchanged since inputMode only affects which
// on-screen keyboard the platform offers, not actual key input.
export function KeyboardNumberInput({
  value,
  onChange,
  allowDecimal = true,
  maxLength,
  className,
  onFocus,
  ...rest
}: KeyboardNumberInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  });

  const { open } = useOnScreenKeyboard();

  function handleKey(key: NumericKey) {
    onChangeRef.current(applyNumericKey(valueRef.current, key, allowDecimal, maxLength));
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="none"
      value={value}
      maxLength={maxLength}
      onChange={(e) => {
        const v = e.target.value;
        const pattern = allowDecimal ? /^\d*\.?\d{0,2}$/ : /^\d*$/;
        if (pattern.test(v)) onChangeRef.current(v);
      }}
      onFocus={(e) => {
        open({ type: "numeric", allowDecimal, onKey: handleKey, targetRef: inputRef });
        onFocus?.(e);
      }}
      className={
        className ??
        "w-full rounded-lg border border-border bg-surface px-4 py-3 text-right text-base tabular-nums text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      }
      {...rest}
    />
  );
}
