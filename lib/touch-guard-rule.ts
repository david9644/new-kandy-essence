// The rule behind components/shared/touch-guard.tsx, kept free of the DOM so it can be tested.
//
// After a finger tap the browser sends mouse events (mousedown, mouseup, click) and picks
// their target only AFTER the page has reacted to the tap. If the page changed under the
// finger, that click lands on something the cashier never touched. It is dropped when it
//   * follows a touch / pen tap closely in time and place (WINDOW_MS, NEAR_PX), and
//   * lands on an element that is not the one the finger went down on (nor its parent or
//     child), or the element the finger went down on has left the page.
// A click on the same element is an ordinary tap and is never dropped.

export const WINDOW_MS = 800;
export const NEAR_PX = 48;

export interface NodeLike {
  isConnected: boolean;
  contains(other: unknown): boolean;
}

export interface TapRecord {
  el: NodeLike;
  x: number;
  y: number;
  at: number;
}

export function isGhostClick(
  tap: TapRecord | null,
  event: { x: number; y: number; target: NodeLike | null; now: number }
): boolean {
  if (!tap || !event.target) return false;
  if (event.now - tap.at > WINDOW_MS) return false;
  if (Math.abs(event.x - tap.x) > NEAR_PX || Math.abs(event.y - tap.y) > NEAR_PX) return false;
  const t = event.target;
  const same = tap.el.isConnected && (tap.el === t || tap.el.contains(t) || t.contains(tap.el));
  return !same;
}
