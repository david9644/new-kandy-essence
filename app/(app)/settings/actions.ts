"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth/session";
import { isValidPinFormat, verifyPin } from "@/lib/auth/pin";
import { clearAttempts, isThrottled, recordFailedAttempt } from "@/lib/auth/rate-limit";
import { deleteFailure } from "@/lib/delete-pin";

export async function createBankAccount(name: string) {
  if (!name.trim()) return { error: "Account name is required." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bank_accounts")
    .insert({ name: name.trim() })
    .select("id, name")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create bank account." };
  revalidatePath("/settings");
  return { ok: true, id: data.id, name: data.name };
}

export async function setBankAccountActive(id: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("bank_accounts").update({ active }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateAppSettings(dailyChequeLimit: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({ daily_cheque_limit: dailyChequeLimit })
    .eq("id", true);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

// ── Delete PIN ─────────────────────────────────────────────────────────────
// A separate owner-only PIN required for every delete (migration 0025). The
// PIN is hashed and verified inside the database; the browser never gets it
// back. These actions never log or echo it.

async function getOwnerProfile() {
  const profile = await getCurrentProfile();
  return profile && profile.role === "owner" ? profile : null;
}

// The Delete PIN has to differ from the owner's login PIN. Compared against
// the stored login bcrypt hash (service role, server only).
async function matchesLoginPin(profileId: string, pin: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profile_credentials")
    .select("pin_hash")
    .eq("profile_id", profileId)
    .maybeSingle();
  return data ? verifyPin(pin, data.pin_hash) : false;
}

// First time: no currentPin. Changing: currentPin = the current Delete PIN.
export async function setDeletePin(newPin: string, currentPin?: string) {
  const owner = await getOwnerProfile();
  if (!owner) return { error: "Only the owner can set the Delete PIN." };
  if (!isValidPinFormat(newPin)) return { error: "The Delete PIN must be 4-6 digits." };
  if (await matchesLoginPin(owner.id, newPin)) {
    return { error: "The Delete PIN must be different from your login PIN." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_delete_pin", {
    p_new_pin: newPin,
    p_current_pin: currentPin,
  });
  const failure = deleteFailure(data, error);
  if (failure) return failure;

  revalidatePath("/settings");
  return { ok: true };
}

// Forgotten Delete PIN: allowed only after re-confirming the owner's LOGIN
// PIN (checked here against the stored bcrypt hash, throttled like the login
// screen). The reset itself is a service-role-only function, so there is no
// way to reach it from the browser without this check.
export async function resetDeletePin(loginPin: string, newPin: string) {
  const owner = await getOwnerProfile();
  if (!owner) return { error: "Only the owner can reset the Delete PIN." };
  if (!isValidPinFormat(loginPin)) return { error: "Enter your 4-6 digit login PIN." };
  if (!isValidPinFormat(newPin)) return { error: "The Delete PIN must be 4-6 digits." };

  const admin = createAdminClient();
  const throttleKey = `delete-pin-reset:${owner.id}`;
  if (await isThrottled(admin, throttleKey)) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }

  if (!(await matchesLoginPin(owner.id, loginPin))) {
    await recordFailedAttempt(admin, throttleKey);
    return { error: "Incorrect login PIN." };
  }
  await clearAttempts(admin, throttleKey);

  if (await matchesLoginPin(owner.id, newPin)) {
    return { error: "The Delete PIN must be different from your login PIN." };
  }

  const { error } = await admin.rpc("admin_reset_delete_pin", {
    p_owner_id: owner.id,
    p_new_pin: newPin,
  });
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
