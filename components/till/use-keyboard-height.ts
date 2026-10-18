"use client";

import { useSyncExternalStore } from "react";

// The docked on-screen keyboard (components/keyboard/keyboard-panel.tsx) reserves
// room by setting body padding-bottom to its own height while it is open. The
// till screen reads that value so it can shrink to the space ABOVE the pad:
// the Take-the-money button and the dialogs then never sit underneath it.

function read(): number {
  if (typeof document === "undefined") return 0;
  const v = parseFloat(document.body.style.paddingBottom || "0");
  return Number.isFinite(v) ? Math.round(v) : 0;
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, { attributes: true, attributeFilter: ["style"] });
  return () => observer.disconnect();
}

export function useKeyboardHeight(): number {
  return useSyncExternalStore(subscribe, read, () => 0);
}
