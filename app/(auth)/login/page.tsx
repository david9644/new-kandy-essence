"use client";

import { useState } from "react";
import { NumericKeypad, type NumericKey } from "@/components/NumericKeypad";

const MAX_PIN_LENGTH = 6;

export default function LoginPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function press(key: NumericKey) {
    if (submitting) return;
    setError(null);
    if (key === "back") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (key === "clear") {
      setPin("");
      return;
    }
    setPin((p) => (p.length < MAX_PIN_LENGTH ? p + key : p));
  }

  async function submit() {
    if (pin.length < 4 || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error ?? "Could not log in.");
        setPin("");
        setSubmitting(false);
        return;
      }

      window.location.assign("/dashboard");
    } catch {
      setError("Network error. Try again.");
      setPin("");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-xs">
        <h1 className="mb-1 text-center text-xl font-semibold text-foreground">
          New Kandy Essence
        </h1>
        <p className="mb-8 text-center text-sm text-muted">Enter your PIN to continue</p>

        <div className="mb-6 flex justify-center gap-3">
          {Array.from({ length: Math.max(pin.length, 4) }).map((_, i) => (
            <span
              key={i}
              className={`h-4 w-4 rounded-full border-2 border-primary ${
                i < pin.length ? "bg-primary" : "bg-transparent"
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-danger-surface px-3 py-2 text-center text-sm text-danger">
            {error}
          </p>
        )}

        <NumericKeypad onKey={press} allowDecimal={false} disabled={submitting} large />

        <button
          type="button"
          disabled={pin.length < 4 || submitting}
          onClick={submit}
          className="mt-4 flex h-14 w-full items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground disabled:opacity-40"
        >
          {submitting ? "Checking..." : "Log In"}
        </button>
      </div>
    </div>
  );
}
