import { requireOwner } from "@/lib/auth/session";
import { CustomerForm } from "@/components/customers/customer-form";
import { createCustomer } from "@/app/(app)/customers/actions";

export default async function NewCustomerPage() {
  await requireOwner();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-2xl font-semibold text-foreground">Add Customer</h1>
      <CustomerForm onSubmit={createCustomer} submitLabel="Create Customer" />
    </div>
  );
}
