// One-time setup: creates the first Owner account so PIN login has someone to
// log in as. Not reachable over HTTP -- run locally, once, before go-live:
//
//   npx tsx scripts/bootstrap-owner.ts --name "Jane Silva" --pin 1234
//
// Requires SUPABASE_SERVICE_ROLE_KEY and PIN_PEPPER in .env.local.

import { randomUUID, randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../lib/types/database.types";
import { hashPinForLookup, hashPinForStorage, isValidPinFormat } from "../lib/auth/pin";

try {
  process.loadEnvFile(".env.local");
} catch {
  // already loaded some other way (e.g. dotenv-style tooling), or running
  // from a directory without .env.local -- the checks below will catch it.
}

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const name = argValue("--name");
  const pin = argValue("--pin");

  if (!name || !pin) {
    console.error('Usage: npx tsx scripts/bootstrap-owner.ts --name "Owner Name" --pin 1234');
    process.exit(1);
  }

  if (!isValidPinFormat(pin)) {
    console.error("PIN must be 4-6 digits.");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey || !process.env.PIN_PEPPER) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or PIN_PEPPER in .env.local."
    );
    process.exit(1);
  }

  const admin = createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = `owner-${randomUUID()}@internal.local`;
  const password = randomBytes(32).toString("hex");

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (userError || !userData.user) {
    console.error("Failed to create auth user:", userError?.message);
    process.exit(1);
  }

  const userId = userData.user.id;

  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    full_name: name,
    role: "owner",
    active: true,
  });

  if (profileError) {
    console.error("Failed to create profile, rolling back auth user:", profileError.message);
    await admin.auth.admin.deleteUser(userId);
    process.exit(1);
  }

  const { error: credentialError } = await admin.from("profile_credentials").insert({
    profile_id: userId,
    pin_lookup_hash: hashPinForLookup(pin),
    pin_hash: await hashPinForStorage(pin),
  });

  if (credentialError) {
    console.error(
      "Failed to store PIN, rolling back profile and auth user:",
      credentialError.message
    );
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
    process.exit(1);
  }

  console.log(`Owner "${name}" created. They can log in with PIN ${pin}.`);
}

main();
