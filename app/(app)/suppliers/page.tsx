import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { SuppliersTable } from "@/components/suppliers/suppliers-table";

export default async function SuppliersPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, code, name, contact, active")
    .order("name");

  let balanceBySupplier: Map<string, number> | undefined;
  if (profile.role === "owner") {
    const { data: balances } = await supabase.rpc("get_supplier_balances");
    balanceBySupplier = new Map((balances ?? []).map((b) => [b.supplier_id, b.current_balance]));
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Suppliers</h1>
        {profile.role === "owner" && (
          <Link
            href="/suppliers/new"
            className="flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground active:opacity-90"
          >
            + Add Supplier
          </Link>
        )}
      </div>
      <SuppliersTable suppliers={suppliers ?? []} balanceBySupplier={balanceBySupplier} />
    </div>
  );
}
