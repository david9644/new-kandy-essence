import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/units";
import { EditPaymentForm } from "@/components/payments/edit-payment-form";
import { ConfirmDeleteButton } from "@/components/shared/confirm-delete-button";
import { deleteSupplierPayment } from "@/app/(app)/payments/actions";

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;
  await requireOwner();
  const supabase = await createClient();

  const [{ data: payment }, { data: bankAccounts }] = await Promise.all([
    supabase
      .from("supplier_payments")
      .select("*, suppliers(name, code), cheques(bank_account_id, cheque_number, cheque_date, amount, status)")
      .eq("id", paymentId)
      .maybeSingle(),
    supabase.from("bank_accounts").select("id, name").eq("active", true).order("name"),
  ]);

  if (!payment) notFound();

  const supplier = payment.suppliers as { name: string; code: string } | null;
  const cheque = payment.cheques as
    | { bank_account_id: string; cheque_number: string; cheque_date: string; amount: number; status: string }
    | null;

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {formatCurrency(payment.amount)}
          </h1>
          <p className="text-sm text-muted">
            {supplier?.name} ({supplier?.code}) &middot; {payment.date}
          </p>
        </div>
        <ConfirmDeleteButton
          label="Delete Payment"
          onDelete={deleteSupplierPayment.bind(null, payment.id)}
        />
      </div>

      {cheque && (
        <p className="mb-4 rounded-lg bg-background px-3 py-2 text-sm text-muted">
          Cheque {cheque.cheque_number} &middot; {cheque.cheque_date} &middot;{" "}
          <span className="capitalize">{cheque.status}</span>
        </p>
      )}

      <h2 className="mb-2 text-lg font-medium text-foreground">Edit Payment</h2>
      <EditPaymentForm
        paymentId={payment.id}
        bankAccounts={bankAccounts ?? []}
        initial={{
          date: payment.date,
          amount: payment.amount,
          payment_type: payment.payment_type,
          notes: payment.notes ?? "",
          cheque: cheque
            ? {
                bank_account_id: cheque.bank_account_id,
                cheque_number: cheque.cheque_number,
                cheque_date: cheque.cheque_date,
                amount: cheque.amount,
              }
            : null,
        }}
      />
    </div>
  );
}
