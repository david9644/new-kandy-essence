// What the till keeps in the browser between bills. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  FRESH_BILL_HREF,
  clearUnrecordedPrints,
  flagUnrecordedPrint,
  onUnrecordedPrint,
  recallTill,
  rememberCustomers,
  rememberShelf,
  unrecordedPrints,
} from "./memory";
import type { Shelf } from "./shelf";

const shelf = (n: number): Shelf => ({ categories: [], items: Array.from({ length: n }, (_, i) => ({ id: String(i), code: "C" + i, name: "Item " + i, category_id: null, base_unit: "pcs", stock: 5, sold_90d: 0, units: [] })) });

test("nothing is remembered at first; what the till sets is what the next bill gets back", () => {
  assert.deepEqual(recallTill(), { shelf: null, customers: null });
  const s = shelf(3);
  rememberShelf(s);
  rememberCustomers([{ id: "c1", code: "CU-1", name: "Sara" }]);
  const m = recallTill();
  assert.equal(m.shelf, s);
  assert.equal(m.customers?.[0].name, "Sara");
});

test("a failed shelf read (null) never wipes the remembered shelf", () => {
  const s = shelf(2);
  rememberShelf(s);
  rememberShelf(null);
  assert.equal(recallTill().shelf, s);
});

test("the fresh-bill address asks for the memory path and is a plain path on this site", () => {
  assert.equal(FRESH_BILL_HREF, "/billing/new?c=1");
});

test("an unrecorded print is kept until the till has shown it, and listeners hear about new ones", () => {
  clearUnrecordedPrints();
  assert.deepEqual(unrecordedPrints(), []);
  flagUnrecordedPrint("INV-0100");
  assert.deepEqual(unrecordedPrints(), ["INV-0100"]);
  const heard: string[] = [];
  const stop = onUnrecordedPrint((no) => heard.push(no));
  flagUnrecordedPrint("INV-0101");
  assert.deepEqual(heard, ["INV-0101"]);
  stop();
  flagUnrecordedPrint("INV-0102");
  assert.deepEqual(heard, ["INV-0101"], "an unsubscribed listener hears nothing");
  assert.deepEqual(unrecordedPrints(), ["INV-0100", "INV-0101", "INV-0102"]);
  clearUnrecordedPrints();
  assert.deepEqual(unrecordedPrints(), []);
});
