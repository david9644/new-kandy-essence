"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createBankAccount(name: string) {
  if (!name.trim()) return { error: "Account name is required." };
  const supabase = await createClient();
  const { error } = await supabase.from("bank_accounts").insert({ name: name.trim() });
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function setBankAccountActive(id: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("bank_accounts").update({ active }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}
