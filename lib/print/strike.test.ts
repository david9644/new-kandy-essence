// Crossed-out normal price: the shared rule and the print engine. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { lineAmounts } from "../line-price";
import {
  layoutBill,
  layoutBillPlain,
  layoutInvoice,
  sampleInvoice,
  fmtMoney,
  type PrintInvoice,
  type PrintInvoiceLine,
} from "./invoice-layout";
import {
  DEFAULT_PRINT_SETTINGS,
  applyOverrides,
  printedHeight,
  settingsToQuery,
  validatePrintSettings,
  type PrintSettings,
  type StrikeMode,
} from "./settings";

const S: PrintSettings = DEFAULT_PRINT_SETTINGS;
const MODES: StrikeMode[] = ["strike", "text", "off"];

// ── the rule ────────────────────────────────────────────────────────────

test("rule: line discount only (list price = price): struck, normal = qty x price", () => {
  const a = lineAmounts({ quantity: 3, unitPrice: 120, listUnitPrice: 120, lineTotal: 300 });
  assert.deepEqual(a, { normalUnitPrice: 120, normalAmount: 360, finalAmount: 300, struck: true });
});

test("rule: price typed BELOW the list price: struck against the list price", () => {
  const a = lineAmounts({ quantity: 2, unitPrice: 120, listUnitPrice: 150, lineTotal: 240 });
  assert.equal(a.normalUnitPrice, 150);
  assert.equal(a.normalAmount, 300);
  assert.equal(a.struck, true);
});

test("rule: price typed ABOVE the list price: nothing struck", () => {
  const a = lineAmounts({ quantity: 2, unitPrice: 180, listUnitPrice: 150, lineTotal: 360 });
  assert.equal(a.normalUnitPrice, 180, "N is the higher of the two");
  assert.equal(a.normalAmount, 360);
  assert.equal(a.struck, false);
});

test("rule: price above the list price WITH a discount: struck against what was asked (180), not the list", () => {
  const a = lineAmounts({ quantity: 2, unitPrice: 180, listUnitPrice: 150, lineTotal: 330 });
  assert.equal(a.normalAmount, 360);
  assert.equal(a.struck, true);
});

test("rule: no list price recorded: unit price is the normal price", () => {
  assert.equal(lineAmounts({ quantity: 3, unitPrice: 100, listUnitPrice: null, lineTotal: 300 }).struck, false);
  const d = lineAmounts({ quantity: 3, unitPrice: 100, listUnitPrice: null, lineTotal: 250 });
  assert.equal(d.normalAmount, 300);
  assert.equal(d.struck, true);
  assert.equal(lineAmounts({ quantity: 3, unitPrice: 100, lineTotal: 300 }).struck, false, "undefined = none");
});

test("rule: old bills (null snapshot) behave exactly like 'no list price'", () => {
  const old = { quantity: 5, unitPrice: 40, lineTotal: 190 };
  assert.deepEqual(lineAmounts({ ...old, listUnitPrice: null }), lineAmounts({ ...old }));
  assert.equal(lineAmounts({ ...old, listUnitPrice: null }).normalAmount, 200);
});

test("rule: nothing discounted, price = list: single amount", () => {
  assert.equal(lineAmounts({ quantity: 4, unitPrice: 25.5, listUnitPrice: 25.5, lineTotal: 102 }).struck, false);
});

test("rule: rounding to cents; differences up to half a cent never strike", () => {
  const a = lineAmounts({ quantity: 1.5, unitPrice: 33.33, listUnitPrice: 33.33, lineTotal: 50 });
  assert.equal(a.normalAmount, 50, "49.995 rounds half up to 50.00");
  assert.equal(a.struck, false);
  assert.equal(lineAmounts({ quantity: 3, unitPrice: 33.33, listUnitPrice: 33.33, lineTotal: 99.99 }).struck, false);
  assert.equal(lineAmounts({ quantity: 1, unitPrice: 10, listUnitPrice: 10, lineTotal: 9.99 }).struck, true, "a 1-cent discount still strikes");
});

// ── the print engine ────────────────────────────────────────────────────

function lineOf(over: Partial<PrintInvoiceLine>): PrintInvoiceLine {
  return {
    itemName: "Item",
    quantity: 1,
    unitName: "pc",
    unitPrice: 100,
    lineDiscount: 0,
    lineTotal: 100,
    listUnitPrice: 100,
    ...over,
  };
}

