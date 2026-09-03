"use client";

import { useState, useTransition } from "react";

// Two-tap delete: shows a plain button first, swaps to Cancel/Confirm once
// tapped so a delete never happens on the first touch. onDelete is a Server
// Action (often bound to a specific id via .bind(null, id)) -- if it
// redirects on success, this component simply never gets to render again;
// if it returns {error}, that's shown in place without leaving the page.
export function ConfirmDeleteButton({
  label,
  confirmLabel,
  onDelete,
}: {
  label: string;
  confirmLabel?: string;
  onDelete: () => Promise<{ error?: string } | undefined>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="flex h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await onDelete();
                if (result?.error) setError(result.error);
              })
            }
            className="flex h-11 items-center rounded-lg bg-danger px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Deleting..." : (confirmLabel ?? "Confirm Delete")}
          </button>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="flex h-11 items-center rounded-lg border border-danger px-4 text-sm font-medium text-danger active:bg-danger-surface"
    >
      {label}
    </button>
  );
}
