"use client";

import { useRef } from "react";
import { useOnScreenKeyboard } from "@/components/keyboard/keyboard-context";

// A button that fires on pointer-UP for a real tap, so it still lands when the page
// moves under the finger before the browser's own click is dispatched (a bottom-anchored
// button, a dialog that grows). Keyboard (Enter/Space) activation, which has no pointer,
// goes through onClick as usual. The click that follows a touch tap is dropped by
// TouchGuard when it lands on something else.
export function TapButton({
  onTap,
  disabled,
  className,
  children,
  ...rest
}: {
  onTap: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "onPointerDown" | "onPointerUp">) {
  const down = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const handled = useRef(false);
  const handledTimer = useRef<number | undefined>(undefined);
  // the on-screen keyboard goes away with any tap outside it; this button acts on
  // pointer-up, before the keyboard's own click rule can run, so it closes it here
  const { close: closeKeyboard } = useOnScreenKeyboard();

  return (
    <button
      type="button"
      disabled={disabled}
      className={className}
      onPointerDown={(e) => {
        down.current = { x: e.clientX, y: e.clientY, moved: false };
        handled.current = false;
      }}
      onPointerMove={(e) => {
        const d = down.current;
        if (d && (Math.abs(e.clientX - d.x) > 10 || Math.abs(e.clientY - d.y) > 10)) d.moved = true;
      }}
      onPointerCancel={() => {
        down.current = null;
      }}
      onPointerUp={() => {
        const d = down.current;
        down.current = null;
        if (d && !d.moved && !disabled) {
          // the click that follows this tap is skipped; if it never comes (the page changed
          // under the finger, see TouchGuard) the flag still clears, so a later keyboard
          // Enter / Space on this button is not swallowed
          handled.current = true;
          window.clearTimeout(handledTimer.current);
          handledTimer.current = window.setTimeout(() => {
            handled.current = false;
          }, 600);
          onTap();
          closeKeyboard();
        }
      }}
      onClick={(e) => {
        // A click that follows a pointer tap was already handled on pointer-up.
        if (handled.current) {
          handled.current = false;
          return;
        }
        if (e.detail === 0 && !disabled) onTap();
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
