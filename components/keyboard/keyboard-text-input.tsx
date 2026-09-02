"use client";

import { useEffect, useRef, type InputHTMLAttributes } from "react";
import type { TextKey } from "@/components/OnScreenKeyboard";
import { useOnScreenKeyboard } from "./keyboard-context";
import { applyTextKey } from "./apply-text-key";

type NativeProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">;

interface KeyboardTextInputProps extends NativeProps {
  value: string;
  onChange: (value: string) => void;
}

// Drop-in replacement for a plain `<input type="text">`. See
// keyboard-number-input.tsx for why this stays a normal, directly-typable
// input rather than going read-only.
export function KeyboardTextInput({
  value,
  onChange,
  className,
  onFocus,
  ...rest
}: KeyboardTextInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
  });

  const { open, close } = useOnScreenKeyboard();

  function handleKey(key: TextKey) {
    if (key === "done") {
      close();
      return;
    }
    onChangeRef.current(applyTextKey(valueRef.current, key));
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChangeRef.current(e.target.value)}
      onFocus={(e) => {
        open({ type: "text", multiline: false, onKey: handleKey, targetRef: inputRef });
        onFocus?.(e);
      }}
      className={
        className ??
        "w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      }
      {...rest}
    />
  );
}
