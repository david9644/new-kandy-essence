"use client";

import { useEffect, useRef, type TextareaHTMLAttributes } from "react";
import type { TextKey } from "@/components/OnScreenKeyboard";
import { useOnScreenKeyboard } from "./keyboard-context";
import { applyTextKey } from "./apply-text-key";

type NativeProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">;

interface KeyboardTextAreaProps extends NativeProps {
  value: string;
  onChange: (value: string) => void;
}

// Same as KeyboardTextInput but for multi-line fields (notes, reasons,
// addresses). The on-screen keyboard's space key is the only way to add
// whitespace -- there's no newline key, matching how these fields are used
// (short free-text notes, not formatted paragraphs).
export function KeyboardTextArea({
  value,
  onChange,
  className,
  rows = 2,
  onFocus,
  ...rest
}: KeyboardTextAreaProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
    <textarea
      ref={inputRef}
      value={value}
      rows={rows}
      onChange={(e) => onChangeRef.current(e.target.value)}
      onFocus={(e) => {
        open({ type: "text", multiline: true, onKey: handleKey, targetRef: inputRef });
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
