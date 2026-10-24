import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InvoicePrintView } from "@/components/print/invoice-print-view";
import { loadPrintConfig } from "@/lib/print/load";
import type { PrintInvoice } from "@/lib/print/invoice-layout";

// Both roles. Deleted bills are hidden from the API by RLS, so they 404 here
// exactly like on the bill page.
export default async function PrintInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const { invoiceId } = await params;
  const { auto } = await searchParams;
  const supabase = await createClient();

  const [{ data: invoice }, { data: lines }, { data: payments }, config] = await Promise.all([
    supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle(),
    supabase
      .from("invoice_items")
      .select("line_no, unit_name, quantity, unit_price, line_discount, line_total, list_unit_price, items(name)")
      .eq("invoice_id", invoiceId)
      .order("line_no"),
    supabase
      .from("invoice_payments")
      .select("method, amount, cheque_number, cheque_bank, cheque_date, reference")
      .eq("invoice_id", invoiceId)
      .order("created_at"),
    loadPrintConfig(supabase),
  ]);

  if (!invoice) notFound();

  const printInvoice: PrintInvoice = {
    business: config.business,
    invoiceNo: invoice.invoice_no,
    date: invoice.date,
    customerName: invoice.customer_name,
    customerCode: invoice.customer_code,
    customerPhone: invoice.customer_phone,
    cashierName: invoice.created_by_name,
    lines: (lines ?? []).map((l) => ({
      itemName: (l.items as { name: string } | null)?.name ?? "",
      quantity: l.quantity,
      unitName: l.unit_name,
      unitPrice: l.unit_price,
      lineDiscount: l.line_discount,
      lineTotal: l.line_total,
      listUnitPrice: l.list_unit_price,
    })),
    subtotal: invoice.subtotal,
    lineDiscountTotal: invoice.line_discount_total,
    billDiscount: invoice.bill_discount,
    total: invoice.total,
    payments: (payments ?? []).map((p) => ({
      method: p.method,
      amount: p.amount,
      chequeNumber: p.cheque_number,
      chequeBank: p.cheque_bank,
      chequeDate: p.cheque_date,
      reference: p.reference,
    })),
    cashReceived: invoice.cash_received,
    credit: invoice.credit_amount,
    footer: config.settings.footer,
    label: null,
  };

  return (
    <InvoicePrintView
      invoiceId={invoice.id}
      invoice={printInvoice}
      settings={config.settings}
      printCount={invoice.print_count}
      editCount={invoice.edit_count}
      autoPrint={auto === "1"}
    />
  );
}
