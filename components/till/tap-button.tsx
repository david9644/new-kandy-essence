"use client";

import { useRef } from "react";

// A button that fires on pointer-UP for a real tap. The on-screen keyboard
// closes on any outside pointer-down, which can move a bottom-anchored button
// out from under the finger before the browser's own click is dispatched; a
// tap detected here still lands. Keyboard (Enter/Space) activation, which has
// no pointer, goes through onClick as usual.
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
          handled.current = true;
          onTap();
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
