"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";

export function DailyChequeLimitForm({
  initial,
  onSubmit,
}: {
  initial: number;
  onSubmit: (limit: number) => Promise<{ error?: string; ok?: boolean }>;
}) {
  const [limit, setLimit] = useState(String(initial));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await onSubmit(Number(limit) || 0);
      if (result?.error) {
        setError(result.error);
      } else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-start gap-2">
      <div className="flex-1">
        <KeyboardNumberInput
          value={limit}
          onChange={setLimit}
          className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <p className="mt-1 text-xs text-muted">0 = no limit</p>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        {saved && <p className="mt-1 text-xs text-success">Saved.</p>}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {pending ? "..." : "Save"}
      </button>
    </form>
  );
}
