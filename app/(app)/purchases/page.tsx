import Link from "next/link";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/units";

export default async function PurchasesPage() {
  await requireProfile();
  const supabase = await createClient();

  const { data: purchases } = await supabase
    .from("purchases")
    .select("id, purchase_no, date, payment_type, total_amount, suppliers(name)")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Purchases</h1>
        <Link
          href="/purchases/new"
          className="flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground active:opacity-90"
        >
          + New Purchase
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-background text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {(purchases ?? []).map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <Link href={`/purchases/${p.id}`} className="font-medium text-primary">
                    #{p.purchase_no}
                  </Link>
                </td>
                <td className="px-4 py-3 text-foreground">{p.date}</td>
                <td className="px-4 py-3 text-foreground">
                  {(p.suppliers as { name: string } | null)?.name ?? "-"}
                </td>
                <td className="px-4 py-3 capitalize text-muted">{p.payment_type}</td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {formatCurrency(p.total_amount)}
                </td>
              </tr>
            ))}
            {(purchases ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No purchases yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
