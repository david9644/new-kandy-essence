"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface StockAdjustmentInput {
  item_id: string;
  stock_batch_id: string;
  quantity_change: number;
  reason: string;
  date: string;
}

export async function createStockAdjustment(input: StockAdjustmentInput) {
  if (!input.item_id) return { error: "Select an item." };
  if (!input.stock_batch_id) return { error: "Select a batch." };
  if (!input.quantity_change) return { error: "Enter a non-zero quantity change." };
  if (!input.reason.trim()) return { error: "A reason is required." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_stock_adjustment", {
    p_item_id: input.item_id,
    p_stock_batch_id: input.stock_batch_id,
    p_quantity_change: input.quantity_change,
    p_reason: input.reason.trim(),
    p_date: input.date,
  });

  if (error) return { error: error.message };

  revalidatePath("/stock");
  revalidatePath("/stock/adjustments");
  return { ok: true };
}
