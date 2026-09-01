import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PurchaseForm } from "@/components/purchases/purchase-form";

export default async function NewPurchasePage() {
  await requireProfile();
  const supabase = await createClient();

  const [{ data: suppliers }, { data: itemsData }, { data: bankAccounts }] = await Promise.all([
    supabase.from("suppliers").select("id, code, name").eq("active", true).order("name"),
    supabase
      .from("items")
      .select("id, code, name, base_unit, batch_tracked, item_units(unit_name, conversion_factor_to_base)")
      .eq("active", true)
      .order("name"),
    supabase.from("bank_accounts").select("id, name").eq("active", true).order("name"),
  ]);

  const items = (itemsData ?? []).map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    base_unit: item.base_unit,
    batch_tracked: item.batch_tracked,
    units: item.item_units,
  }));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-2xl font-semibold text-foreground">New Purchase</h1>
      <PurchaseForm
        suppliers={suppliers ?? []}
        items={items}
        bankAccounts={bankAccounts ?? []}
      />
    </div>
  );
}
