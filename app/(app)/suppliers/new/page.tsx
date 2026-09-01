import { requireOwner } from "@/lib/auth/session";
import { SupplierForm } from "@/components/suppliers/supplier-form";
import { createSupplier } from "@/app/(app)/suppliers/actions";

export default async function NewSupplierPage() {
  await requireOwner();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-2xl font-semibold text-foreground">Add Supplier</h1>
      <SupplierForm onSubmit={createSupplier} submitLabel="Create Supplier" />
    </div>
  );
}
