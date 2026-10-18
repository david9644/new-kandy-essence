"use client";

import { useState, useTransition } from "react";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";
import { quickAddCustomer } from "@/app/(app)/billing/actions";
import type { CustomerOption } from "@/components/billing/bill-types";
import { TapButton } from "./tap-button";
import { TillDialog } from "./till-dialog";

const FIELD =
  "h-12 w-full rounded-xl border border-border bg-surface px-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

// Name and contact only -- a Store Keeper can add a customer while billing
// but never sees balances, ledgers or opening balances. Sits above the
// on-screen keyboard like every other till dialog.
export function QuickAddCustomer({
  initialName,
  onClose,
  onCreated,
}: {
  initialName: string;
  onClose: () => void;
  onCreated: (customer: CustomerOption) => void;
}) {
  const [name, setName] = useState(initialName);
  const [contact, setContact] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (pending || !name.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await quickAddCustomer(name, contact);
      if ("error" in result) {
        setError(result.error ?? "Could not add the customer.");
        return;
      }
      onCreated(result.customer);
    });
  }

  return (
    <TillDialog
      open
      title="Add customer"
      onClose={onClose}
      width="max-w-md"
      closeDisabled={pending}
      footer={
        <TapButton
          onTap={submit}
          disabled={pending || !name.trim()}
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#111827] text-lg font-semibold text-white active:opacity-80 disabled:opacity-40"
        >
          {pending ? "Saving..." : "Add customer"}
        </TapButton>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">Name</label>
          <KeyboardTextInput value={name} onChange={setName} autoFocus className={FIELD} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Contact (optional)
          </label>
          <KeyboardTextInput value={contact} onChange={setContact} className={FIELD} />
        </div>
      </div>
    </TillDialog>
  );
}
