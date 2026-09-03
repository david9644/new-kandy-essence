import { Fragment } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ItemForm } from "@/components/items/item-form";
import { updateItem, setItemActive } from "@/app/(app)/items/actions";
import { ActiveToggleButton } from "@/components/items/active-toggle-button";
import { formatCurrency } from "@/lib/units";

export default async function ItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ itemId: string }>;
  searchParams: Promise<{ stockError?: string }>;
}) {
  const { itemId } = await params;
  const { stockError } = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: item }, { data: categories }, { data: units }] = await Promise.all([
    supabase.from("items").select("*").eq("id", itemId).maybeSingle(),
    supabase.from("categories").select("id, name").order("name"),
    supabase
      .from("item_units")
      .select("unit_name, conversion_factor_to_base")
      .eq("item_id", itemId),
  ]);

  if (!item) notFound();

  const boundUpdate = updateItem.bind(null, itemId);

  return (
    <div className="mx-auto max-w-lg">
      {stockError && (
        <p className="mb-4 rounded-lg bg-warning-surface px-3 py-2 text-sm text-warning">
          Item created, but starting stock could not be saved. Add it from the{" "}
          <Link href="/stock/opening" className="font-medium underline">
            Opening Stock
          </Link>{" "}
          page.
        </p>
      )}
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

      {item.last_purchase_cost != null && (
        <p className="mb-4 text-sm text-muted">
          Last purchase cost: {formatCurrency(item.last_purchase_cost)} per {item.base_unit}
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
