import Link from "next/link";
import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/units";
import { ChequeStatusControl } from "@/components/cheques/cheque-status-control";

export default async function ChequesPage() {
  await requireOwner();
  const supabase = await createClient();

  const { data: cheques } = await supabase
    .from("cheques")
    .select(
      "id, cheque_number, cheque_date, amount, status, source, supplier_id, suppliers(name), bank_accounts(name)"
    )
    .order("cheque_date", { ascending: false });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-foreground">Cheque Register</h1>
      <p className="mb-4 text-sm text-muted">
        Every cheque issued to a supplier, from purchases and payments alike. A bounced cheque
        automatically reverses its effect on that supplier&rsquo;s balance.
      </p>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-background text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Cheque No.</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Bank Account</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(cheques ?? []).map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium text-foreground">{c.cheque_number}</td>
                <td className="px-4 py-3 text-foreground">{c.cheque_date}</td>
                <td className="px-4 py-3 text-foreground">
                  <Link href={`/suppliers/${c.supplier_id}`} className="font-medium text-primary">
                    {(c.suppliers as { name: string } | null)?.name ?? "-"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">
                  {(c.bank_accounts as { name: string } | null)?.name ?? "-"}
                </td>
                <td className="px-4 py-3 capitalize text-muted">{c.source}</td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {formatCurrency(c.amount)}
                </td>
                <td className="px-4 py-3">
                  <ChequeStatusControl chequeId={c.id} status={c.status} />
                </td>
              </tr>
            ))}
            {(cheques ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  No cheques recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
