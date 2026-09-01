"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function ActiveToggleButton({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => Promise<{ error?: string; ok?: boolean }>;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await onToggle();
          router.refresh();
        })
      }
      className={`flex h-11 items-center rounded-lg border px-4 text-sm font-medium disabled:opacity-50 ${
        active
          ? "border-border text-foreground active:bg-background"
          : "border-success bg-success-surface text-success"
      }`}
    >
      {pending ? "..." : active ? "Deactivate" : "Activate"}
    </button>
  );
}
