"use client";

import { useEffect, type RefObject } from "react";

// Closes a dropdown when a press lands outside it. Unlike a full-screen invisible layer
// behind the list, nothing covers the page: the press goes straight through to whatever
// was tapped, so one tap does the tap AND closes the list (no "first tap only closes it").
export function useDismissOutside(ref: RefObject<HTMLElement | null>, open: boolean, onDismiss: () => void) {
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current?.contains(e.target as Node)) return;
      onDismiss();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [ref, open, onDismiss]);
}
