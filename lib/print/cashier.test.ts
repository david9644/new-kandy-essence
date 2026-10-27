// The text after "Cashier:" on a bill. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { layoutBill, layoutBillPlain, sampleInvoice, type PrintInvoice } from "./invoice-layout";
import {
  CASHIER_TEXT_MAX,
  DEFAULT_PRINT_SETTINGS,
  applyOverrides,
  cashierShown,
  deriveGrid,
  settingsToQuery,
  validatePrintSettings,
  type PrintSettings,
} from "./settings";

const S: PrintSettings = DEFAULT_PRINT_SETTINGS;
const COLS = deriveGrid(S).cols;

function bill(cashierName: string | null, lineCount = 3, extra: Partial<PrintInvoice> = {}): PrintInvoice {
  return { ...sampleInvoice(lineCount), cashierName, ...extra };
}

function allLines(inv: PrintInvoice, s: PrintSettings): string[] {
  return layoutBill(inv, s).pages.flat();
}

function cashierLines(lines: string[]): string[] {
  return lines.filter((l) => /Cashier:/.test(l));
}

test("default text: 'Cashier: New Kandy Essence' instead of the user's name", () => {
  assert.equal(S.cashierText, "New Kandy Essence");
  const lines = allLines(bill("Kamal"), S);
  const c = cashierLines(lines);
  assert.equal(c.length, 1);
  assert.match(c[0], /Cashier: New Kandy Essence\s*$/);
  assert.ok(!lines.join("\n").includes("Kamal"), "the user's name is not printed");
  // the date stays on the same line, left; the whole line is the grid width
  assert.match(c[0], /^Date: 2026-01-01 +Cashier: New Kandy Essence$/);
  assert.equal(c[0].length, COLS);
});

test("custom text is printed as typed (spaces tidied)", () => {
  const lines = allLines(bill("Kamal"), { ...S, cashierText: "  Main   Counter " });
  const c = cashierLines(lines);
  assert.equal(c.length, 1);
  assert.match(c[0], /Cashier: Main Counter\s*$/);
});

test("empty setting falls back to the stored user name, as before", () => {
  for (const blank of ["", "   "]) {
    const lines = allLines(bill("Kamal"), { ...S, cashierText: blank });
    assert.match(cashierLines(lines)[0], /Cashier: Kamal\s*$/);
  }
});

test("empty setting and no stored name: no Cashier text at all", () => {
  const lines = allLines(bill(null), { ...S, cashierText: "" });
  assert.equal(cashierLines(lines).length, 0);
  assert.ok(lines.some((l) => l.startsWith("Date: 2026-01-01")));
});

test("an Owner-created and a Store Keeper-created bill show exactly the same text", () => {
  const owner = allLines(bill("vidu (Owner)"), S);
  const keeper = allLines(bill("PINTEST Keeper"), S);
  assert.deepEqual(owner, keeper);
  // with the fallback the names differ, so the setting is what makes them equal
  const o2 = cashierLines(allLines(bill("vidu"), { ...S, cashierText: "" }))[0];
  const k2 = cashierLines(allLines(bill("Nimal"), { ...S, cashierText: "" }))[0];
  assert.notEqual(o2, k2);
});

test("a 30-character text stays within the line width: continuous, sheets, plain, COPY / REVISED", () => {
  const long = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcd"; // 30 characters
  assert.equal(long.length, CASHIER_TEXT_MAX);
  const s = { ...S, cashierText: long };
  assert.equal(validatePrintSettings(s), null);
  for (const continuous of [true, false]) {
    for (const label of [null, "COPY", "REVISED"] as const) {
      for (const lineCount of [1, 3, 60]) {
        for (const fn of [layoutBill, layoutBillPlain]) {
          const r = fn(bill("x", lineCount, { label }), { ...s, continuous });
          for (const page of r.pages) {
            for (const l of page) assert.ok(l.length <= COLS, `line wider than ${COLS}: "${l}"`);
          }
          assert.equal(r.clippedLines, 0);
          const c = cashierLines(r.pages.flat());
          assert.equal(c.length, 1, `exactly one Cashier line (continuous=${continuous}, ${label}, ${lineCount})`);
          assert.ok(c[0].includes(`Cashier: ${long}`));
        }
      }
    }
  }
});

