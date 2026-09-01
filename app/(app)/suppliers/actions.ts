"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface SupplierInput {
  name: string;
  contact: string;
  address: string;
  opening_balance: number;
}

function validate(input: SupplierInput): string | null {
  if (!input.name.trim()) return "Name is required.";
  return null;
}

export async function createSupplier(input: SupplierInput) {
  const error = validate(input);
  if (error) return { error };

  const supabase = await createClient();

  const { data: supplier, error: insertError } = await supabase
    .from("suppliers")
    .insert({
      code: "",
      name: input.name.trim(),
      contact: input.contact.trim() || null,
      address: input.address.trim() || null,
    })
    .select("id")
    .single();

  if (insertError || !supplier) {
    return { error: insertError?.message ?? "Could not create supplier." };
  }

  const { error: financialsError } = await supabase.from("supplier_financials").insert({
    supplier_id: supplier.id,
    opening_balance: input.opening_balance,
  });

  if (financialsError) return { error: financialsError.message };

  revalidatePath("/suppliers");
  redirect(`/suppliers/${supplier.id}`);
}

export async function updateSupplier(supplierId: string, input: SupplierInput) {
  const error = validate(input);
  if (error) return { error };

  const supabase = await createClient();

  const { error: updateError } = await supabase
    .from("suppliers")
    .update({
      name: input.name.trim(),
      contact: input.contact.trim() || null,
      address: input.address.trim() || null,
    })
    .eq("id", supplierId);

  if (updateError) return { error: updateError.message };

  const { error: financialsError } = await supabase
    .from("supplier_financials")
    .update({ opening_balance: input.opening_balance })
    .eq("supplier_id", supplierId);

  if (financialsError) return { error: financialsError.message };

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${supplierId}`);
  return { ok: true };
}

export async function setSupplierActive(supplierId: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").update({ active }).eq("id", supplierId);
  if (error) return { error: error.message };
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${supplierId}`);
  return { ok: true };
}
