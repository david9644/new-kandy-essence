"use client";

import { useState } from "react";
import { DeletePinDialog, type DeleteResult } from "@/components/shared/delete-pin-dialog";

// Delete flow: a plain button first, then Cancel/Confirm (so a delete never
// happens on the first touch), then the Delete PIN dialog -- only a correct
// PIN reaches the server action. onDelete receives the PIN and is a Server
// Action (often bound to a specific id via .bind(null, id) so the PIN is the
// remaining argument). If it redirects on success, this component simply
// never gets to render again; if it returns {error}, a PIN problem (it has a
// `code`) stays in the dialog, anything else (e.g. "stock already used") is
// shown in place on the page.
export function ConfirmDeleteButton({
  label,
  confirmLabel,
  onDelete,
}: {
  label: string;
  confirmLabel?: string;
  onDelete: (pin: string) => Promise<DeleteResult | undefined | void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePin(pin: string): Promise<DeleteResult | undefined> {
    const result = (await onDelete(pin)) ?? undefined;
    if (!result?.error) {
      setPinOpen(false);
      setConfirming(false);
      return undefined;
    }
    if (result.code) return result; // PIN problem: stay in the dialog

    setPinOpen(false);
    setError(result.error);
    return undefined;
  }

  return (
    <>
      {confirming ? (
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setPinOpen(true);
              }}
              className="flex h-11 items-center rounded-lg bg-danger px-4 text-sm font-medium text-white"
            >
              {confirmLabel ?? "Confirm Delete"}
            </button>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
          className="flex h-11 items-center rounded-lg border border-danger px-4 text-sm font-medium text-danger active:bg-danger-surface"
        >
          {label}
        </button>
      )}

      <DeletePinDialog open={pinOpen} onCancel={() => setPinOpen(false)} onSubmit={handlePin} />
    </>
  );
}
