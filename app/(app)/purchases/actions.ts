"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database.types";

export interface PurchaseLineInput {
  item_id: string;
  batch_number: string | null;
  expiry_date: string | null;
  quantity: number;
  unit_name: string;
  unit_cost: number;
}

export interface ChequeInput {
  bank_account_id: string;
  cheque_number: string;
  cheque_date: string;
  amount: number;
}

export interface PurchaseInput {
  supplier_id: string;
  date: string;
  payment_type: Database["public"]["Enums"]["purchase_payment_type"];
  reference_no: string;
  notes: string;
  cheque: ChequeInput | null;
  lines: PurchaseLineInput[];
}

function validate(input: PurchaseInput): string | null {
  if (!input.supplier_id) return "Select a supplier.";
  if (!input.date) return "Select a date.";
  if (input.lines.length === 0) return "Add at least one line item.";
  for (const line of input.lines) {
    if (!line.item_id) return "Every line needs an item.";
    if (!(line.quantity > 0)) return "Quantity must be greater than zero.";
    if (!(line.unit_cost >= 0)) return "Unit cost cannot be negative.";
  }
  if (input.payment_type === "cheque") {
    if (!input.cheque) return "Enter the cheque details.";
    if (!input.cheque.bank_account_id) return "Select which bank account the cheque is from.";
    if (!input.cheque.cheque_number.trim()) return "Enter the cheque number.";
    if (!input.cheque.cheque_date) return "Enter the cheque date.";
    if (!(input.cheque.amount > 0)) return "Cheque amount must be greater than zero.";
  }
  return null;
}

export async function createPurchase(input: PurchaseInput) {
  const error = validate(input);
  if (error) return { error };

  const supabase = await createClient();

  const { data: purchaseId, error: rpcError } = await supabase.rpc("create_purchase", {
    p_supplier_id: input.supplier_id,
    p_date: input.date,
    p_payment_type: input.payment_type,
    p_reference_no: (input.reference_no.trim() || null) as string,
    p_notes: (input.notes.trim() || null) as string,
    p_cheque:
      input.payment_type === "cheque" && input.cheque
        ? {
            bank_account_id: input.cheque.bank_account_id,
            cheque_number: input.cheque.cheque_number.trim(),
            cheque_date: input.cheque.cheque_date,
            amount: input.cheque.amount,
          }
        : null,
    p_line_items: input.lines.map((line) => ({
      item_id: line.item_id,
      batch_number: line.batch_number,
      expiry_date: line.expiry_date,
      quantity: line.quantity,
      unit_name: line.unit_name,
      unit_cost: line.unit_cost,
    })),
  });

  if (rpcError || !purchaseId) {
    return { error: rpcError?.message ?? "Could not save the purchase." };
  }

  revalidatePath("/purchases");
  revalidatePath("/stock");
  return { ok: true };
}

export async function updatePurchaseHeader(
  purchaseId: string,
  input: { date: string; reference_no: string; notes: string }
) {
  if (!input.date) return { error: "Select a date." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_purchase_header", {
    p_purchase_id: purchaseId,
    p_date: input.date,
    p_reference_no: (input.reference_no.trim() || null) as string,
    p_notes: (input.notes.trim() || null) as string,
  });

  if (error) return { error: error.message };

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${purchaseId}`);
  return { ok: true };
}

export async function deletePurchase(purchaseId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_purchase", { p_purchase_id: purchaseId });
  if (error) return { error: error.message };

  revalidatePath("/purchases");
  revalidatePath("/stock");
  redirect("/purchases");
}
