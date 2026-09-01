import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PaymentForm } from "@/components/payments/payment-form";
import { formatCurrency } from "@/lib/units";

export default async function PaymentsPage() {
  await requireOwner();
  const supabase = await createClient();

  const [{ data: suppliers }, { data: bankAccounts }, { data: recent }] = await Promise.all([
    supabase.from("suppliers").select("id, code, name").eq("active", true).order("name"),
    supabase.from("bank_accounts").select("id, name").eq("active", true).order("name"),
    supabase
      .from("supplier_payments")
      .select("id, date, amount, payment_type, suppliers(name)")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2">
      <div>
        <h1 className="mb-4 text-2xl font-semibold text-foreground">Supplier Payments</h1>
        <PaymentForm suppliers={suppliers ?? []} bankAccounts={bankAccounts ?? []} />
      </div>
      <div>
        <h2 className="mb-4 text-lg font-medium text-foreground">Recent Payments</h2>
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {(recent ?? []).map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-foreground">
                  {(p.suppliers as { name: string } | null)?.name}
                </p>
                <p className="text-xs capitalize text-muted">
                  {p.date} &middot; {p.payment_type}
                </p>
              </div>
              <span className="font-medium text-foreground">{formatCurrency(p.amount)}</span>
            </li>
          ))}
          {(recent ?? []).length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted">No payments yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
