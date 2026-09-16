"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/shared/modal";
import { WorkerForm } from "@/components/workers/worker-form";
import { SalaryPaymentForm } from "@/components/workers/salary-payment-form";
import { ActiveToggleButton } from "@/components/items/active-toggle-button";
import type { WorkerInput } from "@/app/(app)/workers/actions";
import {
  updateWorker,
  setWorkerActive,
  createSalaryPayment,
} from "@/app/(app)/workers/actions";

export function WorkerDetailActions({
  workerId,
  workerName,
  active,
  initial,
}: {
  workerId: string;
  workerName: string;
  active: boolean;
  initial: WorkerInput;
}) {
  const [openModal, setOpenModal] = useState<"edit" | "payment" | null>(null);
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
        Edit Worker
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
        onToggle={setWorkerActive.bind(null, workerId, !active)}
      />

      {openModal === "edit" && (
        <Modal open onClose={close} title="Edit Worker">
          <WorkerForm
            initial={initial}
            onSubmit={updateWorker.bind(null, workerId)}
            submitLabel="Save Changes"
          />
        </Modal>
      )}

      {openModal === "payment" && (
        <Modal open onClose={close} title={`Record Payment — ${workerName}`}>
          <SalaryPaymentForm
            onSubmit={createSalaryPayment.bind(null, workerId)}
            submitLabel="Save Payment"
            successMessage="Payment recorded."
          />
        </Modal>
      )}
    </div>
  );
}
