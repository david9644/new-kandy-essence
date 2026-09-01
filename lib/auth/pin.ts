import { createHmac } from "crypto";
import bcrypt from "bcryptjs";

const PIN_PATTERN = /^\d{4,6}$/;

export function isValidPinFormat(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

function pepper(): string {
  const secret = process.env.PIN_PEPPER;
  if (!secret) {
    throw new Error("PIN_PEPPER is not set in the environment.");
  }
  return secret;
}

// Deterministic, indexable -- used for the O(1) profile_credentials lookup by
// pin_lookup_hash. Never used as the sole proof of a correct PIN; pin_hash
// (bcrypt) below is checked too, against just the one matched row.
export function hashPinForLookup(pin: string): string {
  return createHmac("sha256", pepper()).update(pin).digest("hex");
}

export async function hashPinForStorage(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  return bcrypt.compare(pin, storedHash);
}
