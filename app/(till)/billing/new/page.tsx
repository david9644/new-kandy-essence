import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { TillScreen } from "@/components/till/till-screen";
import { loadBillCustomers, loadBillShelf, todayIso } from "@/lib/billing-data";

// ?c=1 : the till is coming back from a saved bill's print view. It already holds the shelf
// and the customers in the browser, so the server does not read and send them again
// (large on a big shop): the till shows the fresh bill from memory and refreshes in the
// background.
export default async function NewBillPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const [profile, { c }] = await Promise.all([requireProfile(), searchParams]);

  if (c === "1") {
    return (
      <TillScreen
        mode="create"
        initialShelf={null}
        fromMemory
        customers={[]}
        isOwner={profile.role === "owner"}
        today={todayIso()}
      />
    );
  }

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
