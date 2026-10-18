import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database.types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

// Wrapped in React's per-request cache: the layout and the page both ask for
// the signed-in profile while rendering ONE request, and now share a single
// getUser() + get_own_profile() instead of each doing their own. The cache
// lives only for that request (never across requests or users), so every
// request still verifies the session with Supabase Auth.
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();

  // getUser() and get_own_profile() run concurrently: the profile lookup
  // resolves via auth.uid() (from the JWT PostgREST already validated for
  // this request), so it doesn't need to wait on user.id from getUser().
  // getUser()'s network-verified result is still the sole authority on
  // whether the caller is actually signed in -- the profile fetch never
  // substitutes for it, it just no longer blocks behind it.
  const [
    {
      data: { user },
    },
    { data: profile },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_own_profile").maybeSingle(),
  ]);

  if (!user || !profile || profile.id !== user.id) return null;

  return profile;
});

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

export async function requireOwner(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "owner") redirect("/dashboard");
  return profile;
}