function billOf(lines: PrintInvoiceLine[]): PrintInvoice {
  const base = sampleInvoice(0);
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const disc = lines.reduce((s, l) => s + l.lineDiscount, 0);
  return {
    ...base,
    lines,
    subtotal,
    lineDiscountTotal: disc,
    billDiscount: 0,
    total: subtotal - disc,
    payments: [{ method: "cash", amount: subtotal - disc }],
    cashReceived: null,
    credit: 0,
  };
}

function textOf(pages: string[][]): string {
  return pages.map((p) => p.join("\n")).join("\n");
}

test("every printed line is exactly the grid width in all three modes, for many bill sizes", () => {
  for (const mode of MODES) {
    for (const n of [1, 6, 7, 20, 50, 120]) {
      const r = layoutBill(sampleInvoice(n), { ...S, strikeMode: mode });
      assert.equal(r.clippedLines, 0, `${mode} ${n}: nothing clipped`);
      assert.equal(r.overflowLines, 0);
      r.pages.forEach((p) => p.forEach((l) => assert.equal(l.length, 49, `${mode} ${n}: width`)));
      assert.equal(r.styles.length, r.pages.length);
      if (mode !== "strike") assert.ok(r.styles.every((s) => s.length === 0), `${mode}: no style runs`);
    }
  }
});

test("a bill with no discounted lines is IDENTICAL in strike, text and off modes (as compact as before)", () => {
  const inv = billOf([
    lineOf({ itemName: "Plain one" }),
    lineOf({ itemName: "Typed above the list price", unitPrice: 120, listUnitPrice: 100, lineTotal: 120 }),
    lineOf({ itemName: "No list price", listUnitPrice: null }),
  ]);
  const off = layoutBill(inv, { ...S, strikeMode: "off" });
  for (const mode of ["strike", "text"] as const) {
    const r = layoutBill(inv, { ...S, strikeMode: mode });
    assert.deepEqual(r.pages, off.pages);
    assert.deepEqual(r.pageHeightsIn, off.pageHeightsIn);
  }
});

test("a discounted line is two lines (name, then qty x price with the amounts); the old 'less discount' row is replaced", () => {
  const d = lineOf({ itemName: "Fresh milk", quantity: 3, unitPrice: 120, lineDiscount: 60, lineTotal: 300 });
  const inv = billOf([d]);
  const off = layoutBill(inv, { ...S, strikeMode: "off" });
  const strike = layoutBill(inv, { ...S, strikeMode: "strike" });
  const offLines = off.pages[0].join("\n");
  assert.ok(/less discount/.test(offLines));
  const text = strike.pages[0].map((l) => l.trimEnd());
  const at = text.findIndex((l) => l === "Fresh milk");
  assert.ok(at >= 0, "name on its own line");
  assert.match(text[at + 1], /^ {2}3 pc x 120\.00 +360\.00 300\.00$/);
  assert.ok(!/less discount/.test(strike.pages[0].join("\n")));
  // the run covers exactly the normal amount
  const run = strike.styles[0].find((r) => r.line === at + 1)!;
  assert.equal(strike.pages[0][at + 1].slice(run.start, run.end), "360.00");
  assert.equal(strike.pages[0][at + 1].slice(run.end), " 300.00");
});

test("runs always cover exactly the normal amount, never the final amount", () => {
  for (const n of [8, 30]) {
    const inv = sampleInvoice(n);
    const r = layoutBill(inv, { ...S, strikeMode: "strike" });
    let count = 0;
    r.pages.forEach((page, pi) =>
      r.styles[pi].forEach((run) => {
        count++;
        const struck = page[run.line].slice(run.start, run.end);
        assert.match(struck, /^[\d,]+\.\d{2}$/, `struck text is an amount: "${struck}"`);
        assert.match(page[run.line].slice(run.end), /^ [\d,]+\.\d{2}$/, "final amount follows");
        assert.ok(run.end <= 49 && run.start >= 0);
      })
    );
    assert.ok(count > 0, "the sample contains discounted lines");
  }
});

