"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/shared/modal";
import { SupplierForm } from "@/components/suppliers/supplier-form";
import type { SupplierInput } from "@/app/(app)/suppliers/actions";

export function EditSupplierModalButton({
  initial,
  onSubmit,
}: {
  initial: SupplierInput;
  onSubmit: (input: SupplierInput) => Promise<{ error?: string; ok?: boolean }>;
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
        Edit Supplier
      </button>
      {open && (
        <Modal open onClose={close} title="Edit Supplier">
          <SupplierForm initial={initial} onSubmit={onSubmit} submitLabel="Save Changes" />
        </Modal>
      )}
    </>
  );
}
