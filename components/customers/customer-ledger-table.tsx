"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/shared/modal";
import { formatCurrency } from "@/lib/units";
import { TransactionForm } from "@/components/customers/transaction-form";
import { ConfirmDeleteButton } from "@/components/shared/confirm-delete-button";
import {
  updateCustomerCredit,
  deleteCustomerCredit,
  updateCustomerPayment,
  deleteCustomerPayment,
} from "@/app/(app)/customers/actions";

export interface LedgerRow {
  entry_id: string;
  entry_date: string;
  entry_type: string;
  reference: string;
  debit: number;
  credit: number;
  running_balance: number;
  notes?: string;
}

export function CustomerLedgerTable({ rows, customerId }: { rows: LedgerRow[]; customerId: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const router = useRouter();

  const activeRow = rows.find((r) => r.entry_id === openId);

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
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3 text-right">Debit</th>
              <th className="px-4 py-3 text-right">Credit</th>
              <th className="px-4 py-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.entry_id}
                onClick={() => setOpenId(row.entry_id)}
                className="cursor-pointer border-t border-border active:bg-background"
              >
                <td className="px-4 py-3 text-foreground">{row.entry_date}</td>
                <td className="px-4 py-3 text-foreground">
                  <span className="font-medium text-primary">{row.reference}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {row.debit ? formatCurrency(row.debit) : "-"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {row.credit ? formatCurrency(row.credit) : "-"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                  {formatCurrency(row.running_balance)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No activity in this date range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {activeRow && (
        <Modal
          open
          onClose={close}
          title={formatCurrency(
            activeRow.entry_type === "credit" ? activeRow.debit : activeRow.credit
          )}
        >
          <p className="mb-4 text-sm capitalize text-muted">
            {activeRow.entry_type === "credit" ? "Credit given" : "Payment received"} &middot;{" "}
            {activeRow.entry_date}
          </p>

          <div className="mb-4 flex justify-end">
            <ConfirmDeleteButton
              label={activeRow.entry_type === "credit" ? "Delete Credit" : "Delete Payment"}
              onDelete={async () => {
                const result =
                  activeRow.entry_type === "credit"
                    ? await deleteCustomerCredit(activeRow.entry_id, customerId)
                    : await deleteCustomerPayment(activeRow.entry_id, customerId);
                if (!result?.error) close();
                return result;
              }}
            />
          </div>

          <TransactionForm
            initial={{
              date: activeRow.entry_date,
              amount: activeRow.entry_type === "credit" ? activeRow.debit : activeRow.credit,
              notes: activeRow.notes ?? "",
            }}
            onSubmit={
              activeRow.entry_type === "credit"
                ? updateCustomerCredit.bind(null, activeRow.entry_id, customerId)
                : updateCustomerPayment.bind(null, activeRow.entry_id, customerId)
            }
            submitLabel="Save Changes"
            successMessage="Saved."
          />
        </Modal>
      )}
    </>
  );
}
