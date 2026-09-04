"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/shared/modal";
import { formatCurrency } from "@/lib/units";
import { EditPaymentForm } from "@/components/payments/edit-payment-form";
import { ConfirmDeleteButton } from "@/components/shared/confirm-delete-button";
import { deleteSupplierPayment } from "@/app/(app)/payments/actions";
import type { BankAccountOption } from "@/components/purchases/cheque-fields";
import type { Database } from "@/lib/types/database.types";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export interface PaymentDetail {
  payment_type: PaymentMethod;
  notes: string;
  cheque: {
    bank_account_id: string;
    cheque_number: string;
    cheque_date: string;
    amount: number;
    status: string;
  } | null;
}

export interface LedgerRow {
  entry_id: string;
  entry_date: string;
  entry_type: string;
  reference: string;
  debit: number;
  credit: number;
  running_balance: number;
  paymentDetail?: PaymentDetail;
}

export function LedgerTable({
  rows,
  bankAccounts,
  supplierId,
}: {
  rows: LedgerRow[];
  bankAccounts: BankAccountOption[];
  supplierId: string;
}) {
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
            {rows.map((row) => {
              const isPayment = row.entry_type === "payment" && row.paymentDetail;
              const isPurchase = row.entry_type === "purchase";
              const clickable = isPayment || isPurchase;
              function handleClick() {
                if (isPayment) setOpenId(row.entry_id);
                else if (isPurchase) router.push(`/purchases/${row.entry_id}`);
              }
              return (
                <tr
                  key={row.entry_id}
                  onClick={clickable ? handleClick : undefined}
                  className={`border-t border-border ${
                    clickable ? "cursor-pointer active:bg-background" : ""
                  }`}
                >
                  <td className="px-4 py-3 text-foreground">{row.entry_date}</td>
                  <td className="px-4 py-3 text-foreground">
                    {clickable ? (
                      <span className="font-medium text-primary">{row.reference}</span>
                    ) : (
                      row.reference
                    )}
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
              );
            })}
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

      {activeRow && activeRow.paymentDetail && (
        <Modal open onClose={close} title={formatCurrency(activeRow.credit)}>
          <p className="mb-4 text-sm text-muted">{activeRow.entry_date}</p>

          {activeRow.paymentDetail.cheque && (
            <p className="mb-4 rounded-lg bg-background px-3 py-2 text-sm text-muted">
              Cheque {activeRow.paymentDetail.cheque.cheque_number} &middot;{" "}
              {activeRow.paymentDetail.cheque.cheque_date} &middot;{" "}
              <span className="capitalize">{activeRow.paymentDetail.cheque.status}</span>
            </p>
          )}

          <div className="mb-4 flex justify-end">
            <ConfirmDeleteButton
              label="Delete Payment"
              onDelete={async () => {
                const result = await deleteSupplierPayment(activeRow.entry_id, supplierId);
                if (!result?.error) close();
                return result;
              }}
            />
          </div>

          <EditPaymentForm
            paymentId={activeRow.entry_id}
            bankAccounts={bankAccounts}
            initial={{
              date: activeRow.entry_date,
              amount: activeRow.credit,
              payment_type: activeRow.paymentDetail.payment_type,
              notes: activeRow.paymentDetail.notes,
              cheque: activeRow.paymentDetail.cheque
                ? {
                    bank_account_id: activeRow.paymentDetail.cheque.bank_account_id,
                    cheque_number: activeRow.paymentDetail.cheque.cheque_number,
                    cheque_date: activeRow.paymentDetail.cheque.cheque_date,
                    amount: activeRow.paymentDetail.cheque.amount,
                  }
                : null,
            }}
          />
        </Modal>
      )}
    </>
  );
}
