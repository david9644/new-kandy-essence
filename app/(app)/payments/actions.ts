"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database.types";

export interface PaymentChequeInput {
  bank_account_id: string;
  cheque_number: string;
  cheque_date: string;
  amount: number;
}

export interface SupplierPaymentInput {
  supplier_id: string;
  date: string;
  amount: number;
  payment_type: Database["public"]["Enums"]["payment_method"];
  cheque: PaymentChequeInput | null;
  notes: string;
}

// Editing a payment can't move it to a different supplier, so this omits
// supplier_id rather than carrying an unused placeholder value.
export interface UpdateSupplierPaymentInput {
  date: string;
  amount: number;
  payment_type: Database["public"]["Enums"]["payment_method"];
  cheque: PaymentChequeInput | null;
  notes: string;
}

export async function createSupplierPayment(input: SupplierPaymentInput) {
  if (!input.supplier_id) return { error: "Select a supplier." };
  if (!(input.amount > 0)) return { error: "Amount must be greater than zero." };
  if (input.payment_type === "cheque") {
    if (!input.cheque?.bank_account_id) return { error: "Select which bank account the cheque is from." };
    if (!input.cheque.cheque_number.trim()) return { error: "Enter the cheque number." };
    if (!input.cheque.cheque_date) return { error: "Enter the cheque date." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_supplier_payment", {
    p_supplier_id: input.supplier_id,
    p_date: input.date,
    p_amount: input.amount,
    p_payment_type: input.payment_type,
    p_cheque:
      input.payment_type === "cheque" && input.cheque
        ? {
            bank_account_id: input.cheque.bank_account_id,
            cheque_number: input.cheque.cheque_number.trim(),
            cheque_date: input.cheque.cheque_date,
            amount: input.amount,
          }
        : null,
    p_notes: (input.notes.trim() || null) as string,
  });

  if (error) return { error: error.message };

  revalidatePath("/payments");
  revalidatePath("/cheques");
  revalidatePath("/suppliers");
  return { ok: true };
}

export async function updateSupplierPayment(paymentId: string, input: UpdateSupplierPaymentInput) {
  if (!(input.amount > 0)) return { error: "Amount must be greater than zero." };
  if (input.payment_type === "cheque") {
    if (!input.cheque?.bank_account_id) return { error: "Select which bank account the cheque is from." };
    if (!input.cheque.cheque_number.trim()) return { error: "Enter the cheque number." };
    if (!input.cheque.cheque_date) return { error: "Enter the cheque date." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_supplier_payment", {
    p_payment_id: paymentId,
    p_date: input.date,
    p_amount: input.amount,
    p_payment_type: input.payment_type,
    p_cheque:
      input.payment_type === "cheque" && input.cheque
        ? {
            bank_account_id: input.cheque.bank_account_id,
            cheque_number: input.cheque.cheque_number.trim(),
            cheque_date: input.cheque.cheque_date,
            amount: input.amount,
          }
        : null,
    p_notes: (input.notes.trim() || null) as string,
  });

  if (error) return { error: error.message };

  revalidatePath("/payments");
  revalidatePath(`/payments/${paymentId}`);
  revalidatePath("/cheques");
  revalidatePath("/suppliers");
  return { ok: true };
}

export async function deleteSupplierPayment(paymentId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_supplier_payment", { p_payment_id: paymentId });
  if (error) return { error: error.message };

  revalidatePath("/payments");
  revalidatePath("/cheques");
  revalidatePath("/suppliers");
  redirect("/payments");
}
