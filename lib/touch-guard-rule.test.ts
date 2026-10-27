// The ghost-click rule for touch screens. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { NEAR_PX, WINDOW_MS, isGhostClick, type NodeLike } from "./touch-guard-rule";

// A tiny tree: node.contains(other) is true for itself and its descendants.
function node(parent?: FakeNode): FakeNode {
  return new FakeNode(parent);
}
class FakeNode implements NodeLike {
  isConnected = true;
  constructor(private parent?: FakeNode) {}
  contains(other: NodeLike): boolean {
    let n: FakeNode | undefined = other as FakeNode;
    while (n) {
      if (n === this) return true;
      n = n.parent;
    }
    return false;
  }
}

const AT = 1000;
const tapOn = (el: NodeLike) => ({ el, x: 500, y: 600, at: AT });
const click = (target: NodeLike | null, over: { x?: number; y?: number; now?: number } = {}) => ({
  x: over.x ?? 500,
  y: over.y ?? 600,
  target,
  now: over.now ?? AT + 30,
});

test("a click on the same element is an ordinary tap: kept", () => {
  const button = node();
  assert.equal(isGhostClick(tapOn(button), click(button)), false);
});

test("a click on a child or parent of the pressed element is kept (text inside a button, a label)", () => {
  const parent = node();
  const child = node(parent);
  assert.equal(isGhostClick(tapOn(parent), click(child)), false);
  assert.equal(isGhostClick(tapOn(child), click(parent)), false);
});

test("a click on something else (a dialog's backdrop that opened under the finger): dropped", () => {
  const button = node();
  const backdrop = node();
  assert.equal(isGhostClick(tapOn(button), click(backdrop)), true);
});

test("the pressed element left the page (the keyboard's Done): the click is dropped, whatever it lands on", () => {
  const done = node();
  done.isConnected = false;
  const tileUnderneath = node();
  assert.equal(isGhostClick(tapOn(done), click(tileUnderneath)), true);
  assert.equal(isGhostClick(tapOn(done), click(done)), true);
});

test("a click far from the tap, or later than the window, is a different action: kept", () => {
  const button = node();
  const other = node();
  assert.equal(isGhostClick(tapOn(button), click(other, { x: 500 + NEAR_PX + 1 })), false);
  assert.equal(isGhostClick(tapOn(button), click(other, { y: 600 - NEAR_PX - 1 })), false);
  assert.equal(isGhostClick(tapOn(button), click(other, { now: AT + WINDOW_MS + 1 })), false);
  // right at the edge of both limits it is still the same tap
  assert.equal(isGhostClick(tapOn(button), click(other, { x: 500 + NEAR_PX, now: AT + WINDOW_MS })), true);
});

test("no tap recorded (mouse or keyboard user), or no target: nothing is dropped", () => {
  const a = node();
  assert.equal(isGhostClick(null, click(a)), false);
  assert.equal(isGhostClick(tapOn(a), click(null)), false);
});
