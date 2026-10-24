import { lineAmounts } from "@/lib/line-price";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatQuantity } from "@/lib/units";
import { BackButton } from "@/components/shared/back-button";
import { ConfirmDeleteButton } from "@/components/shared/confirm-delete-button";
import { cancelInvoice } from "@/app/(app)/billing/actions";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  cheque: "Cheque",
  bank_transfer: "Bank transfer",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();
  const isOwner = profile.role === "owner";

  // Deleted ("cancelled") bills are hidden from the API by RLS, so a direct
  // URL to one lands on "not found" like any other missing page.
  const [{ data: invoice }, { data: lines }, { data: payments }, { data: settings }] =
    await Promise.all([
      supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle(),
      supabase
        .from("invoice_items")
        .select(
          "id, line_no, unit_name, quantity, unit_price, line_discount, line_total, list_unit_price, items(name, code)"
        )
        .eq("invoice_id", invoiceId)
        .order("line_no"),
      supabase
        .from("invoice_payments")
        .select("id, method, amount, cheque_number, cheque_bank, cheque_date, reference")
        .eq("invoice_id", invoiceId)
        .order("created_at"),
      supabase
        .from("app_settings")
        .select("business_name, business_address, business_phone1, business_phone2")
        .eq("id", true)
        .maybeSingle(),
    ]);

  if (!invoice) notFound();

  const phones = [settings?.business_phone1, settings?.business_phone2].filter(Boolean).join(" / ");

  return (
    <div className="mx-auto max-w-3xl">
      <BackButton href="/billing" />

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{invoice.invoice_no}</h1>
          <p className="text-sm text-muted">
            {invoice.date} &middot;{" "}
            {invoice.customer_id && invoice.customer_name ? (
              isOwner ? (
                <Link href={`/customers/${invoice.customer_id}`} className="font-medium text-primary">
                  {invoice.customer_name} ({invoice.customer_code})
                </Link>
              ) : (
                <span className="text-foreground">
                  {invoice.customer_name} ({invoice.customer_code})
                </span>
              )
            ) : (
              <span className="text-foreground">Walk-in</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href="/billing/new"
            className="flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            New Bill
          </Link>
          <Link
            href={`/billing/${invoice.id}/print`}
            className="flex h-11 items-center rounded-lg border border-primary px-4 text-sm font-medium text-primary active:bg-background"
          >
            Print
          </Link>
          {isOwner && (
            <>
              <Link
                href={`/billing/${invoice.id}/edit`}
                className="flex h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground active:bg-background"
              >
                Edit
              </Link>
              <ConfirmDeleteButton
                label="Delete bill"
                onDelete={cancelInvoice.bind(null, invoice.id)}
              />
            </>
          )}
        </div>
      </div>

      {(settings?.business_name || settings?.business_address || phones) && (
        <div className="mb-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
          {settings?.business_name && (
            <p className="font-semibold text-foreground">{settings.business_name}</p>
          )}
          {settings?.business_address && (
            <p className="whitespace-pre-line text-muted">{settings.business_address}</p>
          )}
          {phones && <p className="text-muted">{phones}</p>}
        </div>
      )}

      <div className="mb-4 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-background text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Unit price</th>
              <th className="px-4 py-3 text-right">Discount</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {(lines ?? []).map((l) => {
              const item = l.items as { name: string; code: string } | null;
              const amounts = lineAmounts({
                quantity: l.quantity,
                unitPrice: l.unit_price,
                listUnitPrice: l.list_unit_price,
                lineTotal: l.line_total,
              });
              return (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-4 py-3 text-muted">{l.line_no}</td>
                  <td className="px-4 py-3 text-foreground">{item?.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatQuantity(l.quantity)} {l.unit_name}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatCurrency(l.unit_price)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted">
                    {l.line_discount ? formatCurrency(l.line_discount) : "-"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                    {amounts.struck && (
                      <span
                        className="block text-xs font-normal text-muted line-through"
                        aria-label={`normal price ${formatCurrency(amounts.normalAmount)}`}
                      >
                        {formatCurrency(amounts.normalAmount)}
                      </span>
                    )}
                    {formatCurrency(l.line_total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4 text-sm">
          <h2 className="mb-2 font-medium text-foreground">Payment</h2>
          <ul className="flex flex-col gap-1.5">
            {(payments ?? []).map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3">
                <span className="text-foreground">
                  {METHOD_LABEL[p.method] ?? p.method}
                  {p.method === "cheque" && (
                    <span className="block text-xs text-muted">
                      No. {p.cheque_number} &middot; {p.cheque_bank} &middot; {p.cheque_date}
                    </span>
                  )}
                  {p.method === "bank_transfer" && p.reference && (
                    <span className="block text-xs text-muted">Ref {p.reference}</span>
                  )}
                </span>
                <span className="tabular-nums text-foreground">{formatCurrency(p.amount)}</span>
              </li>
            ))}
            {invoice.credit_amount > 0 && (
              <li className="flex items-center justify-between gap-3">
                <span className="font-medium text-warning">Credit (unpaid)</span>
                <span className="tabular-nums font-medium text-warning">
                  {formatCurrency(invoice.credit_amount)}
                </span>
              </li>
            )}
            {(payments ?? []).length === 0 && invoice.credit_amount === 0 && (
              <li className="text-muted">-</li>
            )}
          </ul>
          {invoice.notes && (
            <p className="mt-3 border-t border-border pt-2 text-muted">Notes: {invoice.notes}</p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 text-sm">
          <dl className="flex flex-col gap-1.5">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="tabular-nums text-foreground">{formatCurrency(invoice.subtotal)}</dd>
            </div>
            {invoice.line_discount_total > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted">Line discounts</dt>
                <dd className="tabular-nums text-foreground">
                  - {formatCurrency(invoice.line_discount_total)}
                </dd>
              </div>
            )}
            {invoice.bill_discount > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted">Bill discount</dt>
                <dd className="tabular-nums text-foreground">
                  - {formatCurrency(invoice.bill_discount)}
                </dd>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t border-border pt-2 text-lg">
              <dt className="font-semibold text-foreground">Total</dt>
              <dd className="tabular-nums font-bold text-foreground">
                {formatCurrency(invoice.total)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Paid</dt>
              <dd className="tabular-nums text-foreground">{formatCurrency(invoice.paid_amount)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
