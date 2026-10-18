import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { BillingScreen } from "@/components/billing/billing-screen";
import { loadBillCustomers, loadBillItems, todayIso } from "@/lib/billing-data";

// Owner only. The same billing screen, pre-filled; saving asks for the Delete PIN.
export default async function EditBillPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  await requireOwner();
  const supabase = await createClient();

  const [{ data: invoice }, { data: lines }, { data: payments }, items, customers] =
    await Promise.all([
      supabase
        .from("invoices")
        .select(
          "id, invoice_no, date, customer_id, customer_name, customer_code, bill_discount, notes, cash_received"
        )
        .eq("id", invoiceId)
        .maybeSingle(),
      supabase
        .from("invoice_items")
        .select("item_id, unit_name, quantity, base_quantity, unit_price, line_discount, line_no")
        .eq("invoice_id", invoiceId)
        .order("line_no"),
      supabase
        .from("invoice_payments")
        .select("method, amount, cheque_number, cheque_bank, cheque_date, reference")
        .eq("invoice_id", invoiceId)
        .order("created_at"),
      loadBillItems(supabase),
      loadBillCustomers(supabase),
    ]);

  // Deleted bills are invisible to the API (RLS), so this is also "not found".
  if (!invoice) notFound();

  // Stock this bill currently holds is restored before the new lines are
  // applied, so the screen counts it as available.
  const heldBase: Record<string, number> = {};
  for (const l of lines ?? []) {
    heldBase[l.item_id] = (heldBase[l.item_id] ?? 0) + l.base_quantity;
  }

  const customer =
    invoice.customer_id && invoice.customer_name
      ? { id: invoice.customer_id, code: invoice.customer_code ?? "", name: invoice.customer_name }
      : null;

  return (
    <BillingScreen
      mode="edit"
      items={items}
      customers={customers}
      isOwner
      today={todayIso()}
      heldBase={heldBase}
      initial={{
        invoiceId: invoice.id,
        invoiceNo: invoice.invoice_no,
        date: invoice.date,
        customer,
        billDiscount: invoice.bill_discount,
        notes: invoice.notes ?? "",
        cashReceived: invoice.cash_received,
        lines: (lines ?? []).map((l) => ({
          itemId: l.item_id,
          unitName: l.unit_name,
          quantity: l.quantity,
          unitPrice: l.unit_price,
          discount: l.line_discount,
        })),
        payments: payments ?? [],
      }}
    />
  );
}
