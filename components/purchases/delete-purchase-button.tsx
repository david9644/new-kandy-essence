"use client";

import { useState, useTransition } from "react";
import { deletePurchase } from "@/app/(app)/purchases/actions";

export function DeletePurchaseButton({ purchaseId }: { purchaseId: string }) {
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
                const result = await deletePurchase(purchaseId);
                if (result?.error) setError(result.error);
              })
            }
            className="flex h-11 items-center rounded-lg bg-danger px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Deleting..." : "Confirm Delete"}
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
      Delete Purchase
    </button>
  );
}
