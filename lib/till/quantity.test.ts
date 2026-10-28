// A quantity typed on a bill line. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { MAX_QUANTITY, parseQuantity } from "./quantity";

const ok = (text: string, value: string, opts?: { allowDecimal?: boolean }) =>
  assert.deepEqual(parseQuantity(text, opts), { ok: true, value }, `"${text}"`);
const bad = (text: string, opts?: { allowDecimal?: boolean }) => {
  const r = parseQuantity(text, opts);
  assert.equal(r.ok, false, `"${text}" should be refused`);
  return r.ok ? "" : r.message;
};

test("whole numbers and decimals are applied in the plain form the + and - buttons store", () => {
  ok("5", "5");
  ok("12", "12");
  ok("007", "7");
  ok(" 3 ", "3");
  ok("2.5", "2.5");
  ok("2.50", "2.5");
  ok("0.25", "0.25");
  ok(".5", "0.5");
  ok("5.", "5");
  ok(String(MAX_QUANTITY), String(MAX_QUANTITY));
});

test("empty, zero and junk are refused with a plain message", () => {
  assert.match(bad(""), /Type a quantity/);
  assert.match(bad("   "), /Type a quantity/);
  assert.match(bad("0"), /more than 0/);
  assert.match(bad("0.00"), /more than 0/);
  assert.match(bad("."), /not a valid/);
  assert.match(bad("abc"), /not a valid/);
  assert.match(bad("1e3"), /not a valid/);
  assert.match(bad("-2"), /not a valid/);
  assert.match(bad("1,5"), /not a valid/);
  assert.match(bad("1.2.3"), /not a valid/);
});

test("at most 2 decimals, and a ceiling for a slipped key", () => {
  assert.match(bad("1.234"), /at most 2 decimal/);
  ok("1.23", "1.23");
  assert.match(bad(String(MAX_QUANTITY + 1)), /cannot be more than/);
  assert.match(bad("99999999"), /cannot be more than/);
});

test("a unit that does not allow decimals refuses a decimal point", () => {
  ok("4", "4", { allowDecimal: false });
  assert.match(bad("4.5", { allowDecimal: false }), /whole numbers/);
  ok("4.", "4", { allowDecimal: false }); // a trailing point is just 4
});
