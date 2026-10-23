// Run with: npm test   (Node's built-in test runner via tsx; no extra deps)
import test from "node:test";
import assert from "node:assert/strict";
import {
  layoutCalibration,
  layoutInvoice,
  layoutInvoiceDetailed,
  sampleInvoice,
  type PrintInvoice,
  type PrintLabel,
} from "./invoice-layout";
import {
  DEFAULT_PRINT_SETTINGS,
  deriveGrid,
  fontSizePt,
  validatePrintSettings,
  type PrintGrid,
} from "./settings";

const GRID: PrintGrid = deriveGrid(DEFAULT_PRINT_SETTINGS);

function invoiceWith(lineCount: number, patch: Partial<PrintInvoice> = {}): PrintInvoice {
  return { ...sampleInvoice(lineCount), ...patch };
}

// Every structural promise of the engine, checked for any bill / grid.
function assertWellFormed(inv: PrintInvoice, grid: PrintGrid) {
  const result = layoutInvoiceDetailed(inv, grid);
  const { pages } = result;
  assert.ok(pages.length >= 1, "at least one page");
  assert.equal(result.clippedLines, 0, "no line had to be clipped");
  assert.equal(result.overflowLines, 0, "no page overflowed its height");

  pages.forEach((page, i) => {
    assert.equal(page.length, grid.rows, `page ${i + 1} has exactly ${grid.rows} lines`);
    page.forEach((line, j) => {
      assert.equal(line.length, grid.cols, `page ${i + 1} line ${j + 1} is exactly ${grid.cols} chars`);
    });
    // "Page x of y" is right, and on every page
    const m = page.join("\n").match(/Page\s+(\d+)\s+of\s+(\d+)/);
    assert.ok(m, `page ${i + 1} shows Page x of y`);
    assert.equal(Number(m![1]), i + 1, "page number");
    assert.equal(Number(m![2]), pages.length, "page count matches");
  });

  // never an empty / header-only trailing page: the last page carries the totals
  assert.ok(pages[pages.length - 1].join("\n").includes("TOTAL"), "totals are on the last page");
  // ... and only on the last page
  pages.slice(0, -1).forEach((p, i) => {
    assert.ok(!/^TOTAL\s/m.test(p.join("\n")), `page ${i + 1} must not contain the totals`);
  });
  return result;
}

for (const n of [1, 10, 20, 35, 50]) {
  test(`${n}-line bill on the default grid is well formed`, () => {
    const result = assertWellFormed(invoiceWith(n), GRID);
    // every item appears exactly once across pages (names include the #n tag when > 6 lines)
    const text = result.pages.map((p) => p.join("\n")).join("\n");
    if (n > 6) {
      for (let i = 1; i <= n; i++) {
        const hits = text.match(new RegExp(`#${i}(?!\\d)`, "g")) ?? [];
        assert.equal(hits.length, 1, `item #${i} printed exactly once`);
      }
    }
  });
}

test("default grid is 49 x 30 (right margin +1 cm) and the page count grows with the bill", () => {
  assert.deepEqual(GRID, { cols: 49, rows: 30 });
  const counts = [1, 10, 20, 35, 50].map((n) => layoutInvoice(invoiceWith(n), GRID).length);
  assert.equal(counts[0], 1);
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] >= counts[i - 1]);
  assert.ok(counts[4] >= 3, "50 lines needs several pages");
});

test("page 1 has the full header, continuation pages the compact one", () => {
  const pages = layoutInvoice(invoiceWith(50), GRID);
  const first = pages[0].join("\n");
  assert.ok(first.includes("NEW KANDY ESSENCE"));
  assert.ok(first.includes("Sample address line"));
  assert.ok(first.includes("081 0000000 / 077 0000000"));
  assert.ok(first.includes("Customer: Sample Customer (CUS-0001)"));
  assert.ok(first.includes("Phone: 077 1234567"));
  assert.ok(first.includes("Cashier: Test"));
  const second = pages[1].join("\n");
  assert.ok(second.includes("NEW KANDY ESSENCE"));
  assert.ok(second.includes("Bill INV-TEST"));
  assert.ok(!second.includes("Sample address line"), "no address on continuation pages");
  assert.ok(second.includes("Item") && second.includes("Amount"), "column header repeated");
});

