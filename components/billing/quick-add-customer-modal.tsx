"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/shared/modal";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";
import { quickAddCustomer } from "@/app/(app)/billing/actions";
import type { CustomerOption } from "@/components/billing/bill-types";

// Name and contact only -- a Store Keeper can add a customer while billing
// but never sees balances, ledgers or opening balances.
export function QuickAddCustomerModal({
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
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

  const field =
    "w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

  return (
    <Modal open onClose={onClose} title="Add Customer">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <p className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>
        )}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Name</label>
          <KeyboardTextInput value={name} onChange={setName} required autoFocus className={field} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Contact (optional)
          </label>
          <KeyboardTextInput value={contact} onChange={setContact} className={field} />
        </div>
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Saving..." : "Add Customer"}
        </button>
      </form>
    </Modal>
  );
}
