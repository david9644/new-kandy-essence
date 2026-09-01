"use server";

import { revalidatePath } from "next/cache";
import { randomUUID, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/auth/session";
import { hashPinForLookup, hashPinForStorage, isValidPinFormat } from "@/lib/auth/pin";
import type { Database } from "@/lib/types/database.types";

async function requireOwnerOrError() {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "owner") {
    return { error: "Only the owner can manage users." } as const;
  }
  return null;
}

export interface CreateUserInput {
  full_name: string;
  role: Database["public"]["Enums"]["user_role"];
  pin: string;
}

export async function createUser(input: CreateUserInput) {
  const denied = await requireOwnerOrError();
  if (denied) return denied;

  if (!input.full_name.trim()) return { error: "Name is required." };
  if (!isValidPinFormat(input.pin)) return { error: "PIN must be 4-6 digits." };

  const admin = createAdminClient();
  const pinLookupHash = hashPinForLookup(input.pin);

  const { data: existing } = await admin
    .from("profile_credentials")
    .select("profile_id")
    .eq("pin_lookup_hash", pinLookupHash)
    .maybeSingle();
  if (existing) return { error: "That PIN is already in use by another active user." };

  const email = `user-${randomUUID()}@internal.local`;
  const password = randomBytes(32).toString("hex");

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userError || !userData.user) {
    return { error: userError?.message ?? "Could not create the login." };
  }

  const userId = userData.user.id;

  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    full_name: input.full_name.trim(),
    role: input.role,
    active: true,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    return { error: profileError.message };
  }

  const { error: credError } = await admin.from("profile_credentials").insert({
    profile_id: userId,
    pin_lookup_hash: pinLookupHash,
    pin_hash: await hashPinForStorage(input.pin),
  });
  if (credError) {
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
    return { error: credError.message };
  }

  revalidatePath("/users");
  return { ok: true };
}

export async function setUserActive(profileId: string, active: boolean) {
  const denied = await requireOwnerOrError();
  if (denied) return denied;

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ active }).eq("id", profileId);
  if (error) return { error: error.message };

  if (!active) {
    // Free up the PIN for reuse; re-enabling requires assigning a fresh one.
    await admin.from("profile_credentials").delete().eq("profile_id", profileId);
  }

  revalidatePath("/users");
  return { ok: true };
}

export async function resetUserPin(profileId: string, pin: string) {
  const denied = await requireOwnerOrError();
  if (denied) return denied;

  if (!isValidPinFormat(pin)) return { error: "PIN must be 4-6 digits." };

  const admin = createAdminClient();
  const pinLookupHash = hashPinForLookup(pin);

  const { data: existing } = await admin
    .from("profile_credentials")
    .select("profile_id")
    .eq("pin_lookup_hash", pinLookupHash)
    .neq("profile_id", profileId)
    .maybeSingle();
  if (existing) return { error: "That PIN is already in use by another active user." };

  const { error } = await admin.from("profile_credentials").upsert({
    profile_id: profileId,
    pin_lookup_hash: pinLookupHash,
    pin_hash: await hashPinForStorage(pin),
  });
  if (error) return { error: error.message };

  revalidatePath("/users");
  return { ok: true };
}
