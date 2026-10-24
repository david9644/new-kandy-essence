"use server";

import { revalidatePath } from "next/cache";
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
  /** Optional selling price per base unit. It is the ONLY price a bill starts
   * with; it is written through set_item_sale_price (never directly) so every
   * change lands in item_price_history. */
  sale_price?: number | null;
  units: UnitInput[];
}

function validate(input: ItemInput): string | null {
  if (!input.name.trim()) return "Name is required.";
  if (!input.base_unit.trim()) return "Base unit is required.";
  if (input.reorder_level < 0) return "Reorder level cannot be negative.";
  if (input.sale_price != null && !(input.sale_price >= 0)) {
    return "Selling price cannot be negative.";
  }
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

export type PriceSource = "item form" | "price list" | "purchase";

/** Sets (or clears, with null) an item's selling price per base unit. Owner
 * only: the database function re-checks the role, the range, and writes the
 * history row in the same transaction. */
export async function setItemSalePrice(
  itemId: string,
  price: number | null,
  source: PriceSource
): Promise<{ ok: true; changed: boolean } | { error: string }> {
  if (price !== null && !(Number.isFinite(price) && price >= 0)) {
    return { error: "Selling price must be empty or zero or more." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_item_sale_price", {
    p_item_id: itemId,
    p_price: price as number,
    p_source: source,
  });
  if (error) return { error: error.message };
  const result = data as { changed?: boolean } | null;
  revalidatePath("/items");
  revalidatePath("/items/prices");
  revalidatePath(`/items/${itemId}`);
  return { ok: true, changed: result?.changed ?? false };
}

export async function createItem(input: ItemInput, source: PriceSource = "item form") {
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
    .select("id, code")
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

  // The price goes through the one price function (history included). The
  // item already exists, so a failure here is a warning, not a failed create.
  let warning: string | undefined;
  if (input.sale_price != null) {
    const priced = await setItemSalePrice(item.id, input.sale_price, source);
    if ("error" in priced) {
      warning = `Item created, but the selling price was not saved (${priced.error}). Set it from the item page.`;
    }
  }

  revalidatePath("/items");
  return { ok: true, id: item.id, code: item.code, warning };
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

  // Same single price function as everywhere else; unchanged price = no history row.
  let warning: string | undefined;
  const priced = await setItemSalePrice(itemId, input.sale_price ?? null, "item form");
  if ("error" in priced) {
    warning = `Saved, but the selling price was not changed (${priced.error}).`;
  }

  revalidatePath("/items");
  revalidatePath(`/items/${itemId}`);
  return { ok: true, warning };
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
  const { data, error } = await supabase
    .from("categories")
    .insert({ name: name.trim() })
    .select("id, name")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create category." };
  revalidatePath("/items");
  revalidatePath("/settings");
  return { ok: true, id: data.id, name: data.name };
}