test("all four kinds of sample line are present and behave: below list and discounts strike, above list and no list do not", () => {
  const inv = sampleInvoice(12);
  const struck = inv.lines.map((l) =>
    lineAmounts({ quantity: l.quantity, unitPrice: l.unitPrice, listUnitPrice: l.listUnitPrice, lineTotal: l.lineTotal }).struck
  );
  assert.ok(inv.lines.some((l) => l.listUnitPrice === null), "an item with no list price");
  assert.ok(inv.lines.some((l, i) => l.listUnitPrice != null && l.listUnitPrice < l.unitPrice && !struck[i]), "price above the list price");
  assert.ok(inv.lines.some((l, i) => l.listUnitPrice != null && l.listUnitPrice > l.unitPrice && struck[i]), "price below the list price");
  assert.ok(inv.lines.some((l, i) => l.lineDiscount > 0 && struck[i]), "a line discount");
  assert.ok(inv.lines.some((l, i) => l.lineDiscount === 0 && !struck[i]), "a plain line");
});

test("text mode writes '(was 360.00)' and has no style runs; plain fallback does the same from strike mode", () => {
  const inv = billOf([lineOf({ itemName: "Fresh milk", quantity: 3, unitPrice: 120, lineDiscount: 60, lineTotal: 300 })]);
  const t = layoutBill(inv, { ...S, strikeMode: "text" });
  assert.ok(textOf(t.pages).includes("(was 360.00) 300.00"));
  assert.ok(t.styles[0].length === 0);
  const plain = layoutBillPlain(inv, { ...S, strikeMode: "strike" });
  assert.deepEqual(plain.pages, t.pages);
  assert.ok(plain.styles.every((s) => s.length === 0));
  const plainOff = layoutBillPlain(inv, { ...S, strikeMode: "off" });
  assert.ok(!textOf(plainOff.pages).includes("(was"), "'off' stays off");
  // and the strike-mode text really has no "(was" in it
  assert.ok(!textOf(layoutBill(inv, { ...S, strikeMode: "strike" }).pages).includes("(was"));
});

test("continuous height counts the extra lines of discounted items", () => {
  // 30 plain lines vs the same bill with discounts that add one line each
  const plain = billOf(Array.from({ length: 30 }, (_, i) => lineOf({ itemName: `Item ${i + 1}` })));
  const disc = billOf(
    Array.from({ length: 30 }, (_, i) =>
      lineOf({ itemName: `Item ${i + 1}`, quantity: 2, unitPrice: 100, lineDiscount: 20, lineTotal: 180 })
    )
  );
  const used = (pages: string[][]) => pages[0].findLastIndex((l) => l.trim() !== "") + 1;
  const a = layoutBill(plain, S);
  const b = layoutBill(disc, S);
  assert.equal(a.pages.length, 1);
  assert.equal(b.pages.length, 1);
  // +1 per discounted item (name line + amounts line instead of one row) and +1 for the
  // "Line discounts" row in the totals block
  assert.equal(used(b.pages) - used(a.pages), 31, "one extra printed line per discounted item");
  assert.equal(a.pageHeightsIn[0], printedHeight(S, used(a.pages)).heightIn);
  assert.equal(b.pageHeightsIn[0], printedHeight(S, used(b.pages)).heightIn);
  assert.ok(b.pageHeightsIn[0] > a.pageHeightsIn[0], "the discounted bill needs a longer piece");
  // and off mode counts the old 'less discount' row the same way (name + row = +1)
  const off = layoutBill(disc, { ...S, strikeMode: "off" });
  assert.equal(used(off.pages), used(b.pages));
});

test("no empty trailing piece when a long bill is cut, struck lines included", () => {
  for (const mode of MODES) {
    const r = layoutBill(sampleInvoice(120), { ...S, strikeMode: mode });
    assert.equal(r.mode, "pieces");
    r.pages.forEach((p, i) => {
      assert.ok(p.some((l) => l.trim() !== ""), `piece ${i + 1} is not empty`);
    });
    const last = r.pages[r.pages.length - 1].join("\n");
    assert.ok(/^TOTAL\s/m.test(last), "totals on the last piece");
    // style runs only point at real lines of their own piece
    r.styles.forEach((runs, i) => runs.forEach((run) => assert.ok(run.line < r.pages[i].length)));
  }
});

test("a struck line is never cut between pages when sheets are used (continuous OFF)", () => {
  const r = layoutBill(sampleInvoice(40), { ...S, continuous: false, strikeMode: "strike" });
  r.pages.forEach((p, pi) => {
    p.forEach((l, i) => {
      const run = r.styles[pi].find((x) => x.line === i);
      if (run) {
        // the amounts row is directly under a name line on the same page
        assert.ok(i > 0 && p[i - 1].trim() !== "", "the name line is on the same page");
      }
    });
    assert.equal(p.length, 30);
  });
});