test("a text too long for the date's line moves under the date and wraps, never overflowing", () => {
  // 30 characters + "Cashier: " + the date do not fit side by side on 49 columns
  const lines = allLines(bill("x"), { ...S, cashierText: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcd" });
  const i = lines.findIndex((l) => l.startsWith("Date: 2026-01-01"));
  assert.ok(i >= 0);
  assert.equal(lines[i].trim(), "Date: 2026-01-01", "the date keeps its own line, intact");
  assert.match(lines[i + 1], /^Cashier: ABCDEFGHIJKLMNOPQRSTUVWXYZabcd\s*$/);
  // a narrow grid wraps it instead of cutting it off
  const narrow = { ...S, pageWidthIn: 4.2, marginLeftIn: 0.3, marginRightIn: 0.3 }; // 3.6 in x 12 = 43 cols
  assert.equal(validatePrintSettings({ ...narrow, cashierText: "x" }), null);
  const cols = deriveGrid(narrow).cols;
  const r = layoutBill(bill("x"), { ...narrow, cashierText: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcd" });
  for (const l of r.pages.flat()) assert.ok(l.length <= cols);
  assert.equal(r.clippedLines, 0);
});

test("the default text fits on the date's line: the header keeps its usual height", () => {
  const a = allLines(bill("Kamal"), S);
  const b = allLines(bill("Kamal"), { ...S, cashierText: "" });
  assert.equal(a.length, b.length);
});

test("everything else on the bill is unchanged by the setting", () => {
  const a = allLines(bill("Kamal", 12), S);
  const b = allLines(bill("Kamal", 12), { ...S, cashierText: "" });
  const strip = (ls: string[]) => ls.filter((l) => !/Cashier:/.test(l) && !l.startsWith("Date:"));
  assert.deepEqual(strip(a), strip(b));
  assert.ok(a.some((l) => /^Items: 12\s*$/.test(l)), "Items: N still printed");
});

test("validation: at most 30 characters, one line; empty is allowed", () => {
  assert.equal(validatePrintSettings({ ...S, cashierText: "" }), null);
  assert.equal(validatePrintSettings({ ...S, cashierText: "x".repeat(30) }), null);
  assert.match(validatePrintSettings({ ...S, cashierText: "x".repeat(31) }) ?? "", /at most 30/);
  assert.match(validatePrintSettings({ ...S, cashierText: "a\nb" }) ?? "", /single line/);
});

test("test pages: the text travels in the URL and an empty value is kept", () => {
  assert.equal(applyOverrides(S, {}).cashierText, "New Kandy Essence");
  assert.equal(applyOverrides(S, { cashier: "Main Counter" }).cashierText, "Main Counter");
  assert.equal(applyOverrides(S, { cashier: "" }).cashierText, "", "cleared on the form = fallback to the user name");
  const q = new URLSearchParams(settingsToQuery({ ...S, cashierText: "A & B" }));
  assert.equal(q.get("cashier"), "A & B");
  const none = new URLSearchParams(settingsToQuery({ ...S, cashierText: "" }));
  assert.equal(none.get("cashier"), "");
});

test("cashierShown: the one rule", () => {
  assert.equal(cashierShown("New Kandy Essence", "Kamal"), "New Kandy Essence");
  assert.equal(cashierShown("", "Kamal"), "Kamal");
  assert.equal(cashierShown("  ", "  Kamal  Silva "), "Kamal Silva");
  assert.equal(cashierShown("", null), null);
  assert.equal(cashierShown("", ""), null);
});
