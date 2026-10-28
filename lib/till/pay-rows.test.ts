// The Take the money dialog: what picking an other payment method does. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  addOtherRow,
  afterBillChange,
  buildPayments,
  computePay,
  effectivePayment,
  patchOtherRow,
  removeOtherRow,
  setCashText,
  type PayState,
} from "./pay";

const TOTAL = 150000; // Rs 1,500.00
const TODAY = "2026-10-28";
const fresh = (): PayState => ({ pay: { cash: "", rows: [] }, cashAuto: true });
const eff = (s: PayState, total = TOTAL) => effectivePayment(total, s);
const sum = (s: PayState, hasCustomer = false, total = TOTAL) => computePay(total, eff(s, total), hasCustomer);

test("a fresh dialog: cash is pre-filled with the amount to pay", () => {
  const e = eff(fresh());
  assert.equal(e.cash, "1500");
  assert.equal(sum(fresh()).issues.length, 0);
});

test("adding an other method clears the pre-filled cash; the row takes the amount due", () => {
  const s = addOtherRow(fresh(), "r1", TODAY);
  assert.equal(s.cashAuto, false);
  assert.equal(s.pay.cash, "");
  const e = eff(s);
  assert.equal(e.cash, "");
  assert.equal(e.rows[0].method, "bank_transfer");
  assert.equal(e.rows[0].amount, "1500");
  const m = sum(s);
  assert.equal(m.cashTenderedC, 0);
  assert.equal(m.nonCashC, TOTAL);
  assert.equal(m.changeC, 0);
  assert.equal(m.creditC, 0);
  assert.deepEqual(m.issues, []);
});

test("cheque only: the row takes the whole amount and the cheque details are still required", () => {
  let s = addOtherRow(fresh(), "r1", TODAY);
  s = patchOtherRow(s, "r1", { method: "cheque" });
  assert.equal(eff(s).rows[0].amount, "1500");
  assert.equal(eff(s).cash, "");
  assert.match(sum(s).issues[0], /cheque number/);
  s = patchOtherRow(s, "r1", { number: "123456", bank: "BOC" });
  assert.deepEqual(sum(s).issues, []);
  const pays = buildPayments(sum(s), eff(s));
  assert.deepEqual(pays, [
    { method: "cheque", amount: 1500, cheque_number: "123456", cheque_bank: "BOC", cheque_date: TODAY },
  ]);
});

test("bank transfer only: one payment row, no cash, no change", () => {
  const s = addOtherRow(fresh(), "r1", TODAY);
  const pays = buildPayments(sum(s), eff(s));
  assert.deepEqual(pays, [{ method: "bank_transfer", amount: 1500, reference: undefined }]);
  assert.equal(sum(s).changeC, 0);
});

test("a split: typing cash afterwards reduces the other amount, the total stays right", () => {
  let s = addOtherRow(fresh(), "r1", TODAY);
  s = setCashText(s, "500");
  let e = eff(s);
  assert.equal(e.cash, "500");
  assert.equal(e.rows[0].amount, "1000");
  assert.deepEqual(sum(s).issues, []);
  assert.deepEqual(buildPayments(sum(s), e), [
    { method: "cash", amount: 500 },
    { method: "bank_transfer", amount: 1000, reference: undefined },
  ]);
  s = setCashText(s, "1200");
  e = eff(s);
  assert.equal(e.rows[0].amount, "300");
  s = setCashText(s, "");
  assert.equal(eff(s).rows[0].amount, "1500");
  // cash tendered above the bill leaves nothing for the row: it must be removed or fixed
  s = setCashText(s, "2000");
  assert.equal(eff(s).rows[0].amount, "");
  assert.ok(sum(s).issues.length > 0);
});

test("typing an amount into the row fixes it; the rest is then a shortfall, as before", () => {
  let s = addOtherRow(fresh(), "r1", TODAY);
  s = patchOtherRow(s, "r1", { amount: "400" });
  assert.equal(s.pay.rows[0].amountAuto, false);
  assert.equal(eff(s).rows[0].amount, "400");
  assert.match(sum(s).issues[0], /not covered/);
  s = setCashText(s, "1100");
  assert.deepEqual(sum(s).issues, []);
  assert.equal(eff(s).rows[0].amount, "400");
});

test("a typed cash amount is kept when an other method is added afterwards (a split in progress)", () => {
  let s = setCashText(fresh(), "500");
  s = addOtherRow(s, "r1", TODAY);
  assert.equal(eff(s).cash, "500");
  assert.equal(eff(s).rows[0].amount, "1000");
});

