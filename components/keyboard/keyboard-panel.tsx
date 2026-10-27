"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { NumericKeypad } from "@/components/NumericKeypad";
import { OnScreenKeyboard } from "@/components/OnScreenKeyboard";
import { useOnScreenKeyboard } from "./keyboard-context";

// The one docked keyboard instance for the whole app. Lives at the bottom of
// the viewport (like a native software keyboard) rather than floating next
// to each field individually -- simpler to keep correctly positioned across
// scroll/resize, and "doesn't cover the field" is satisfied by scrolling the
// active field above it instead of chasing it around the screen.
export function KeyboardPanel() {
  const { active, close } = useOnScreenKeyboard();
  const panelRef = useRef<HTMLDivElement>(null);

  // Reserve scroll room at the bottom of the page while open, and bring the
  // active field into view above the panel -- otherwise a field near the
  // bottom of a short page has nowhere to scroll to and stays hidden behind
  // the keyboard.
  useEffect(() => {
    if (!active) {
      document.body.style.paddingBottom = "";
      return;
    }

    const panelHeight = panelRef.current?.offsetHeight ?? 320;
    document.body.style.paddingBottom = `${panelHeight}px`;

    const timer = window.setTimeout(() => {
      active.targetRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);

    return () => window.clearTimeout(timer);
  }, [active]);

  // A tap outside the panel (and outside the field being typed into) closes it. It closes
  // AFTER the tap's own click, not on pointer-down: closing first moves the page (the
  // bill's big button, a centred dialog) a moment before the click is dispatched, and the
  // click then lands on whatever slid under the finger. If no click comes (a button that
  // already acted on pointer-up, see TapButton) a clean tap still closes it shortly after.
  // Scrolling or dragging outside does not close it.
  useEffect(() => {
    if (!active) return;

    let down: { x: number; y: number; outside: boolean; moved: boolean } | null = null;
    let lastOutside = false;
    let timer: number | undefined;

    function isOutside(target: Node) {
      return !(panelRef.current?.contains(target) || active?.targetRef.current?.contains(target));
    }
    function onDown(e: PointerEvent) {
      window.clearTimeout(timer);
      lastOutside = isOutside(e.target as Node);
      down = { x: e.clientX, y: e.clientY, outside: lastOutside, moved: false };
    }
    function onMove(e: PointerEvent) {
      if (down && (Math.abs(e.clientX - down.x) > 10 || Math.abs(e.clientY - down.y) > 10)) down.moved = true;
    }
    function onUp() {
      const d = down;
      down = null;
      if (d && d.outside && !d.moved) timer = window.setTimeout(close, 600);
    }
    function onCancel() {
      down = null;
    }
    function onClick(e: MouseEvent) {
      if (e.detail === 0 || !lastOutside) return; // a keyboard "click", or one that began inside
      window.clearTimeout(timer);
      close();
    }

    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
    document.addEventListener("click", onClick);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("click", onClick);
    };
  }, [active, close]);

  if (!active || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.12)]"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-2xl items-center justify-end pb-2">
        <button
          type="button"
          // pointer-down keeps the focus in the field; the keyboard goes away on the click, so
          // nothing underneath the finger can be tapped by mistake
          onPointerDown={(e) => e.preventDefault()}
          onClick={close}
          className="flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Done
        </button>
      </div>
      <div className="mx-auto max-w-2xl">
        {active.type === "numeric" ? (
          <NumericKeypad onKey={active.onKey} allowDecimal={active.allowDecimal} />
        ) : (
          <OnScreenKeyboard onKey={active.onKey} />
        )}
      </div>
    </div>,
    document.body
  );
}
