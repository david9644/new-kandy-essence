"use client";

import { ConfirmDeleteButton } from "@/components/shared/confirm-delete-button";
import { deletePurchaseItem } from "@/app/(app)/purchases/actions";

// Owner-only control on a purchase detail line. Same flow as every other
// delete: Delete -> Confirm -> Delete PIN dialog. Refusal reasons from the
// server (stock already used, only line, cheque can't be adjusted...) show
// right under the buttons.
export function DeletePurchaseLineButton({
  purchaseItemId,
  purchaseId,
}: {
  purchaseItemId: string;
  purchaseId: string;
}) {
  return (
    <div className="ml-auto max-w-[16rem]">
      <ConfirmDeleteButton
        label="Delete"
        confirmLabel="Confirm"
        onDelete={(pin) => deletePurchaseItem(purchaseItemId, purchaseId, pin)}
      />
    </div>
  );
}
