import type { Json } from "@/lib/types/database.types";

export type DeletePinCode =
  | "not_set"
  | "wrong_pin"
  | "locked"
  | "invalid_pin"
  | "current_required";

export interface DeleteFailure {
  error: string;
  code?: DeletePinCode;
}

// Every delete_* RPC (and set_delete_pin) answers {"ok": true} or
// {"ok": false, "code", "message"} -- PIN problems come back as data, not as
// a raised exception, because a raise would roll back the failed-attempt
// counter and the lockout would never trigger (see migration 0025). Real
// failures (not found, stock already used...) still arrive as rpcError.
//
// Returns null when the call succeeded, otherwise the {error, code} to hand
// straight back to the client.
export function deleteFailure(
  data: Json | null,
  rpcError: { message: string } | null
): DeleteFailure | null {
  if (rpcError) return { error: rpcError.message };

  const result = data as { ok?: boolean; code?: DeletePinCode; message?: string } | null;
  if (result?.ok === true) return null;

  return {
    error: result?.message ?? "Could not verify the Delete PIN.",
    code: result?.code,
  };
}

export function isDeletePinFormat(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{4,6}$/.test(pin);
}
