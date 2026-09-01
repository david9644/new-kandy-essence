import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { SupplierForm } from "@/components/suppliers/supplier-form";
import { updateSupplier, setSupplierActive } from "@/app/(app)/suppliers/actions";
import { ActiveToggleButton } from "@/components/items/active-toggle-button";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const { supplierId } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: supplier }, { data: financials }] = await Promise.all([
    supabase.from("suppliers").select("*").eq("id", supplierId).maybeSingle(),
    supabase
      .from("supplier_financials")
      .select("opening_balance")
      .eq("supplier_id", supplierId)
      .maybeSingle(),
  ]);

  if (!supplier) notFound();

  const boundUpdate = updateSupplier.bind(null, supplierId);

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{supplier.name}</h1>
          <p className="text-sm text-muted">{supplier.code}</p>
        </div>
        {profile.role === "owner" && (
          <ActiveToggleButton
            active={supplier.active}
            onToggle={setSupplierActive.bind(null, supplierId, !supplier.active)}
          />
        )}
      </div>

      {profile.role === "owner" && (
        <Link
          href={`/suppliers/${supplierId}/ledger`}
          className="mb-4 inline-flex h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground active:bg-background"
        >
          View Ledger &amp; Balance
        </Link>
      )}

      {profile.role === "owner" ? (
        <SupplierForm
          initial={{
            name: supplier.name,
            contact: supplier.contact ?? "",
            address: supplier.address ?? "",
            opening_balance: financials?.opening_balance ?? 0,
          }}
          onSubmit={boundUpdate}
          submitLabel="Save Changes"
        />
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border border-border bg-surface p-4 text-sm">
          <dt className="text-muted">Contact</dt>
          <dd className="text-foreground">{supplier.contact ?? "-"}</dd>
          <dt className="text-muted">Address</dt>
          <dd className="text-foreground">{supplier.address ?? "-"}</dd>
        </dl>
      )}
    </div>
  );
}
