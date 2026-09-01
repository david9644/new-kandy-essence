"use client";

import { useState } from "react";

export function LogoutButton() {
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loading}
      className="flex h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground active:bg-background disabled:opacity-50"
    >
      {loading ? "..." : "Log out"}
    </button>
  );
}
