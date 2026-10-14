"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { PinPad } from "@/components/shared/pin-pad";

export interface DeleteResult {
  ok?: boolean;
  error?: string;
  code?: string;
}

// The reusable "enter the Delete PIN" step. Every delete in the app goes
// through it (via ConfirmDeleteButton), and so will deleting a single
// purchase line later. onSubmit receives the PIN and runs the server action;
// return {error, code} to keep the dialog open with the message shown, or
// anything else to let the caller decide (it closes the dialog itself).
//
// The PIN only ever lives in this component's state: it is cleared after every
// attempt and on close, never written to storage, a URL or the console.
//
// Portaled above everything (z-60: above Modal's z-40 and the on-screen
// keyboard panel's z-50), and made of no text input, so no keyboard can cover
// it.
export function DeletePinDialog(props: DeletePinDialogProps) {
  // Mounted only while open, so the PIN / error / pending state starts fresh
  // every time and is dropped the moment the dialog closes.
  if (!props.open || typeof document === "undefined") return null;
  return <DeletePinDialogBody {...props} />;
}

interface DeletePinDialogProps {
  open: boolean;
  title?: string;
  description?: string;
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: (pin: string) => Promise<DeleteResult | undefined | void>;
}

function DeletePinDialogBody({
  title = "Enter Delete PIN",
  description,
  submitLabel = "Delete",
  onCancel,
  onSubmit,
}: DeletePinDialogProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<DeleteResult | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pending, onCancel]);

  async function submit() {
    if (pin.length < 4 || pending) return;
    setPending(true);
    setError(null);
    const attempt = pin;
    setPin("");
    try {
      const result = await onSubmit(attempt);
      if (result?.error) setError(result);
    } catch {
      setError({ error: "Something went wrong. Try again." });
    }
    setPending(false);
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto p-4">
      <div className="absolute inset-0 bg-black/50" onClick={pending ? undefined : onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[95vh] w-full max-w-xs overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-lg"
      >
        <h2 className="text-center text-lg font-semibold text-foreground">{title}</h2>
        <p className="mb-4 mt-1 text-center text-sm text-muted">
          {description ?? "Enter your Delete PIN to confirm."}
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-danger-surface px-3 py-2 text-center text-sm text-danger">
            <p>{error.error}</p>
            {error.code === "not_set" && (
              <Link href="/settings" className="mt-1 inline-block font-medium underline">
                Go to Settings
              </Link>
            )}
          </div>
        )}

        <PinPad value={pin} onChange={setPin} onSubmit={submit} disabled={pending} autoFocus />

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="flex h-14 flex-1 items-center justify-center rounded-xl border border-border text-base font-medium text-foreground disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pin.length < 4 || pending}
            className="flex h-14 flex-1 items-center justify-center rounded-xl bg-danger text-base font-semibold text-white disabled:opacity-40"
          >
            {pending ? "Checking..." : submitLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
