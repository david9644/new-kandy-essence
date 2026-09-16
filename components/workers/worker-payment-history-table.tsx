"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/shared/modal";
import { formatCurrency } from "@/lib/units";
import { SalaryPaymentForm } from "@/components/workers/salary-payment-form";
import { ConfirmDeleteButton } from "@/components/shared/confirm-delete-button";
import { updateSalaryPayment, deleteSalaryPayment } from "@/app/(app)/workers/actions";

export interface PaymentRow {
  id: string;
  date: string;
  period: string | null;
  amount: number;
  notes: string | null;
}

export function WorkerPaymentHistoryTable({
  rows,
  workerId,
}: {
  rows: PaymentRow[];
  workerId: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const router = useRouter();

  const activeRow = rows.find((r) => r.id === openId);

  function close() {
    setOpenId(null);
    router.refresh();
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-background text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => setOpenId(row.id)}
                className="cursor-pointer border-t border-border active:bg-background"
              >
                <td className="px-4 py-3 text-foreground">{row.date}</td>
                <td className="px-4 py-3">
                  <span className="font-medium text-primary">{row.period || "-"}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {formatCurrency(row.amount)}
                </td>
                <td className="px-4 py-3 text-muted">{row.notes || "-"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  No payments recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {activeRow && (
        <Modal open onClose={close} title={formatCurrency(activeRow.amount)}>
          <p className="mb-4 text-sm text-muted">
            {activeRow.date}
            {activeRow.period ? ` · ${activeRow.period}` : ""}
          </p>

          <div className="mb-4 flex justify-end">
            <ConfirmDeleteButton
              label="Delete Payment"
              onDelete={async () => {
                const result = await deleteSalaryPayment(activeRow.id, workerId);
                if (!result?.error) close();
                return result;
              }}
            />
          </div>

          <SalaryPaymentForm
            initial={{
              date: activeRow.date,
              period: activeRow.period ?? "",
              amount: activeRow.amount,
              notes: activeRow.notes ?? "",
            }}
            onSubmit={updateSalaryPayment.bind(null, activeRow.id, workerId)}
            submitLabel="Save Changes"
            successMessage="Saved."
          />
        </Modal>
      )}
    </>
  );
}
