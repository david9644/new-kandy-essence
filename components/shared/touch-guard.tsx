"use client";

import { useEffect } from "react";
import { isGhostClick, WINDOW_MS, type TapRecord } from "@/lib/touch-guard-rule";

// Ghost-click guard for touch screens.
//
// After a finger tap Chrome sends the old mouse events (mousedown, mouseup, click) and
// finds their target AFTER the page has already reacted to the tap. Several buttons act
// on pointer-up (they must: the on-screen keyboard closing moves things before a click
// can land), so the page has often changed by then: a dialog opened and its dark backdrop
// is now under the finger (the dialog closes again at once), a list closed and a button
// sits where the row was, the number pad closed and a bill button sits under "Done".
//
// The rule itself (and why) lives in lib/touch-guard-rule.ts. Mouse and keyboard are never
// affected: only events that follow a touch or pen tap are looked at.

export function TouchGuard() {
  useEffect(() => {
    let down: { el: Element; x: number; y: number } | null = null;
    let tap: TapRecord | null = null;

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === "mouse") {
        down = null;
        return;
      }
      down = { el: e.target as Element, x: e.clientX, y: e.clientY };
    }

    function onPointerUp(e: PointerEvent) {
      if (e.pointerType === "mouse" || !down) return;
      tap = { ...down, at: performance.now() };
      down = null;
    }

    function onCompat(e: MouseEvent) {
      if (!tap) return;
      const now = performance.now();
      if (now - tap.at > WINDOW_MS) {
        tap = null;
        return;
      }
      if (isGhostClick(tap, { x: e.clientX, y: e.clientY, target: e.target as Node | null, now })) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    }

    // A long press with a finger would pop up the browser's right-click menu (Back, Reload,
    // Inspect...) over a tile or button. Not in text boxes (copy / paste), not for a mouse.
    function onContextMenu(e: MouseEvent) {
      if ((e as PointerEvent).pointerType !== "touch") return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
    }

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("mousedown", onCompat, true);
    window.addEventListener("mouseup", onCompat, true);
    window.addEventListener("click", onCompat, true);
    window.addEventListener("contextmenu", onContextMenu, true);
    return () => {
      window.removeEventListener("contextmenu", onContextMenu, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("mousedown", onCompat, true);
      window.removeEventListener("mouseup", onCompat, true);
      window.removeEventListener("click", onCompat, true);
    };
  }, []);

  return null;
}
