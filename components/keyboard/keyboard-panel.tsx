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

  // Outside-tap closes the panel -- anywhere that isn't the panel itself or
  // the field currently being typed into.
  useEffect(() => {
    if (!active) return;

    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (active?.targetRef.current?.contains(target)) return;
      close();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
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
          onPointerDown={(e) => {
            e.preventDefault();
            close();
          }}
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
