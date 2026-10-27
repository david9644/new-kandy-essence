import Link from "next/link";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/shared/logout-button";
import { TillFrame } from "@/components/till/till-frame";

// The counter billing page: exactly one screen, no app nav, no footer. Only
// /billing/new and /billing/[invoiceId]/edit live in this group.
export default async function TillLayout({ children }: { children: React.ReactNode }) {
  // the profile check and the business name are independent: one round trip, not two
  const supabase = await createClient();
  const [profile, { data: settings }] = await Promise.all([
    requireProfile(),
    supabase.from("app_settings").select("business_name").eq("id", true).maybeSingle(),
  ]);
  const businessName = settings?.business_name?.trim() || "New Kandy Essence";

  const header = (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-3 py-2 md:px-4">
      <div className="min-w-0">
        <p className="truncate text-base font-semibold text-foreground">{businessName}</p>
        <p className="truncate text-xs text-muted">Billing &middot; {profile.full_name}</p>
      </div>
      <nav className="flex shrink-0 items-center gap-2">
        {/* prefetch off: each of these would make the server render the whole page in the
            background while the cashier is waiting for a print */}
        <Link
          href="/billing"
          prefetch={false}
          className="flex h-11 items-center rounded-lg border border-border px-3 text-sm font-medium text-foreground active:bg-background md:px-4"
        >
          Bills
        </Link>
        <Link
          href="/dashboard"
          prefetch={false}
          className="flex h-11 items-center rounded-lg border border-border px-3 text-sm font-medium text-foreground active:bg-background md:px-4"
        >
          <span className="sm:hidden">Home</span>
          <span className="hidden sm:inline">Dashboard</span>
        </Link>
        <LogoutButton />
      </nav>
    </header>
  );

  return <TillFrame header={header}>{children}</TillFrame>;
}
