// Continuous bill printing: layoutBill. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { layoutBill, sampleInvoice, type PrintInvoice } from "./invoice-layout";
import {
  DEFAULT_PRINT_SETTINGS,
  ONE_CM_IN,
  deriveGrid,
  printedHeight,
  rowsForHeight,
  validatePrintSettings,
  type PrintSettings,
} from "./settings";

const S: PrintSettings = DEFAULT_PRINT_SETTINGS;
const SHEET = S.pageHeightIn;

// A bill whose items never wrap and have no discounts: n items = n printed lines.
function plainInvoice(n: number, patch: Partial<PrintInvoice> = {}): PrintInvoice {
  const base = sampleInvoice(0);
  const lines = Array.from({ length: n }, (_, i) => ({
    itemName: `Item ${i + 1}`,
    quantity: 1,
    unitName: "pc",
    unitPrice: 10,
    lineDiscount: 0,
    lineTotal: 10,
  }));
  return { ...base, lines, subtotal: n * 10, lineDiscountTotal: 0, billDiscount: 0, total: n * 10, ...patch };
}

function textOf(pages: string[][]): string {
  return pages.map((p) => p.join("\n")).join("\n");
}

function assertWidths(pages: string[][], cols: number) {
  pages.forEach((p, i) =>
    p.forEach((l, j) => assert.equal(l.length, cols, `piece ${i + 1} line ${j + 1} is exactly ${cols} wide`))
  );
}

test("right margin is 1 cm wider: 0.8937 in -> 49 characters per line at 12 cpi", () => {
  assert.ok(Math.abs(S.marginRightIn - (0.5 + ONE_CM_IN)) < 1e-9);
  assert.equal(S.marginLeftIn, 0.5, "left margin unchanged");
  assert.deepEqual(deriveGrid(S), { cols: 49, rows: 30 });
  assert.equal(S.continuous, true);
  assert.equal(S.maxSheets, 6);
  assert.equal(validatePrintSettings(S), null);
});

test("printedHeight rounds UP to a whole number of sheets", () => {
  // 30 lines = 5.0 in + 0.5 margins = 5.5 in: exactly one sheet
  assert.deepEqual(printedHeight(S, 30), { sheets: 1, heightIn: 5.5 });
  assert.deepEqual(printedHeight(S, 31), { sheets: 2, heightIn: 11 });
  assert.deepEqual(printedHeight(S, 1), { sheets: 1, heightIn: 5.5 });
  assert.deepEqual(printedHeight(S, 60), { sheets: 2, heightIn: 11 });
  assert.deepEqual(printedHeight(S, 63), { sheets: 2, heightIn: 11 }, "63 lines + margins = 11 in");
  assert.deepEqual(printedHeight(S, 64), { sheets: 3, heightIn: 16.5 });
  assert.equal(rowsForHeight(S, 11), 63);
});

for (const n of [1, 10, 20, 35, 50, 120]) {
  test(`${n}-line bill: exactly one page, height rounded up to a multiple of ${SHEET} in`, () => {
    const r = layoutBill(plainInvoice(n), S);
    assert.equal(r.mode, "continuous");
    assert.equal(r.pages.length, 1, "exactly one page");
    assert.equal(r.clippedLines, 0);
    assert.equal(r.overflowLines, 0);
    assertWidths(r.pages, 49);

    const page = r.pages[0];
    const text = page.join("\n");
    // the number of real lines decides the height
    const used = page.findLastIndex((l) => l.trim() !== "") + 1;
    const expected = printedHeight(S, used);
    assert.equal(r.pageHeightsIn[0], expected.heightIn);
    assert.equal(Math.round((r.pageHeightsIn[0] / SHEET) * 1e6) % 1e6, 0, "whole number of sheets");
    assert.equal(page.length, rowsForHeight(S, expected.heightIn), "page holds exactly the rows of that height");
    assert.ok(page.length / S.lpi + S.marginTopIn + S.marginBottomIn <= expected.heightIn + 1e-9, "never taller than the paper");

    // one header, no paging text
    assert.equal((text.match(/New Kandy Essence Suppliers/g) ?? []).length, 1, "header printed once");
    assert.ok(!/Page\s+\d+\s+of/.test(text), "no Page x of y");
    for (let i = 1; i <= n; i++) assert.ok(new RegExp(`Item ${i}(?!\\d)`).test(text), `item ${i} present`);

    // totals block is last, after every item; footer is the very last line
    const lines = page.map((l) => l.trimEnd());
    const lastItem = lines.findLastIndex((l) => /^Item \d+ /.test(l));
    const totalAt = lines.findIndex((l) => /^TOTAL\s/.test(l));
    assert.ok(totalAt > lastItem, "TOTAL comes after the last item");
    assert.equal(lines[used - 1], "Thank you. Come again.".padStart(Math.floor((49 + 22) / 2)), "footer is the last line");
    assert.ok(lines.slice(totalAt, used).some((l) => /^Credit|Cash received|Cash/.test(l)), "payments follow the total");
  });
}

