"use client";

import { useKeyboardHeight } from "./use-keyboard-height";

// Closing the on-screen keyboard on an outside tap moves things around before
// the button's click lands. A touch pointer stays tied to the element it went
// down on; a mouse does not, so tie it here, and the click still reaches the
// button that was pressed (matters for mouse users and screen-sharing tools).
function captureMouseOnButton(e: React.PointerEvent) {
  if (e.pointerType !== "mouse") return;
  const button = (e.target as HTMLElement).closest?.("button");
  if (!button || (button as HTMLButtonElement).disabled) return;
  try {
    button.setPointerCapture(e.pointerId);
  } catch {
    // not capturable: fall back to the ordinary click
  }
}

// The till page is exactly one screen tall (header + workspace), minus the
// on-screen keyboard while it is open. Nothing scrolls except the shelf, the
// bill's line list and dialogs, so the big buttons stay in view.
export function TillFrame({
  header,
  children,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const kb = useKeyboardHeight();
  return (
    <div
      className="flex flex-col overflow-clip bg-background"
      // pan only: a finger on the till scrolls the lists but never pinch-zooms the page
      style={{ height: `calc(100dvh - ${kb}px)`, touchAction: "pan-x pan-y" }}
      onPointerDownCapture={captureMouseOnButton}
    >
      {header}
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
