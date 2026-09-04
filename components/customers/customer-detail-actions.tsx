"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/shared/modal";
import { CustomerForm } from "@/components/customers/customer-form";
import { TransactionForm } from "@/components/customers/transaction-form";
import { ActiveToggleButton } from "@/components/items/active-toggle-button";
import type { CustomerInput } from "@/app/(app)/customers/actions";
import {
  updateCustomer,
  setCustomerActive,
  createCustomerCredit,
  createCustomerPayment,
} from "@/app/(app)/customers/actions";

export function CustomerDetailActions({
  customerId,
  customerName,
  active,
  initial,
}: {
  customerId: string;
  customerName: string;
  active: boolean;
  initial: CustomerInput;
}) {
  const [openModal, setOpenModal] = useState<"edit" | "credit" | "payment" | null>(null);
  const router = useRouter();

  function close() {
    setOpenModal(null);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button
        type="button"
        onClick={() => setOpenModal("edit")}
        className="flex h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground active:bg-background"
      >
        Edit Customer
      </button>
      <button
        type="button"
        onClick={() => setOpenModal("credit")}
        className="flex h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground active:bg-background"
      >
        Add Credit
      </button>
      <button
        type="button"
        onClick={() => setOpenModal("payment")}
        className="flex h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground active:bg-background"
      >
        Record Payment
      </button>
      <ActiveToggleButton
        active={active}
        onToggle={setCustomerActive.bind(null, customerId, !active)}
      />

      {openModal === "edit" && (
        <Modal open onClose={close} title="Edit Customer">
          <CustomerForm
            initial={initial}
            onSubmit={updateCustomer.bind(null, customerId)}
            submitLabel="Save Changes"
          />
        </Modal>
      )}

      {openModal === "credit" && (
        <Modal open onClose={close} title={`Add Credit — ${customerName}`}>
          <TransactionForm
            onSubmit={createCustomerCredit.bind(null, customerId)}
            submitLabel="Save Credit"
            successMessage="Credit recorded."
          />
        </Modal>
      )}

      {openModal === "payment" && (
        <Modal open onClose={close} title={`Record Payment — ${customerName}`}>
          <TransactionForm
            onSubmit={createCustomerPayment.bind(null, customerId)}
            submitLabel="Save Payment"
            successMessage="Payment recorded."
          />
        </Modal>
      )}
    </div>
  );
}
