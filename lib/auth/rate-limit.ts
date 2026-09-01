import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

const MAX_ATTEMPTS = 10;
const WINDOW_MINUTES = 5;

type AdminClient = SupabaseClient<Database>;

export async function isThrottled(admin: AdminClient, ip: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

  const { data } = await admin
    .from("login_attempts")
    .select("id, attempt_count")
    .eq("ip", ip)
    .gte("window_start", windowStart)
    .order("window_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.attempt_count ?? 0) >= MAX_ATTEMPTS;
}

export async function recordFailedAttempt(admin: AdminClient, ip: string): Promise<void> {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

  const { data: existing } = await admin
    .from("login_attempts")
    .select("id, attempt_count")
    .eq("ip", ip)
    .gte("window_start", windowStart)
    .order("window_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    await admin
      .from("login_attempts")
      .update({ attempt_count: existing.attempt_count + 1 })
      .eq("id", existing.id);
  } else {
    await admin.from("login_attempts").insert({ ip, attempt_count: 1 });
  }
}

export async function clearAttempts(admin: AdminClient, ip: string): Promise<void> {
  await admin.from("login_attempts").delete().eq("ip", ip);
}
