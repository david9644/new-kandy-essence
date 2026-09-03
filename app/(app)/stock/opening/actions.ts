"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface OpeningStockInput {
  item_id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  unit_name: string;
  cost_price: number;
  notes: string;
}

export interface UpdateOpeningStockInput {
  batch_number: string;
  expiry_date: string;
  quantity: number;
  unit_name: string;
  cost_price: number;
  notes: string;
}

export async function createOpeningStock(input: OpeningStockInput) {
  if (!input.item_id) return { error: "Select an item." };
  if (!(input.quantity > 0)) return { error: "Quantity must be greater than zero." };
  if (!(input.cost_price >= 0)) return { error: "Cost price cannot be negative." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_opening_stock", {
    p_item_id: input.item_id,
    p_batch_number: input.batch_number.trim() || ("" as string),
    p_expiry_date: (input.expiry_date || null) as string,
    p_quantity: input.quantity,
    p_unit_name: input.unit_name,
    p_cost_price: input.cost_price,
    p_notes: (input.notes.trim() || null) as string,
  });

  if (error) return { error: error.message };

  revalidatePath("/stock");
  revalidatePath("/stock/opening");
  return { ok: true };
}

export async function updateOpeningStock(entryId: string, input: UpdateOpeningStockInput) {
  if (!(input.quantity > 0)) return { error: "Quantity must be greater than zero." };
  if (!(input.cost_price >= 0)) return { error: "Cost price cannot be negative." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_opening_stock", {
    p_entry_id: entryId,
    p_batch_number: input.batch_number.trim() || ("" as string),
    p_expiry_date: (input.expiry_date || null) as string,
    p_quantity: input.quantity,
    p_unit_name: input.unit_name,
    p_cost_price: input.cost_price,
    p_notes: (input.notes.trim() || null) as string,
  });

  if (error) return { error: error.message };

  revalidatePath("/stock");
  revalidatePath("/stock/opening");
  revalidatePath(`/stock/opening/${entryId}`);
  return { ok: true };
}

export async function deleteOpeningStock(entryId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_opening_stock", { p_entry_id: entryId });
  if (error) return { error: error.message };

  revalidatePath("/stock");
  revalidatePath("/stock/opening");
  redirect("/stock/opening");
}
