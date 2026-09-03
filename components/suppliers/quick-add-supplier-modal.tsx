"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/shared/modal";
import { createSupplier } from "@/app/(app)/suppliers/actions";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";

export interface QuickSupplier {
  id: string;
  code: string;
  name: string;
}

// Minimal supplier capture for "get unblocked and keep entering the
// purchase" -- not a replacement for the full Add Supplier screen, which
// still handles contact/address detail and opening balance.
export function QuickAddSupplierModal({
  initialName,
  onClose,
  onCreated,
}: {
  initialName: string;
  onClose: () => void;
  onCreated: (supplier: QuickSupplier) => void;
}) {
  const [name, setName] = useState(initialName);
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // This form is rendered through a portal (Modal -> document.body), but
    // React still bubbles its submit event through the React tree -- up
    // into the purchase form this modal was opened from -- unless stopped
    // here. Without this, submitting the modal also fires the outer form's
    // onSubmit with whatever state it happened to have at that instant.
    e.stopPropagation();
    setError(null);
    startTransition(async () => {
      const result = await createSupplier({ name, contact, address, opening_balance: 0 });
      if (result?.error || !result?.id || !result?.code) {
        setError(result?.error ?? "Could not create supplier.");
        return;
      }
      onCreated({ id: result.id, code: result.code, name: name.trim() });
    });
  }

  return (
    <Modal open onClose={onClose} title="Add Supplier">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <p className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Name</label>
          <KeyboardTextInput
            value={name}
            onChange={setName}
            required
            autoFocus
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            Contact Number
          </label>
          <KeyboardTextInput
            value={contact}
            onChange={setContact}
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Address</label>
          <KeyboardTextInput
            value={address}
            onChange={setAddress}
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 flex-1 items-center justify-center rounded-lg border border-border text-sm font-medium text-foreground active:bg-background"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex h-12 flex-1 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {pending ? "Saving..." : "Add Supplier"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
