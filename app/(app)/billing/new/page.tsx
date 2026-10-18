import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { BillingScreen } from "@/components/billing/billing-screen";
import { loadBillCustomers, loadBillItems, todayIso } from "@/lib/billing-data";

export default async function NewBillPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [items, customers] = await Promise.all([
    loadBillItems(supabase),
    loadBillCustomers(supabase),
  ]);

  return (
    <BillingScreen
      mode="create"
      items={items}
      customers={customers}
      isOwner={profile.role === "owner"}
      today={todayIso()}
    />
  );
}
