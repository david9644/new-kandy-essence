import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_STOCK_MESSAGE, plainBillError } from "./billing-errors";

test("plainBillError: an item that never had stock gets the plain 'what to do' sentence", () => {
  assert.equal(plainBillError("no stock exists yet for this item"), NO_STOCK_MESSAGE);
  assert.equal(plainBillError("no stock exists yet for item Cola"), NO_STOCK_MESSAGE);
  assert.equal(plainBillError("P0001: No stock exists yet for this item"), NO_STOCK_MESSAGE);
  assert.match(NO_STOCK_MESSAGE, /Record a purchase or opening stock first\.$/);
});

test("plainBillError: other messages are left exactly as they are", () => {
  assert.equal(plainBillError("bill total changed"), "bill total changed");
  assert.equal(plainBillError(""), "");
});
