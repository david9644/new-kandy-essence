import { test } from "node:test";
import assert from "node:assert/strict";
import { activeNavHref } from "./nav";

const PRIMARY = [
  "/dashboard", "/billing", "/stock/out", "/purchases", "/items", "/items/prices",
  "/stock", "/suppliers", "/customers", "/workers", "/cheques", "/reports",
];
const MORE = ["/stock/opening", "/stock/adjustments", "/users", "/settings"];
const ALL = [...PRIMARY, ...MORE];

test("activeNavHref: Price list is its own tab, not Items", () => {
  assert.equal(activeNavHref("/items/prices", ALL), "/items/prices");
  assert.equal(activeNavHref("/items", ALL), "/items");
  assert.equal(activeNavHref("/items/new", ALL), "/items");
  assert.equal(activeNavHref("/items/4ea8b540-4adb-4fe5-ae13-a57fd5f66536", ALL), "/items");
});

test("activeNavHref: the bills list, a new bill and a saved bill are all Billing", () => {
  for (const p of ["/billing", "/billing/new", "/billing/abc", "/billing/abc/edit", "/billing/abc/print"]) {
    assert.equal(activeNavHref(p, ALL), "/billing", p);
  }
});

test("activeNavHref: Stock-Out and Stock stay apart; More pages are not Stock", () => {
  assert.equal(activeNavHref("/stock/out", ALL), "/stock/out");
  assert.equal(activeNavHref("/stock/out/abc", ALL), "/stock/out");
  assert.equal(activeNavHref("/stock", ALL), "/stock");
  assert.equal(activeNavHref("/stock/abc", ALL), "/stock");
  assert.equal(activeNavHref("/stock/opening", ALL), "/stock/opening");
  assert.equal(activeNavHref("/stock/adjustments/abc", ALL), "/stock/adjustments");
});

test("activeNavHref: every other tab, and a path that is nobody's", () => {
  assert.equal(activeNavHref("/dashboard", ALL), "/dashboard");
  assert.equal(activeNavHref("/suppliers/abc", ALL), "/suppliers");
  assert.equal(activeNavHref("/reports/valuation", ALL), "/reports");
  assert.equal(activeNavHref("/settings", ALL), "/settings");
  assert.equal(activeNavHref("/itemsfoo", ALL), null); // not a folder of /items
  assert.equal(activeNavHref("/nowhere", ALL), null);
});
