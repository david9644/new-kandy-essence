"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface UnitInput {
  unit_name: string;
  conversion_factor_to_base: number;
}

export interface ItemInput {
  name: string;
  category_id: string | null;
  base_unit: string;
  reorder_level: number;
  batch_tracked: boolean;
  units: UnitInput[];
}

function validate(input: ItemInput): string | null {
  if (!input.name.trim()) return "Name is required.";
  if (!input.base_unit.trim()) return "Base unit is required.";
  if (input.reorder_level < 0) return "Reorder level cannot be negative.";
  for (const u of input.units) {
    if (!u.unit_name.trim()) return "Every secondary unit needs a name.";
    if (u.unit_name.trim().toLowerCase() === input.base_unit.trim().toLowerCase()) {
      return `"${u.unit_name}" is already the base unit.`;
    }
    if (!(u.conversion_factor_to_base > 0)) {
      return `Conversion factor for "${u.unit_name}" must be greater than zero.`;
    }
  }
  return null;
}

export async function createItem(input: ItemInput) {
  const error = validate(input);
  if (error) return { error };

  const supabase = await createClient();

  const { data: item, error: insertError } = await supabase
    .from("items")
    .insert({
      code: "",
      name: input.name.trim(),
      category_id: input.category_id,
      base_unit: input.base_unit.trim(),
      reorder_level: input.reorder_level,
      batch_tracked: input.batch_tracked,
    })
    .select("id")
    .single();

  if (insertError || !item) {
    return { error: insertError?.message ?? "Could not create item." };
  }

  if (input.units.length > 0) {
    const { error: unitsError } = await supabase.from("item_units").insert(
      input.units.map((u) => ({
        item_id: item.id,
        unit_name: u.unit_name.trim(),
        conversion_factor_to_base: u.conversion_factor_to_base,
      }))
    );
    if (unitsError) return { error: unitsError.message };
  }

  revalidatePath("/items");
  redirect(`/items/${item.id}`);
}

export async function updateItem(itemId: string, input: ItemInput) {
  const error = validate(input);
  if (error) return { error };

  const supabase = await createClient();

  const { error: updateError } = await supabase
    .from("items")
    .update({
      name: input.name.trim(),
      category_id: input.category_id,
      base_unit: input.base_unit.trim(),
      reorder_level: input.reorder_level,
      batch_tracked: input.batch_tracked,
    })
    .eq("id", itemId);

  if (updateError) return { error: updateError.message };

  const { error: deleteUnitsError } = await supabase
    .from("item_units")
    .delete()
    .eq("item_id", itemId);
  if (deleteUnitsError) return { error: deleteUnitsError.message };

  if (input.units.length > 0) {
    const { error: unitsError } = await supabase.from("item_units").insert(
      input.units.map((u) => ({
        item_id: itemId,
        unit_name: u.unit_name.trim(),
        conversion_factor_to_base: u.conversion_factor_to_base,
      }))
    );
    if (unitsError) return { error: unitsError.message };
  }

  revalidatePath("/items");
  revalidatePath(`/items/${itemId}`);
  return { ok: true };
}

export async function setItemActive(itemId: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("items").update({ active }).eq("id", itemId);
  if (error) return { error: error.message };
  revalidatePath("/items");
  revalidatePath(`/items/${itemId}`);
  return { ok: true };
}

export async function createCategory(name: string) {
  if (!name.trim()) return { error: "Category name is required." };
  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert({ name: name.trim() });
  if (error) return { error: error.message };
  revalidatePath("/items");
  revalidatePath("/settings");
  return { ok: true };
}
