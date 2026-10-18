import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { TillScreen } from "@/components/till/till-screen";
import { loadBillCustomers, loadBillShelf, todayIso } from "@/lib/billing-data";

export default async function NewBillPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [shelf, customers] = await Promise.all([loadBillShelf(supabase), loadBillCustomers(supabase)]);

  return (
    <TillScreen
      mode="create"
      initialShelf={shelf}
      customers={customers}
      isOwner={profile.role === "owner"}
      today={todayIso()}
    />
  );
}
