"use client";

import { useState, useTransition } from "react";
import type { WorkerInput } from "@/app/(app)/workers/actions";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";

interface WorkerFormProps {
  initial?: WorkerInput;
  onSubmit: (input: WorkerInput) => Promise<{ error?: string; ok?: boolean }>;
  submitLabel: string;
}

export function WorkerForm({ initial, onSubmit, submitLabel }: WorkerFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [contact, setContact] = useState(initial?.contact ?? "");
  const [position, setPosition] = useState(initial?.position ?? "");
  const [monthlySalary, setMonthlySalary] = useState(
    initial?.monthly_salary != null ? String(initial.monthly_salary) : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName("");
    setContact("");
    setPosition("");
    setMonthlySalary("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const workerName = name;

    startTransition(async () => {
      const result = await onSubmit({
        name,
        contact,
        position,
        monthly_salary: monthlySalary.trim() ? Number(monthlySalary) : null,
      });
      if (result?.error) {
        setError(result.error);
      } else if (!initial) {
        setSuccessMessage(`Worker '${workerName}' added.`);
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
        <label className="mb-1.5 block text-sm font-medium text-foreground">Worker Name</label>
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
        <label className="mb-1.5 block text-sm font-medium text-foreground">Position</label>
        <KeyboardTextInput
          value={position}
          onChange={setPosition}
          className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          Monthly Salary
        </label>
        <KeyboardNumberInput
          value={monthlySalary}
          onChange={setMonthlySalary}
          className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <p className="mt-1 text-xs text-muted">
          Optional, for reference only -- not used in any calculation.
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
