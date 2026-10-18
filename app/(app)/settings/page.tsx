import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AddNameForm } from "@/components/settings/add-name-form";
import { DailyChequeLimitForm } from "@/components/settings/daily-cheque-limit-form";
import { DeletePinForm } from "@/components/settings/delete-pin-form";
import { BusinessDetailsForm } from "@/components/settings/business-details-form";
import { ActiveToggleButton } from "@/components/items/active-toggle-button";
import { createCategory } from "@/app/(app)/items/actions";
import {
  createBankAccount,
  setBankAccountActive,
  updateAppSettings,
  setDeletePin,
  resetDeletePin,
  updateBusinessDetails,
} from "@/app/(app)/settings/actions";

export default async function SettingsPage() {
  await requireOwner();
  const supabase = await createClient();

  const [{ data: categories }, { data: bankAccounts }, { data: appSettings }, { data: hasPin }] =
    await Promise.all([
      supabase.from("categories").select("id, name").order("name"),
      supabase.from("bank_accounts").select("id, name, active").order("name"),
      supabase
        .from("app_settings")
        .select("daily_cheque_limit, business_name, business_address, business_phone1, business_phone2")
        .eq("id", true)
        .maybeSingle(),
      supabase.rpc("has_delete_pin"),
    ]);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <h1 className="text-2xl font-semibold text-foreground">Settings</h1>

      <section>
        <h2 className="mb-3 text-lg font-medium text-foreground">Delete PIN</h2>
        <p className="mb-3 text-sm text-muted">
          A separate PIN (not your login PIN) that must be entered for every delete. Only you can
          set it or use it.
        </p>
        <DeletePinForm
          hasPin={hasPin === true}
          onSetPin={setDeletePin}
          onResetPin={resetDeletePin}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-foreground">Business Details</h2>
        <p className="mb-3 text-sm text-muted">
          Shown in the header of every bill: business name, address and up to two phone numbers.
        </p>
        <BusinessDetailsForm
          initial={{
            name: appSettings?.business_name ?? "",
            address: appSettings?.business_address ?? "",
            phone1: appSettings?.business_phone1 ?? "",
            phone2: appSettings?.business_phone2 ?? "",
          }}
          onSubmit={updateBusinessDetails}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-foreground">Daily Cheque Limit</h2>
        <p className="mb-3 text-sm text-muted">
          Warns (without blocking) when a new cheque would push a single day&rsquo;s total
          cheques over this amount.
        </p>
        <DailyChequeLimitForm
          initial={appSettings?.daily_cheque_limit ?? 0}
          onSubmit={updateAppSettings}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-foreground">Item Categories</h2>
        <AddNameForm placeholder="New category name" buttonLabel="Add" onSubmit={createCategory} />
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
          {(categories ?? []).map((c) => (
            <li key={c.id} className="px-4 py-3 text-sm text-foreground">
              {c.name}
            </li>
          ))}
          {(categories ?? []).length === 0 && (
            <li className="px-4 py-3 text-sm text-muted">No categories yet.</li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-foreground">Bank Accounts</h2>
        <p className="mb-3 text-sm text-muted">
          Used when recording a cheque -- which account it&rsquo;s drawn from.
        </p>
        <AddNameForm
          placeholder="e.g. Commercial Bank - Current"
          buttonLabel="Add"
          onSubmit={createBankAccount}
        />
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
          {(bankAccounts ?? []).map((b) => (
            <li key={b.id} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-foreground">{b.name}</span>
              <ActiveToggleButton
                active={b.active}
                onToggle={setBankAccountActive.bind(null, b.id, !b.active)}
              />
            </li>
          ))}
          {(bankAccounts ?? []).length === 0 && (
            <li className="px-4 py-3 text-sm text-muted">No bank accounts yet.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
