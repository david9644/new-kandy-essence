import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database.types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export async function getCurrentProfile(): Promise<Profile | null> {
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
}

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
