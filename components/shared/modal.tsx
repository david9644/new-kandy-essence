"use client";

import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

// Centered panel + backdrop, portaled to <body> so it stacks above whatever
// page it's opened from. z-40, one below the on-screen keyboard panel's
// z-50 (components/keyboard/keyboard-panel.tsx) -- when a field inside the
// modal is focused on the touch kiosk, the keyboard needs to render on top
// of the modal, not behind it.
export function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground active:bg-background"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
