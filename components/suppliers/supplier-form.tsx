"use client";

import { useState, useTransition } from "react";
import type { SupplierInput } from "@/app/(app)/suppliers/actions";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";
import { KeyboardTextArea } from "@/components/keyboard/keyboard-textarea";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";

interface SupplierFormProps {
  initial?: SupplierInput;
  onSubmit: (input: SupplierInput) => Promise<{ error?: string; ok?: boolean }>;
  submitLabel: string;
  lockOpeningBalance?: boolean;
}

export function SupplierForm({
  initial,
  onSubmit,
  submitLabel,
  lockOpeningBalance,
}: SupplierFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [contact, setContact] = useState(initial?.contact ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [openingBalance, setOpeningBalance] = useState(String(initial?.opening_balance ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName("");
    setContact("");
    setAddress("");
    setOpeningBalance("0");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const supplierName = name;

    startTransition(async () => {
      const result = await onSubmit({
        name,
        contact,
        address,
        opening_balance: Number(openingBalance) || 0,
      });
      if (result?.error) {
        setError(result.error);
      } else if (!initial) {
        setSuccessMessage(`Supplier '${supplierName}' created.`);
        reset();
      } else if (result?.ok) {
        setSuccessMessage("Saved.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {error && (
        <p className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>
      )}
      {successMessage && (
        <p className="rounded-lg bg-success-surface px-3 py-2 text-sm text-success">
          {successMessage}
        </p>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Supplier Name</label>
        <KeyboardTextInput
          value={name}
          onChange={setName}
          required
          className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Contact Number</label>
        <KeyboardNumberInput
          value={contact}
          onChange={setContact}
          allowDecimal={false}
          className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Address</label>
        <KeyboardTextArea
          value={address}
          onChange={setAddress}
          rows={2}
          className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          Opening Balance
        </label>
        <KeyboardNumberInput
          value={openingBalance}
          disabled={lockOpeningBalance}
          onChange={setOpeningBalance}
          className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
        />
        <p className="mt-1 text-xs text-muted">
          What you already owe this supplier before using this system, if any.
        </p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex h-14 w-full items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
