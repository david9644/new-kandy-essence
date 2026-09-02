"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUserActive, resetUserPin } from "@/app/(app)/users/actions";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";

interface UserRowProps {
  id: string;
  fullName: string;
  role: "owner" | "store_keeper";
  active: boolean;
  isSelf: boolean;
}

export function UserRow({ id, fullName, role, active, isSelf }: UserRowProps) {
  const [resetting, setResetting] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-foreground">
            {fullName} {isSelf && <span className="text-xs text-muted">(you)</span>}
          </p>
          <p className="text-xs capitalize text-muted">
            {role === "owner" ? "Owner" : "Store Keeper"} &middot; {active ? "Active" : "Inactive"}
          </p>
        </div>
        <div className="flex gap-2">
          {active && !resetting && (
            <button
              type="button"
              onClick={() => setResetting(true)}
              className="flex h-9 items-center rounded-lg border border-border px-3 text-xs font-medium text-foreground active:bg-background"
            >
              Reset PIN
            </button>
          )}
          {!isSelf && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await setUserActive(id, !active);
                  router.refresh();
                })
              }
              className={`flex h-9 items-center rounded-lg border px-3 text-xs font-medium disabled:opacity-50 ${
                active ? "border-danger text-danger" : "border-success text-success"
              }`}
            >
              {active ? "Deactivate" : "Activate"}
            </button>
          )}
        </div>
      </div>

      {resetting && (
        <div className="flex items-center gap-2">
          <KeyboardNumberInput
            value={newPin}
            onChange={setNewPin}
            allowDecimal={false}
            maxLength={6}
            placeholder="New 4-6 digit PIN"
            className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm tabular-nums text-foreground focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            disabled={pending || newPin.length < 4}
            onClick={() =>
              startTransition(async () => {
                const result = await resetUserPin(id, newPin);
                if (result?.error) {
                  setError(result.error);
                } else {
                  setResetting(false);
                  setNewPin("");
                  setError(null);
                  router.refresh();
                }
              })
            }
            className="flex h-10 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setResetting(false);
              setError(null);
            }}
            className="flex h-10 items-center rounded-lg border border-border px-3 text-xs font-medium text-foreground"
          >
            Cancel
          </button>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </li>
  );
}
