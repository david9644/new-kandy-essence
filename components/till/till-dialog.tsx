"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useKeyboardHeight } from "./use-keyboard-height";

// A dialog that lives in the space ABOVE the on-screen number pad / keyboard:
// its height is the viewport minus the pad, and its body scrolls inside. z-40,
// like Modal (the keyboard panel is z-50, the Delete PIN dialog z-60).
export function TillDialog({
  open,
  title,
  onClose,
  children,
  footer,
  width = "max-w-xl",
  closeDisabled,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
  closeDisabled?: boolean;
}) {
  const kb = useKeyboardHeight();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !closeDisabled) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, closeDisabled]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-x-0 top-0 z-40 flex items-center justify-center p-3"
      style={{ height: `calc(100dvh - ${kb}px)` }}
    >
      <div className="absolute inset-0 bg-black/40" onClick={closeDisabled ? undefined : onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-full w-full ${width} flex-col overflow-clip rounded-2xl border border-border bg-surface shadow-lg`}
      >
        <div className={`flex shrink-0 items-center justify-between border-b border-border px-4 ${kb > 0 ? "py-1.5" : "py-3"}`}>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-foreground active:bg-background disabled:opacity-40"
          >
            ✕
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto px-4 ${kb > 0 ? "py-3" : "py-4"}`}>{children}</div>
        {footer && (
          <div className={`shrink-0 border-t border-border bg-surface px-4 ${kb > 0 ? "py-2" : "py-3"}`}>{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
}
