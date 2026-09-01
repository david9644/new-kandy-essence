"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createUser } from "@/app/(app)/users/actions";
import type { Database } from "@/lib/types/database.types";

type Role = Database["public"]["Enums"]["user_role"];

export function CreateUserForm() {
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("store_keeper");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createUser({ full_name: fullName, role, pin });
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setFullName("");
        setPin("");
        setRole("store_keeper");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      {error && <p className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">{error}</p>}
      {success && (
        <p className="rounded-lg bg-success-surface px-3 py-2 text-sm text-success">User created.</p>
      )}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Name</label>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          className="w-full rounded-lg border border-border bg-background px-4 py-3 text-base text-foreground focus:border-primary focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Role</label>
        <div className="grid grid-cols-2 gap-2">
          {(["store_keeper", "owner"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`flex h-11 items-center justify-center rounded-lg border text-sm font-medium ${
                role === r
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground"
              }`}
            >
              {r === "owner" ? "Owner" : "Store Keeper"}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">PIN (4-6 digits)</label>
        <input
          type="text"
          inputMode="numeric"
          value={pin}
          onChange={(e) => {
            if (/^\d{0,6}$/.test(e.target.value)) setPin(e.target.value);
          }}
          required
          className="w-full rounded-lg border border-border bg-background px-4 py-3 text-base tabular-nums text-foreground focus:border-primary focus:outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={pending || !fullName.trim() || pin.length < 4}
        className="flex h-12 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Creating..." : "Create User"}
      </button>
    </form>
  );
}
