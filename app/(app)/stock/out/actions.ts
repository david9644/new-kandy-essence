"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface StockOutInput {
  item_id: string;
  quantity: number;
  unit_name: string;
  date: string;
}

export async function createStockOut(input: StockOutInput) {
  if (!input.item_id) return { error: "Select an item." };
  if (!(input.quantity > 0)) return { error: "Quantity must be greater than zero." };
  if (!input.date) return { error: "Select a date." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_stock_out", {
    p_item_id: input.item_id,
    p_quantity: input.quantity,
    p_unit_name: input.unit_name,
    p_date: input.date,
  });

  if (error) return { error: error.message };

  revalidatePath("/stock");
  revalidatePath("/stock/out");
  return { ok: true };
}