test("very long item names wrap and are never truncated", () => {
  const inv = invoiceWith(1, {
    lines: [
      {
        itemName: "Z".repeat(120),
        quantity: 2,
        unitName: "pack",
        unitPrice: 10,
        lineDiscount: 0,
        lineTotal: 20,
      },
      {
        itemName: "Zz Zzz Zzzzz zzzzzzz ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ zz z",
        quantity: 1,
        unitName: "box",
        unitPrice: 5,
        lineDiscount: 0,
        lineTotal: 5,
      },
    ],
  });
  const result = assertWellFormed(inv, GRID);
  const text = result.pages.map((p) => p.join("\n")).join("\n");
  const qCount = (text.match(/[Zz]/g) ?? []).length;
  const expected = 120 + "Zz Zzz Zzzzz zzzzzzz ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ zz z".replace(/[^Zz]/g, "").length;
  assert.equal(qCount, expected, "every character of the names is printed");
});

test("line discount is shown only when non-zero", () => {
  const text = layoutInvoice(invoiceWith(10), GRID).map((p) => p.join("\n")).join("\n");
  assert.ok(text.includes("less discount"), "sample has discounted lines");
  const noDisc = invoiceWith(3, {
    lines: invoiceWith(3).lines.map((l) => ({ ...l, lineDiscount: 0 })),
    lineDiscountTotal: 0,
  });
  const text2 = layoutInvoice(noDisc, GRID).map((p) => p.join("\n")).join("\n");
  assert.ok(!text2.includes("less discount"));
  assert.ok(!text2.includes("Line discounts"));
});

test("many payments including cheques: all printed, totals block stays together", () => {
  const payments = [
    { method: "cash", amount: 100 },
    ...Array.from({ length: 6 }, (_, i) => ({
      method: "cheque",
      amount: 50 + i,
      chequeNumber: `90000${i}`,
      chequeBank: "Commercial Bank of Ceylon PLC",
      chequeDate: "2026-12-0" + (i + 1),
    })),
    { method: "bank_transfer", amount: 25, reference: "TRX-REF-123456789" },
  ];
  const inv = invoiceWith(18, { payments, cashReceived: 500, credit: 12.5 });
  const result = assertWellFormed(inv, GRID);
  const pageWithTotal = result.pages.find((p) => p.join("\n").includes("TOTAL"))!;
  const text = pageWithTotal.join("\n");
  for (let i = 0; i < 6; i++) assert.ok(text.includes(`90000${i}`), `cheque ${i} on the totals page`);
  assert.ok(text.includes("TRX-REF-123456789"));
  assert.ok(text.includes("Cash received") && text.includes("Change"));
  assert.ok(text.includes("Credit (unpaid)"));
});

test("cash received / change and credit lines follow the data", () => {
  const withCash = layoutInvoice(
    invoiceWith(2, { payments: [{ method: "cash", amount: 700 }], cashReceived: 1000, credit: 0 }),
    GRID
  )[0].join("\n");
  assert.match(withCash, /Cash received\s+1,000\.00/);
  assert.match(withCash, /Change\s+300\.00/);
  assert.ok(!withCash.includes("Credit (unpaid)"));

  const noCash = layoutInvoice(
    invoiceWith(2, { payments: [], cashReceived: null, credit: 640.5 }),
    GRID
  )[0].join("\n");
  assert.ok(!noCash.includes("Cash received"));
  assert.ok(!noCash.includes("Change"));
  assert.match(noCash, /Credit \(unpaid\)\s+640\.50/);
});

test("Walk-in bills print 'Walk-in' and no customer phone", () => {
  const text = layoutInvoice(
    invoiceWith(2, { customerName: null, customerCode: null, customerPhone: null }),
    GRID
  )[0].join("\n");
  assert.ok(text.includes("Customer: Walk-in"));
  assert.ok(!text.includes("Phone:"));
});

test("COPY / REVISED label is on every page; none when null", () => {
  for (const label of ["COPY", "REVISED"] as PrintLabel[]) {
    const pages = layoutInvoice(invoiceWith(50, { label }), GRID);
    pages.forEach((p, i) => assert.ok(p.join("\n").includes(label!), `${label} on page ${i + 1}`));
  }
  const none = layoutInvoice(invoiceWith(50, { label: null }), GRID);
  none.forEach((p) => assert.ok(!/COPY|REVISED/.test(p.join("\n"))));
});

