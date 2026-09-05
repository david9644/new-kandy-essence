import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ItemForm } from "@/components/items/item-form";
import { createItem } from "@/app/(app)/items/actions";
import { BackButton } from "@/components/shared/back-button";

export default async function NewItemPage() {
  await requireOwner();
  const supabase = await createClient();
  const { data: categories } = await supabase.from("categories").select("id, name").order("name");

  return (
    <div className="mx-auto max-w-lg">
      <BackButton href="/items" />
      <h1 className="mb-4 text-2xl font-semibold text-foreground">Add Item</h1>
      <ItemForm categories={categories ?? []} onSubmit={createItem} submitLabel="Create Item" />
    </div>
  );
}
