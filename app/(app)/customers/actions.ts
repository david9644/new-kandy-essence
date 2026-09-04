"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface CustomerInput {
  name: string;
  contact: string;
  opening_balance: number;
}

function validateCustomer(input: CustomerInput): string | null {
  if (!input.name.trim()) return "Name is required.";
  return null;
}

export async function createCustomer(input: CustomerInput) {
  const error = validateCustomer(input);
  if (error) return { error };

  const supabase = await createClient();

  const { data: customer, error: insertError } = await supabase
    .from("customers")
    .insert({
      code: "",
      name: input.name.trim(),
      contact: input.contact.trim() || null,
    })
    .select("id, code")
    .single();

  if (insertError || !customer) {
    return { error: insertError?.message ?? "Could not create customer." };
  }

  const { error: financialsError } = await supabase.from("customer_financials").insert({
    customer_id: customer.id,
    opening_balance: input.opening_balance,
  });

  if (financialsError) return { error: financialsError.message };

  revalidatePath("/customers");
  return { ok: true, id: customer.id, code: customer.code };
}

export async function updateCustomer(customerId: string, input: CustomerInput) {
  const error = validateCustomer(input);
  if (error) return { error };

  const supabase = await createClient();

  const { error: updateError } = await supabase
    .from("customers")
    .update({
      name: input.name.trim(),
      contact: input.contact.trim() || null,
    })
    .eq("id", customerId);

  if (updateError) return { error: updateError.message };

  const { error: financialsError } = await supabase
    .from("customer_financials")
    .update({ opening_balance: input.opening_balance })
    .eq("customer_id", customerId);

  if (financialsError) return { error: financialsError.message };

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

export async function setCustomerActive(customerId: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("customers").update({ active }).eq("id", customerId);
  if (error) return { error: error.message };
  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

export interface CustomerTransactionInput {
  date: string;
  amount: number;
  notes: string;
}

function validateTransaction(input: CustomerTransactionInput): string | null {
  if (!input.amount || input.amount <= 0) return "Amount must be greater than zero.";
  return null;
}

export async function createCustomerCredit(customerId: string, input: CustomerTransactionInput) {
  const error = validateTransaction(input);
  if (error) return { error };

  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc("create_customer_credit", {
    p_customer_id: customerId,
    p_date: input.date,
    p_amount: input.amount,
    p_notes: input.notes.trim(),
  });

  if (rpcError) return { error: rpcError.message };

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { ok: true };
}

export async function updateCustomerCredit(
  creditId: string,
  customerId: string,
  input: CustomerTransactionInput
) {
  const error = validateTransaction(input);
  if (error) return { error };

  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc("update_customer_credit", {
    p_credit_id: creditId,
    p_date: input.date,
    p_amount: input.amount,
    p_notes: input.notes.trim(),
  });

  if (rpcError) return { error: rpcError.message };

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { ok: true };
}

export async function deleteCustomerCredit(creditId: string, customerId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_customer_credit", { p_credit_id: creditId });
  if (error) return { error: error.message };
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { ok: true };
}

export async function createCustomerPayment(customerId: string, input: CustomerTransactionInput) {
  const error = validateTransaction(input);
  if (error) return { error };

  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc("create_customer_payment", {
    p_customer_id: customerId,
    p_date: input.date,
    p_amount: input.amount,
    p_notes: input.notes.trim(),
  });

  if (rpcError) return { error: rpcError.message };

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { ok: true };
}

export async function updateCustomerPayment(
  paymentId: string,
  customerId: string,
  input: CustomerTransactionInput
) {
  const error = validateTransaction(input);
  if (error) return { error };

  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc("update_customer_payment", {
    p_payment_id: paymentId,
    p_date: input.date,
    p_amount: input.amount,
    p_notes: input.notes.trim(),
  });

  if (rpcError) return { error: rpcError.message };

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { ok: true };
}

export async function deleteCustomerPayment(paymentId: string, customerId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_customer_payment", { p_payment_id: paymentId });
  if (error) return { error: error.message };
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  return { ok: true };
}