test("the wrapped sample bills (long names) are one page too, at every width", () => {
  for (const n of [1, 10, 20, 35, 50]) {
    const r = layoutBill(sampleInvoice(n), S);
    assert.equal(r.pages.length, 1, `${n} sample lines -> 1 page`);
    assert.equal(r.mode, "continuous");
    assertWidths(r.pages, 49);
    assert.equal(r.clippedLines, 0);
    const t = r.pages[0].join("\n");
    assert.ok(/^TOTAL\s/m.test(t) && !/Page\s+\d+\s+of/.test(t));
    assert.equal(r.pageHeightsIn[0] % SHEET, 0);
  }
});

test("exceeding the maximum falls back to pieces: header repeated, Page x of y, totals never split", () => {
  const inv = sampleInvoice(120);
  const r = layoutBill(inv, S);
  assert.equal(r.mode, "pieces");
  assert.ok(r.pages.length >= 2);
  assertWidths(r.pages, 49);
  assert.equal(r.clippedLines, 0);
  assert.equal(r.overflowLines, 0);
  const maxH = S.maxSheets * SHEET;
  r.pages.forEach((p, i) => {
    const t = p.join("\n");
    assert.match(t, new RegExp(`Page\\s+${i + 1}\\s+of\\s+${r.pages.length}`), `piece ${i + 1} numbered`);
    assert.ok(t.includes("New Kandy Essence Suppliers"), `piece ${i + 1} has the header`);
    assert.ok(r.pageHeightsIn[i] <= maxH + 1e-9, "never longer than the maximum");
    assert.equal(r.pageHeightsIn[i] % SHEET, 0, "whole sheets");
    if (i < r.pages.length - 1) {
      assert.equal(r.pageHeightsIn[i], maxH, "all but the last are full length");
      assert.ok(!/^TOTAL\s/m.test(t), "totals not on an earlier piece");
    }
  });
  const last = r.pages[r.pages.length - 1].join("\n");
  assert.ok(/^TOTAL\s/m.test(last) && /Subtotal/.test(last) && /Thank you/.test(last), "totals block in one piece, last");
  // no empty trailing piece: the last piece carries real lines
  assert.ok(r.pages[r.pages.length - 1].some((l) => /#\d+|TOTAL/.test(l)));
  // every item exactly once
  const all = textOf(r.pages);
  for (let i = 1; i <= 120; i++) assert.equal((all.match(new RegExp(`#${i}(?!\\d)`, "g")) ?? []).length, 1, `item #${i} once`);
});

test("120 wrapped lines fit on ONE page when the maximum is raised", () => {
  const r = layoutBill(sampleInvoice(120), { ...S, maxSheets: 12 });
  assert.equal(r.mode, "continuous");
  assert.equal(r.pages.length, 1);
  assert.equal(r.pageHeightsIn[0] % SHEET, 0);
  assert.ok(!/Page\s+\d+\s+of/.test(r.pages[0].join("\n")));
});

test("maximum of 1 sheet: a bill that needs 2 sheets is split into 1-sheet pieces", () => {
  const r = layoutBill(plainInvoice(40), { ...S, maxSheets: 1 });
  assert.equal(r.mode, "pieces");
  assert.ok(r.pages.length >= 2);
  r.pages.forEach((p, i) => {
    assert.equal(r.pageHeightsIn[i], SHEET);
    assert.equal(p.length, 30);
  });
});

test("continuous OFF keeps the original one-sheet-per-page behaviour", () => {
  const r = layoutBill(sampleInvoice(50), { ...S, continuous: false });
  assert.equal(r.mode, "sheets");
  assert.ok(r.pages.length >= 3);
  r.pages.forEach((p, i) => {
    assert.equal(p.length, 30);
    assert.equal(r.pageHeightsIn[i], SHEET);
    assert.match(p.join("\n"), /Page\s+\d+\s+of\s+\d+/);
  });
  assertWidths(r.pages, 49);
});

test("at 49 characters wide: names wrap, numbers stay right-aligned, no line is too wide", () => {
  const inv = plainInvoice(3, {
    lines: [
      { itemName: "Very long item name that has to wrap onto several lines on a narrow bill", quantity: 12.5, unitName: "kg", unitPrice: 8750, lineDiscount: 25, lineTotal: 109350 },
      { itemName: "Z".repeat(90), quantity: 1, unitName: "box", unitPrice: 1250.5, lineDiscount: 0, lineTotal: 1250.5 },
      { itemName: "Tiny", quantity: 100, unitName: "pack", unitPrice: 999.99, lineDiscount: 0, lineTotal: 99999 },
    ],
    subtotal: 210600,
    total: 210600,
    payments: [
      { method: "cash", amount: 100000 },
      { method: "cheque", amount: 50000, chequeNumber: "123456", chequeBank: "Commercial Bank of Ceylon PLC", chequeDate: "2026-12-31" },
      { method: "bank_transfer", amount: 10600, reference: "TRX-REF-1234567890123" },
    ],
    cashReceived: 150000,
    credit: 50000,
  });
  const r = layoutBill(inv, S);
  assert.equal(r.clippedLines, 0);
  assertWidths(r.pages, 49);
  const lines = r.pages[0].map((l) => l.trimEnd());
  // the amount column ends on the same character for every item row
  const amountEnds = lines.filter((l) => /\d,\d{3}\.\d{2}$|\d\.\d{2}$/.test(l) && !/^(Subtotal|TOTAL|Line|Bill|Cash|Change|Credit|Cheque|Bank)/.test(l));
  assert.ok(amountEnds.length >= 3);
  amountEnds.forEach((l) => assert.equal(l.length, 49, `amount is flush with the right edge: ${l}`));
  const text = r.pages[0].join("\n");
  assert.equal((text.match(/Z/g) ?? []).length, 90, "a name is never truncated");
  assert.ok(text.includes("TRX-REF-1234567890123") && text.includes("123456"));
});

test("other grids: continuous output stays well-formed (10 cpi, 8 lpi, narrower paper)", () => {
  const variants: PrintSettings[] = [
    { ...S, cpi: 10 },
    { ...S, lpi: 8 },
    { ...S, pageWidthIn: 4.5 },
    { ...S, marginLeftIn: 0.25, marginRightIn: 0.25 },
  ];
  for (const v of variants) {
    assert.equal(validatePrintSettings(v), null);
    const cols = deriveGrid(v).cols;
    for (const n of [1, 10, 50]) {
      const r = layoutBill(sampleInvoice(n), v);
      assertWidths(r.pages, cols);
      assert.equal(r.clippedLines, 0);
      r.pages.forEach((p, i) => assert.ok(p.length / v.lpi + v.marginTopIn + v.marginBottomIn <= r.pageHeightsIn[i] + 1e-9));
    }
  }
});

test("settings: maximum length range check", () => {
  assert.match(validatePrintSettings({ ...S, maxSheets: 0 })!, /Maximum bill length/);
  assert.match(validatePrintSettings({ ...S, maxSheets: 21 })!, /Maximum bill length/);
  assert.match(validatePrintSettings({ ...S, maxSheets: 2.5 })!, /Maximum bill length/);
  assert.equal(validatePrintSettings({ ...S, maxSheets: 20 }), null);
});
