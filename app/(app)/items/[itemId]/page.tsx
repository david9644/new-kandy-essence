import { Fragment } from "react";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ItemForm } from "@/components/items/item-form";
import { updateItem, setItemActive } from "@/app/(app)/items/actions";
import { ActiveToggleButton } from "@/components/items/active-toggle-button";
import { BackButton } from "@/components/shared/back-button";
import { formatCurrency } from "@/lib/units";

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: item }, { data: categories }, { data: units }] = await Promise.all([
    // Explicit columns: last_purchase_cost is the Owner's, read below.
    supabase
      .from("items")
      .select("id, code, name, category_id, base_unit, reorder_level, batch_tracked, active, sale_price")
      .eq("id", itemId)
      .maybeSingle(),
    supabase.from("categories").select("id, name").order("name"),
    supabase
      .from("item_units")
      .select("unit_name, conversion_factor_to_base")
      .eq("item_id", itemId),
  ]);

  if (!item) notFound();

  // Purchase costs are for the Owner only (owner-checked function; a Store Keeper
  // never asks for it).
  let lastCost: number | null = null;
  if (profile.role === "owner") {
    const { data: costRows } = await supabase.rpc("get_item_last_costs", { p_ids: [itemId] });
    lastCost = costRows?.[0]?.last_purchase_cost ?? null;
  }

  const boundUpdate = updateItem.bind(null, itemId);

  return (
    <div className="mx-auto max-w-lg">
      <BackButton href="/items" />
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{item.name}</h1>
          <p className="text-sm text-muted">{item.code}</p>
        </div>
        {profile.role === "owner" && (
          <ActiveToggleButton
            active={item.active}
            onToggle={setItemActive.bind(null, itemId, !item.active)}
          />
        )}
      </div>

      {lastCost != null && (
        <p className="mb-4 text-sm text-muted">
          Last purchase cost: {formatCurrency(lastCost)} per {item.base_unit}
        </p>
      )}

      {profile.role === "owner" ? (
        <ItemForm
          categories={categories ?? []}
          initial={{
            name: item.name,
            category_id: item.category_id,
            base_unit: item.base_unit,
            reorder_level: item.reorder_level,
            batch_tracked: item.batch_tracked,
            sale_price: item.sale_price,
            units: (units ?? []).map((u) => ({
              unit_name: u.unit_name,
              conversion_factor_to_base: u.conversion_factor_to_base,
            })),
          }}
          onSubmit={boundUpdate}
          submitLabel="Save Changes"
        />
      ) : (
        <dl className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-surface p-4 text-sm">
          <dt className="text-muted">Base unit</dt>
          <dd className="text-foreground">{item.base_unit}</dd>
          <dt className="text-muted">Reorder level</dt>
          <dd className="text-foreground">{item.reorder_level}</dd>
          <dt className="text-muted">Selling price</dt>
          <dd className="text-foreground">
            {item.sale_price != null ? `${formatCurrency(item.sale_price)} per ${item.base_unit}` : "-"}
          </dd>
          <dt className="text-muted">Batch tracked</dt>
          <dd className="text-foreground">{item.batch_tracked ? "Yes" : "No"}</dd>
          {(units ?? []).map((u) => (
            <Fragment key={u.unit_name}>
              <dt className="text-muted">1 {u.unit_name} =</dt>
              <dd className="text-foreground">
                {u.conversion_factor_to_base} {item.base_unit}
              </dd>
            </Fragment>
          ))}
        </dl>
      )}
    </div>
  );
}
