"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database.types";

export async function updateChequeStatus(
  chequeId: string,
  status: Database["public"]["Enums"]["cheque_status"]
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_cheque_status", {
    p_cheque_id: chequeId,
    p_status: status,
  });

  if (error) return { error: error.message };

  revalidatePath("/cheques");
  revalidatePath("/suppliers");
  revalidatePath("/payments");
  return { ok: true };
}
