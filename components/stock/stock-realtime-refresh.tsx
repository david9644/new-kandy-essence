"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Keeps stock screens live across both stations: any change to stock_batches
// (from a purchase, stock-out, adjustment, or opening stock entry on either
// PC) re-fetches this page's server data without a manual refresh.
//
// The realtime socket does NOT automatically inherit the browser client's
// auth session -- Supabase only evaluates postgres_changes against RLS using
// whatever JWT was last handed to `realtime.setAuth()` on that connection.
// Skipping this means the socket sits at the anon role forever, `SUBSCRIBED`
// fires normally, and every change is silently dropped by
// `stock_batches_select`'s `to authenticated` policy -- no error, no event.
// The token also needs refreshing on the same schedule as the auth session
// (~hourly), or a station left open overnight goes quietly dark.
export function StockRealtimeRefresh() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function setup() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      // React StrictMode runs this effect twice in dev (mount, cleanup,
      // mount again); the first pass's cleanup can fire while this await is
      // still pending. Bail out rather than subscribe a channel nothing will
      // ever clean up -- and race the second pass's channel of the same name
      // into "cannot add postgres_changes callbacks after subscribe()".
      if (cancelled) return;

      if (session) {
        supabase.realtime.setAuth(session.access_token);
      }

      channel = supabase
        .channel("stock-batches-changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "stock_batches" },
          () => router.refresh()
        )
        .subscribe();
    }

    setup();

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        supabase.realtime.setAuth(session.access_token);
      }
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      authSubscription.unsubscribe();
    };
  }, [router]);

  return null;
}
