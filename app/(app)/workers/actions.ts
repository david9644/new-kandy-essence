"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface WorkerInput {
  name: string;
  contact: string;
  position: string;
  monthly_salary: number | null;
}

function validateWorker(input: WorkerInput): string | null {
  if (!input.name.trim()) return "Name is required.";
  return null;
}

export async function createWorker(input: WorkerInput) {
  const error = validateWorker(input);
  if (error) return { error };

  const supabase = await createClient();

  const { data: worker, error: insertError } = await supabase
    .from("workers")
    .insert({
      code: "",
      name: input.name.trim(),
      contact: input.contact.trim() || null,
      position: input.position.trim() || null,
      monthly_salary: input.monthly_salary,
    })
    .select("id, code")
    .single();

  if (insertError || !worker) {
    return { error: insertError?.message ?? "Could not create worker." };
  }

  revalidatePath("/workers");
  return { ok: true, id: worker.id, code: worker.code };
}

export async function updateWorker(workerId: string, input: WorkerInput) {
  const error = validateWorker(input);
  if (error) return { error };

  const supabase = await createClient();

  const { error: updateError } = await supabase
    .from("workers")
    .update({
      name: input.name.trim(),
      contact: input.contact.trim() || null,
      position: input.position.trim() || null,
      monthly_salary: input.monthly_salary,
    })
    .eq("id", workerId);

  if (updateError) return { error: updateError.message };

  revalidatePath("/workers");
  revalidatePath(`/workers/${workerId}`);
  return { ok: true };
}

export async function setWorkerActive(workerId: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("workers").update({ active }).eq("id", workerId);
  if (error) return { error: error.message };
  revalidatePath("/workers");
  revalidatePath(`/workers/${workerId}`);
  return { ok: true };
}

export interface SalaryPaymentInput {
  date: string;
  period: string;
  amount: number;
  notes: string;
}

function validateSalaryPayment(input: SalaryPaymentInput): string | null {
  if (!input.amount || input.amount <= 0) return "Amount must be greater than zero.";
  return null;
}

export async function createSalaryPayment(workerId: string, input: SalaryPaymentInput) {
  const error = validateSalaryPayment(input);
  if (error) return { error };

  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc("create_salary_payment", {
    p_worker_id: workerId,
    p_date: input.date,
    p_amount: input.amount,
    p_period: input.period.trim(),
    p_notes: input.notes.trim(),
  });

  if (rpcError) return { error: rpcError.message };

  revalidatePath(`/workers/${workerId}`);
  revalidatePath("/workers");
  return { ok: true };
}

export async function updateSalaryPayment(
  paymentId: string,
  workerId: string,
  input: SalaryPaymentInput
) {
  const error = validateSalaryPayment(input);
  if (error) return { error };

  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc("update_salary_payment", {
    p_payment_id: paymentId,
    p_date: input.date,
    p_amount: input.amount,
    p_period: input.period.trim(),
    p_notes: input.notes.trim(),
  });

  if (rpcError) return { error: rpcError.message };

  revalidatePath(`/workers/${workerId}`);
  revalidatePath("/workers");
  return { ok: true };
}

export async function deleteSalaryPayment(paymentId: string, workerId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_salary_payment", { p_payment_id: paymentId });
  if (error) return { error: error.message };
  revalidatePath(`/workers/${workerId}`);
  revalidatePath("/workers");
  return { ok: true };
}
