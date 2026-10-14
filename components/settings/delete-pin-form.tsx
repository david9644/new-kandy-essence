"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PinPad } from "@/components/shared/pin-pad";

type Mode = "set" | "change" | "reset";
type Step = "current" | "login" | "new" | "confirm";

const STEPS: Record<Mode, Step[]> = {
  set: ["new", "confirm"],
  change: ["current", "new", "confirm"],
  reset: ["login", "new", "confirm"],
};

const STEP_TITLE: Record<Step, string> = {
  current: "Enter your current Delete PIN",
  login: "Enter your LOGIN PIN to confirm it's you",
  new: "Choose a new Delete PIN (4-6 digits)",
  confirm: "Enter the new Delete PIN again",
};

export function DeletePinForm({
  hasPin,
  onSetPin,
  onResetPin,
}: {
  hasPin: boolean;
  onSetPin: (newPin: string, currentPin?: string) => Promise<{ ok?: boolean; error?: string; code?: string }>;
  onResetPin: (loginPin: string, newPin: string) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [pins, setPins] = useState<Partial<Record<Step, string>>>({});
  const [entry, setEntry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  function start(next: Mode) {
    setMode(next);
    setStepIndex(0);
    setPins({});
    setEntry("");
    setError(null);
    setSaved(false);
  }

  function cancel() {
    setMode(null);
    setPins({});
    setEntry("");
    setError(null);
  }

  async function next() {
    if (!mode || entry.length < 4 || pending) return;
    const step = STEPS[mode][stepIndex];
    setError(null);

    if (step !== "confirm") {
      setPins((p) => ({ ...p, [step]: entry }));
      setEntry("");
      setStepIndex(stepIndex + 1);
      return;
    }

    if (entry !== pins.new) {
      setError("The two PINs don't match. Choose the new PIN again.");
      setPins((p) => ({ ...p, new: undefined }));
      setEntry("");
      setStepIndex(STEPS[mode].indexOf("new"));
      return;
    }

    setPending(true);
    const result =
      mode === "reset"
        ? await onResetPin(pins.login ?? "", entry)
        : await onSetPin(entry, mode === "change" ? pins.current : undefined);
    setPending(false);

    if (result.error) {
      // Wrong current / login PIN: start over from the first step.
      setError(result.error);
      setPins({});
      setEntry("");
      setStepIndex(0);
      return;
    }

    setMode(null);
    setPins({});
    setEntry("");
    setSaved(true);
    router.refresh();
  }

  const step = mode ? STEPS[mode][stepIndex] : null;
  const isLast = mode ? stepIndex === STEPS[mode].length - 1 : false;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className={`mb-3 text-sm ${hasPin ? "text-foreground" : "text-warning"}`}>
        {hasPin
          ? "A Delete PIN is set. It is asked for on every delete."
          : "No Delete PIN set yet -- all deletes are blocked until you set one."}
      </p>

      {saved && !mode && (
        <p className="mb-3 rounded-lg bg-background px-3 py-2 text-sm text-foreground">
          Delete PIN saved.
        </p>
      )}

      {!mode && (
        <div className="flex flex-wrap gap-2">
          {hasPin ? (
            <>
              <button
                type="button"
                onClick={() => start("change")}
                className="flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
              >
                Change Delete PIN
              </button>
              <button
                type="button"
                onClick={() => start("reset")}
                className="flex h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground"
              >
                Forgot Delete PIN?
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => start("set")}
              className="flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Set Delete PIN
            </button>
          )}
        </div>
      )}

      {!mode && error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {mode && step && (
        <div className="mx-auto max-w-xs">
          <p className="mb-4 text-center text-sm font-medium text-foreground">
            {STEP_TITLE[step]}
          </p>

          {error && (
            <p className="mb-4 rounded-lg bg-danger-surface px-3 py-2 text-center text-sm text-danger">
              {error}
            </p>
          )}

          <PinPad value={entry} onChange={setEntry} onSubmit={next} disabled={pending} />

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              className="flex h-14 flex-1 items-center justify-center rounded-xl border border-border text-base font-medium text-foreground disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={next}
              disabled={entry.length < 4 || pending}
              className="flex h-14 flex-1 items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-40"
            >
              {pending ? "Saving..." : isLast ? "Save PIN" : "Next"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
