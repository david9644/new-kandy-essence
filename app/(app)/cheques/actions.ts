"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database.types";

export async function updateChequeStatus(
  chequeId: string,
  status: Database["public"]["Enums"]["cheque_status"]
) {
  const supabase = await createClient();

  // A bounced/cleared status change affects this cheque's supplier's ledger
  // balance, so that supplier's page needs revalidating specifically --
  // fetched before the update since update_cheque_status doesn't return it.
  const { data: cheque } = await supabase
    .from("cheques")
    .select("supplier_id")
    .eq("id", chequeId)
    .maybeSingle();

  const { error } = await supabase.rpc("update_cheque_status", {
    p_cheque_id: chequeId,
    p_status: status,
  });

  if (error) return { error: error.message };

  revalidatePath("/cheques");
  revalidatePath("/suppliers");
  if (cheque?.supplier_id) revalidatePath(`/suppliers/${cheque.supplier_id}`);
  return { ok: true };
}
