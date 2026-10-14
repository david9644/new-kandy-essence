"use client";

import { ConfirmDeleteButton } from "@/components/shared/confirm-delete-button";
import { deletePurchase } from "@/app/(app)/purchases/actions";

export function DeletePurchaseButton({ purchaseId }: { purchaseId: string }) {
  return (
    <ConfirmDeleteButton
      label="Delete Purchase"
      onDelete={(pin) => deletePurchase(purchaseId, pin)}
    />
  );
}