test("totals block: one bill where it fits exactly, one where it spills to a new page", () => {
  let exactFit = -1;
  let spill = -1;
  for (let n = 1; n <= 90; n++) {
    const pages = layoutInvoice(invoiceWith(n), GRID);
    const last = pages[pages.length - 1];
    // body of the last page = everything after the header's closing rule
    const trailingBlank = (() => {
      let c = 0;
      for (let i = last.length - 1; i >= 0 && last[i].trim() === ""; i--) c++;
      return c;
    })();
    if (trailingBlank === 0 && exactFit < 0) exactFit = n;
    const itemsOnLast = last.some((l) => /#\d+/.test(l));
    if (pages.length > 1 && !itemsOnLast && spill < 0) spill = n;
  }
  assert.ok(exactFit > 0, "found a bill whose totals end exactly on the last line");
  assert.ok(spill > 0, "found a bill whose totals moved to their own final page");

  for (const n of [exactFit, spill]) {
    const result = assertWellFormed(invoiceWith(n), GRID);
    const last = result.pages[result.pages.length - 1].join("\n");
    assert.ok(last.includes("Subtotal") && last.includes("TOTAL"), "totals are in one piece");
  }
  // the spill page keeps its header
  const spillPages = layoutInvoice(invoiceWith(spill), GRID);
  assert.ok(spillPages[spillPages.length - 1].join("\n").includes("Bill INV-TEST"));
});

test("no empty trailing page and widths hold for every bill size 1..120", () => {
  for (let n = 1; n <= 120; n++) assertWellFormed(invoiceWith(n), GRID);
});

test("other grids work: narrow, wide, short pages", () => {
  for (const grid of [
    { cols: 40, rows: 24 },
    { cols: 80, rows: 40 },
    { cols: 30, rows: 20 },
  ]) {
    for (const n of [1, 7, 30]) assertWellFormed(invoiceWith(n), grid);
  }
});

test("huge numbers on a narrow grid fall back to the stacked layout without clipping", () => {
  const inv = invoiceWith(3, {
    lines: [
      {
        itemName: "Gold bar",
        quantity: 1234567.5,
        unitName: "kilogram",
        unitPrice: 987654321.99,
        lineDiscount: 1000,
        lineTotal: 1234567 * 987654321.99,
      },
    ],
    subtotal: 1234567 * 987654321.99,
    total: 1234567 * 987654321.99,
  });
  assertWellFormed(inv, { cols: 36, rows: 30 });
});

test("calibration page: border on the exact first/last column and line, ruler, numbers", () => {
  const [page] = layoutCalibration(GRID);
  assert.equal(page.length, GRID.rows);
  page.forEach((l) => assert.equal(l.length, GRID.cols));
  assert.equal(page[0], "+" + "-".repeat(GRID.cols - 2) + "+");
  assert.equal(page[GRID.rows - 1], "+" + "-".repeat(GRID.cols - 2) + "+");
  for (let r = 1; r < GRID.rows - 1; r++) {
    assert.equal(page[r][0], "|", `line ${r + 1} first column`);
    assert.equal(page[r][GRID.cols - 1], "|", `line ${r + 1} last column`);
  }
  // ones-digit ruler on line 3: column c shows c % 10
  for (let c = 2; c <= GRID.cols - 1; c++) assert.equal(page[2][c - 1], String(c % 10));
  assert.equal(page[1][9], "1", "tens ruler: column 10 -> 1");
  assert.equal(page[1][39], "4", "tens ruler: column 40 -> 4");
  assert.match(page[10], /^\|11/, "line numbers inside the border");
  assert.ok(page.join("\n").includes("TL") && page.join("\n").includes("BR"));
});

test("settings: derived grid, font size and validation", () => {
  assert.deepEqual(deriveGrid(DEFAULT_PRINT_SETTINGS), { cols: 49, rows: 30 });
  assert.equal(fontSizePt(12), 10, "12 cpi -> 10 pt Courier-like (advance = 1/12 in)");
  assert.equal(validatePrintSettings(DEFAULT_PRINT_SETTINGS), null);
  assert.match(validatePrintSettings({ ...DEFAULT_PRINT_SETTINGS, cpi: 100 })!, /Characters per inch/);
  assert.match(validatePrintSettings({ ...DEFAULT_PRINT_SETTINGS, pageWidthIn: 1 })!, /width/);
  assert.match(
    validatePrintSettings({ ...DEFAULT_PRINT_SETTINGS, marginLeftIn: 2, marginRightIn: 2 })!,
    /characters fit/
  );
  assert.match(validatePrintSettings({ ...DEFAULT_PRINT_SETTINGS, footer: "x".repeat(81) })!, /80/);
  assert.deepEqual(deriveGrid({ ...DEFAULT_PRINT_SETTINGS, cpi: 10 }), { cols: 41, rows: 30 });
});
