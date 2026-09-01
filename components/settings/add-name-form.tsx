"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AddNameForm({
  placeholder,
  buttonLabel,
  onSubmit,
}: {
  placeholder: string;
  buttonLabel: string;
  onSubmit: (name: string) => Promise<{ error?: string; ok?: boolean }>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await onSubmit(name);
      if (result?.error) {
        setError(result.error);
      } else {
        setName("");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-start gap-2">
      <div className="flex-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {pending ? "..." : buttonLabel}
      </button>
    </form>
  );
}