test("huge amounts on a narrow grid never exceed the width", () => {
  const inv = billOf([
    lineOf({ itemName: "Gold bar", quantity: 1234567.5, unitName: "kilogram", unitPrice: 987654321.99, lineDiscount: 1000, lineTotal: 1234567.5 * 987654321.99 - 1000, listUnitPrice: 999999999.99 }),
  ]);
  for (const mode of MODES) {
    for (const cpi of [12, 17]) {
      const settings = { ...S, cpi, strikeMode: mode, marginLeftIn: 0.5, marginRightIn: cpi === 17 ? 2.2 : 0.8937 };
      if (validatePrintSettings(settings)) continue;
      const r = layoutBill(inv, settings);
      assert.equal(r.clippedLines, 0, `${mode} cpi ${cpi}`);
      r.pages.forEach((p) => p.forEach((l) => assert.equal(l.length, Math.floor((5.5 - 0.5 - settings.marginRightIn) * cpi + 1e-9))));
    }
  }
  // the legacy grid API (calibration page etc.) still works and never strikes
  const legacy = layoutInvoice(sampleInvoice(10), { cols: 49, rows: 30 });
  assert.ok(legacy.length >= 1);
});

test("settings: strikeMode default, validation, query round-trip", () => {
  assert.equal(S.strikeMode, "strike");
  assert.match(validatePrintSettings({ ...S, strikeMode: "bogus" as StrikeMode })!, /normal price/i);
  assert.equal(validatePrintSettings({ ...S, strikeMode: "off" }), null);
  const q = new URLSearchParams(settingsToQuery({ ...S, strikeMode: "text" }));
  assert.equal(q.get("sm"), "text");
  assert.equal(applyOverrides(S, { sm: "text" }).strikeMode, "text");
  assert.equal(applyOverrides(S, { sm: "nonsense" }).strikeMode, "strike");
  assert.equal(fmtMoney(360), "360.00");
});

// ── "Items: N" (number of bill lines; nothing is added up across units) ─

test("printed bill shows 'Items: N' = the number of bill lines: 0, 1 and many", () => {
  for (const n of [0, 1, 2, 12, 60]) {
    const inv = n === 0 ? billOf([]) : sampleInvoice(n);
    for (const mode of MODES) {
      const r = layoutBill(inv, { ...S, strikeMode: mode });
      const text = textOf(r.pages);
      const hits = text.match(/^Items: \d+ *$/gm) ?? [];
      assert.equal(hits.length, 1, `${n} lines / ${mode}: exactly one Items line`);
      assert.equal(hits[0].trim(), `Items: ${n}`);
      r.pages.forEach((p) => p.forEach((l) => assert.equal(l.length, 49)));
      // it sits at the top of the totals block, right under the separator, before the money
      const lines = r.pages.at(-1)!.map((l) => l.trimEnd());
      const at = lines.findIndex((l) => l === `Items: ${n}`);
      assert.match(lines[at - 1], /^-+$/);
      assert.match(lines[at + 1], /^Subtotal/);
      // no quantity totals anywhere
      assert.ok(!/total qty/i.test(text));
    }
  }
});

test("a long bill cut into pieces shows 'Items: N' once, on the last piece, with N = all lines", () => {
  const inv = sampleInvoice(120);
  const r = layoutBill(inv, S);
  assert.equal(r.mode, "pieces");
  const perPiece = r.pages.map((p) => (p.join("\n").match(/^Items: \d+/gm) ?? []).length);
  assert.deepEqual(perPiece, r.pages.map((_, i) => (i === r.pages.length - 1 ? 1 : 0)));
  assert.match(textOf(r.pages), /^Items: 120 *$/m);
});

test("the Items line costs exactly one printed line in the continuous height count", () => {
  const inv = sampleInvoice(10);
  const r = layoutBill(inv, S);
  const used = r.pages[0].findLastIndex((l) => l.trim() !== "") + 1;
  // the same bill with the Items line taken out has one line fewer
  const without = r.pages[0].filter((l) => !/^Items: \d+/.test(l.trimEnd()));
  const usedWithout = without.findLastIndex((l) => l.trim() !== "") + 1;
  assert.equal(used - usedWithout, 1);
  assert.equal(r.pageHeightsIn[0], printedHeight(S, used).heightIn);
});