test("switching between cheque and bank transfer keeps the amount", () => {
  let s = addOtherRow(fresh(), "r1", TODAY);
  s = setCashText(s, "250");
  s = patchOtherRow(s, "r1", { method: "cheque" });
  s = patchOtherRow(s, "r1", { method: "bank_transfer" });
  assert.equal(eff(s).cash, "250");
  assert.equal(eff(s).rows[0].amount, "1250");
});

test("credit: no cash unless typed, needs a customer, the amount is the rest", () => {
  let s = addOtherRow(fresh(), "r1", TODAY);
  s = patchOtherRow(s, "r1", { method: "credit" });
  assert.equal(s.cashAuto, false);
  assert.equal(eff(s).cash, "");
  assert.equal(sum(s, false).creditC, TOTAL);
  assert.match(sum(s, false).issues[0], /registered customer/);
  assert.deepEqual(sum(s, true).issues, []);
  assert.deepEqual(buildPayments(sum(s, true), eff(s)), []);
  s = setCashText(s, "400");
  assert.equal(sum(s, true).creditC, 110000);
  assert.deepEqual(buildPayments(sum(s, true), eff(s)), [{ method: "cash", amount: 400 }]);
});

test("a credit row first, then a transfer: the transfer is not filled in for the cashier", () => {
  let s = patchOtherRow(addOtherRow(fresh(), "r1", TODAY), "r1", { method: "credit" });
  s = addOtherRow(s, "r2", TODAY);
  assert.equal(s.pay.rows[1].amountAuto, false);
  assert.equal(eff(s).rows[1].amount, "");
  assert.match(sum(s, true).issues[0], /bank transfer amount/);
});

test("changing credit to a bank transfer: the row takes the amount due, cash stays cleared", () => {
  let s = patchOtherRow(addOtherRow(fresh(), "r1", TODAY), "r1", { method: "credit" });
  s = patchOtherRow(s, "r1", { method: "bank_transfer" });
  assert.equal(eff(s).cash, "");
  assert.equal(eff(s).rows[0].amount, "1500");
  assert.deepEqual(sum(s).issues, []);
});

test("removing the other method fills the cash again and leaves no stray amount", () => {
  let s = addOtherRow(fresh(), "r1", TODAY);
  s = patchOtherRow(s, "r1", { amount: "900" });
  s = setCashText(s, "600");
  s = removeOtherRow(s, "r1");
  assert.equal(s.cashAuto, true);
  assert.deepEqual(s.pay.rows, []);
  assert.equal(eff(s).cash, "1500");
  assert.equal(sum(s).paidC, TOTAL);
  // credit removed
  let c = patchOtherRow(addOtherRow(fresh(), "r1", TODAY), "r1", { method: "credit" });
  c = removeOtherRow(c, "r1");
  assert.equal(eff(c).cash, "1500");
});

test("two rows: the first following row takes the rest, a fixed row is respected", () => {
  let s = addOtherRow(fresh(), "r1", TODAY);
  s = patchOtherRow(s, "r1", { amount: "300" });
  s = addOtherRow(s, "r2", TODAY);
  const e = eff(s);
  assert.equal(e.rows[0].amount, "300");
  assert.equal(e.rows[1].amount, "1200");
  assert.equal(e.cash, "");
  // removing the following row: cash fills the part the fixed row leaves
  const back = removeOtherRow(s, "r2");
  assert.equal(back.cashAuto, true);
  assert.equal(eff(back).cash, "1200");
});

test("the bill changing keeps a following row following, and makes plain cash follow again", () => {
  let s = addOtherRow(fresh(), "r1", TODAY);
  s = afterBillChange(s);
  assert.equal(s.cashAuto, false);
  assert.equal(eff(s, 200000).rows[0].amount, "2000");
  const typed = afterBillChange(setCashText(fresh(), "100"));
  assert.equal(typed.cashAuto, true);
  const credit = patchOtherRow(addOtherRow(fresh(), "r1", TODAY), "r1", { method: "credit" });
  assert.equal(afterBillChange(credit).cashAuto, false);
});

test("rows from a saved bill (edit) are fixed amounts, unchanged by the new rules", () => {
  const saved: PayState = {
    pay: {
      cash: "500",
      rows: [
        { key: "a", method: "cheque", amount: "1000", number: "1", bank: "B", date: TODAY, reference: "" },
      ],
    },
    cashAuto: false,
  };
  const e = eff(saved);
  assert.equal(e.cash, "500");
  assert.equal(e.rows[0].amount, "1000");
  assert.deepEqual(sum(saved).issues, []);
});
