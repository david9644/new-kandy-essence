import Link from "next/link";
import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { CustomersTable } from "@/components/customers/customers-table";

export default async function CustomersPage() {
  await requireOwner();
  const supabase = await createClient();

  const [{ data: customers }, { data: balances }] = await Promise.all([
    supabase.from("customers").select("id, code, name, contact").order("name"),
    supabase.rpc("get_customer_balances"),
  ]);

  const balanceByCustomer = new Map(
    (balances ?? []).map((b) => [b.customer_id, b.current_balance])
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Customers</h1>
        <Link
          href="/customers/new"
          className="flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground active:opacity-90"
        >
          + New Customer
        </Link>
      </div>
      <CustomersTable customers={customers ?? []} balanceByCustomer={balanceByCustomer} />
    </div>
  );
}
