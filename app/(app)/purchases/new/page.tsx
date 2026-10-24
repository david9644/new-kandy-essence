import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { PurchaseForm } from "@/components/purchases/purchase-form";
import { BackButton } from "@/components/shared/back-button";

export default async function NewPurchasePage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: suppliers }, itemsData, { data: bankAccounts }, { data: categories }] =
    await Promise.all([
      supabase.from("suppliers").select("id, code, name").eq("active", true).order("name"),
      fetchAll((from, to) =>
        supabase
          .from("items")
          .select(
            "id, code, name, base_unit, batch_tracked, sale_price, item_units(unit_name, conversion_factor_to_base)"
          )
          .eq("active", true)
          .order("name")
          .order("id")
          .range(from, to)
      ),
      supabase.from("bank_accounts").select("id, name").eq("active", true).order("name"),
      supabase.from("categories").select("id, name").order("name"),
    ]);

  const items = itemsData.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    base_unit: item.base_unit,
    batch_tracked: item.batch_tracked,
    sale_price: item.sale_price,
    units: item.item_units,
  }));

  return (
    <div className="mx-auto max-w-2xl border-t-[3px] border-t-accent-purchases pt-3">
      <BackButton href="/purchases" />
      <h1 className="mb-4 text-2xl font-semibold text-foreground">New Purchase</h1>
      <PurchaseForm
        suppliers={suppliers ?? []}
        items={items}
        bankAccounts={bankAccounts ?? []}
        categories={categories ?? []}
        isOwner={profile.role === "owner"}
      />
    </div>
  );
}
