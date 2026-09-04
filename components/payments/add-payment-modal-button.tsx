"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/shared/modal";
import { PaymentForm } from "@/components/payments/payment-form";
import type { BankAccountOption } from "@/components/purchases/cheque-fields";

interface SupplierOption {
  id: string;
  code: string;
  name: string;
}

export function AddPaymentModalButton({
  supplier,
  bankAccounts,
}: {
  supplier: SupplierOption;
  bankAccounts: BankAccountOption[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function close() {
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground active:bg-background"
      >
        Payments
      </button>
      {open && (
        <Modal open onClose={close} title={`Payment to ${supplier.name}`}>
          <PaymentForm bankAccounts={bankAccounts} lockedSupplier={supplier} />
        </Modal>
      )}
    </>
  );
}
