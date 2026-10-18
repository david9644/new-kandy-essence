"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";
import { KeyboardTextArea } from "@/components/keyboard/keyboard-textarea";

export interface BusinessDetails {
  name: string;
  address: string;
  phone1: string;
  phone2: string;
}

const FIELD =
  "w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

// Shown in the header of every bill (and, later, the printed bill).
export function BusinessDetailsForm({
  initial,
  onSubmit,
}: {
  initial: BusinessDetails;
  onSubmit: (input: BusinessDetails) => Promise<{ error?: string; ok?: boolean }>;
}) {
  const [details, setDetails] = useState<BusinessDetails>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function set<K extends keyof BusinessDetails>(key: K, value: string) {
    setDetails((d) => ({ ...d, [key]: value }));
    setSaved(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await onSubmit(details);
      if (result?.error) {
        setError(result.error);
      } else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Business name</label>
        <KeyboardTextInput value={details.name} onChange={(v) => set("name", v)} className={FIELD} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Address</label>
        <KeyboardTextArea
          value={details.address}
          onChange={(v) => set("address", v)}
          rows={2}
          className={FIELD}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Phone 1</label>
          <KeyboardTextInput
            value={details.phone1}
            onChange={(v) => set("phone1", v)}
            className={FIELD}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Phone 2 (optional)</label>
          <KeyboardTextInput
            value={details.phone2}
            onChange={(v) => set("phone2", v)}
            className={FIELD}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save Business Details"}
        </button>
        {error && <p className="text-xs text-danger">{error}</p>}
        {saved && <p className="text-xs text-success">Saved.</p>}
      </div>
    </form>
  );
}
