// The printed bill header (name, tagline, address, phones). Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  businessHeaderLines,
  phonesText,
  toPrintable,
  unprintableChars,
  wrapBalanced,
  type PrintBusiness,
} from "./header";
import { layoutBill, layoutBillPlain, sampleInvoice } from "./invoice-layout";
import {
  DEFAULT_PRINT_SETTINGS,
  applyOverrides,
  businessFromSettings,
  deriveGrid,
  headerProblems,
  settingsToQuery,
  validatePrintSettings,
  type PrintSettings,
} from "./settings";

const S = DEFAULT_PRINT_SETTINGS;
const B = businessFromSettings(S);

const NAME = "New Kandy Essence Suppliers";
const TAGLINE = "Dealers in All Kind of Essence, Cake Ingredients, Grocery & Scent etc...";
const ADDRESS = "16, Wadugodapitiya Street, Kandy";
const PHONES = "Tel: 081-4550561 / 0779278100";

function centeredAt(line: string, text: string, cols: number) {
  assert.equal(line.length, text.length + Math.floor((cols - text.length) / 2), `"${text}" centred`);
  assert.equal(line.trimStart(), text);
}

test("the owner's header text is the default and the grid is 49 columns", () => {
  assert.equal(S.businessName, NAME);
  assert.equal(S.businessTagline, TAGLINE);
  assert.equal(S.businessAddress, ADDRESS);
  assert.equal(S.businessPhones, "081-4550561 / 0779278100");
  assert.equal(TAGLINE.length, 72);
  assert.equal(deriveGrid(S).cols, 49);
});

test("exact header at 49 columns: name, tagline on two even lines, address, phones", () => {
  const cols = 49;
  assert.deepEqual(businessHeaderLines(B, cols, true), [
    "           New Kandy Essence Suppliers",
    "      Dealers in All Kind of Essence, Cake",
    "       Ingredients, Grocery & Scent etc...",
    "        16, Wadugodapitiya Street, Kandy",
    "          Tel: 081-4550561 / 0779278100",
  ]);
  const lines = businessHeaderLines(B, cols, true);
  centeredAt(lines[0], NAME, cols);
  centeredAt(lines[3], ADDRESS, cols);
  centeredAt(lines[4], PHONES, cols);
});

test("the tagline is balanced: two lines within 2 characters of each other, words never split", () => {
  const [a, b] = wrapBalanced(TAGLINE, 49);
  assert.equal(`${a} ${b}`, TAGLINE);
  assert.ok(Math.abs(a.length - b.length) <= 2, `${a.length} vs ${b.length}`);
});

test("a narrower grid (30) wraps every part, nothing is longer than the line", () => {
  const lines = businessHeaderLines(B, 30, true);
  assert.deepEqual(lines, [
    " New Kandy Essence Suppliers",
    "    Dealers in All Kind of",
    "  Essence, Cake Ingredients,",
    "    Grocery & Scent etc...",
    "      16, Wadugodapitiya",
    "        Street, Kandy",
    "Tel: 081-4550561 / 0779278100",
  ]);
  for (const l of lines) assert.ok(l.length <= 30);
});

test("a wider grid (80) puts the tagline on one line", () => {
  const lines = businessHeaderLines(B, 80, true);
  assert.equal(lines.length, 4);
  assert.equal(lines[1].trim(), TAGLINE);
  centeredAt(lines[1], TAGLINE, 80);
});

test("an empty tagline or phones is skipped with no blank gap", () => {
  const noTag = businessHeaderLines({ ...B, tagline: "" }, 49, true);
  assert.deepEqual(noTag.map((l) => l.trim()), [NAME, ADDRESS, PHONES]);
  const noPhones = businessHeaderLines({ ...B, phones: "   " }, 49, true);
  assert.deepEqual(noPhones.map((l) => l.trim()).slice(-1), [ADDRESS]);
  assert.ok(!noPhones.join("\n").includes("Tel"));
  const onlyName = businessHeaderLines({ name: NAME, tagline: "", address: "", phones: "" }, 49, true);
  assert.deepEqual(onlyName.map((l) => l.trim()), [NAME]);
  for (const lines of [noTag, noPhones, onlyName]) assert.ok(lines.every((l) => l.trim() !== ""));
});

test("later pieces repeat only the name", () => {
  assert.deepEqual(businessHeaderLines(B, 49, false).map((l) => l.trim()), [NAME]);
});

test("a word longer than the line is cut at the line width, never overflows", () => {
  const long = "X".repeat(120);
  assert.deepEqual(wrapBalanced(long, 49), ["X".repeat(49), "X".repeat(49), "X".repeat(22)]);
  const lines = businessHeaderLines({ name: long, tagline: `a ${long} b`, address: long, phones: long }, 40, true);
  for (const l of lines) assert.ok(l.length <= 40, `"${l}"`);
  const text = lines.map((l) => l.trim()).join("");
  assert.equal((text.match(/X/g) ?? []).length, 120 * 4, "nothing lost");
  assert.ok(text.includes("a"), "words around the long one kept");
});

test("no printed header line is longer than the line width, at any width", () => {
  const variants: PrintBusiness[] = [
    B,
    { name: "N".repeat(40), tagline: "w ".repeat(60).trim(), address: "a".repeat(80), phones: "0".repeat(60) },
    { name: "A B C", tagline: "x", address: "y", phones: "z" },
    { name: NAME, tagline: "Super".repeat(24), address: ADDRESS, phones: PHONES },
  ];
  for (const b of variants) {
    for (let cols = 1; cols <= 90; cols++) {
      for (const full of [true, false]) {
        for (const l of businessHeaderLines(b, cols, full)) {
          assert.ok(l.length <= cols, `cols ${cols}: "${l}" is ${l.length}`);
        }
      }
    }
  }
});

test("'Tel: ' is added once, and not doubled if the owner typed it", () => {
  assert.equal(phonesText("081-4550561 / 0779278100"), PHONES);
  assert.equal(phonesText("Tel: 081-4550561"), "Tel: 081-4550561");
  assert.equal(phonesText("tel. 081-4550561"), "tel. 081-4550561");
  assert.equal(phonesText(""), "");
});

test("characters the printer cannot print are listed, and shown as ? if they reach the layout", () => {
  assert.deepEqual(unprintableChars("ශ්‍ර Café “x”"), [
    "ශ",
    "්",
    "‍",
    "ර",
    "é",
    "“",
    "”",
  ]);
  assert.deepEqual(unprintableChars(NAME + TAGLINE + ADDRESS + PHONES), []);
  assert.equal(toPrintable("Café"), "Caf?");
  for (const l of businessHeaderLines({ ...B, name: "Café ශ" }, 49, true)) {
    assert.ok(/^[ -~]*$/.test(l));
  }
});

test("validation: lengths, plain text only, name required", () => {
  assert.deepEqual(headerProblems(S), {});
  assert.equal(validatePrintSettings(S), null);
  assert.match(headerProblems({ ...S, businessName: "" }).businessName ?? "", /required/);
  assert.match(headerProblems({ ...S, businessName: "x".repeat(41) }).businessName ?? "", /at most 40/);
  assert.equal(headerProblems({ ...S, businessName: "x".repeat(40) }).businessName, undefined);
  assert.match(headerProblems({ ...S, businessTagline: "x".repeat(121) }).businessTagline ?? "", /at most 120/);
  assert.equal(headerProblems({ ...S, businessTagline: "" }).businessTagline, undefined);
  assert.match(headerProblems({ ...S, businessAddress: "x".repeat(81) }).businessAddress ?? "", /at most 80/);
  assert.match(headerProblems({ ...S, businessPhones: "1".repeat(61) }).businessPhones ?? "", /at most 60/);
  const sinhala = headerProblems({ ...S, businessAddress: "කොළඳ" }).businessAddress ?? "";
  assert.match(sinhala, /cannot print/);
  assert.match(sinhala, /Sinhala/);
  assert.notEqual(validatePrintSettings({ ...S, businessPhones: "077 – 123" }), null, "en dash refused");
  assert.notEqual(validatePrintSettings({ ...S, businessTagline: "a\nb" }), null, "single line only");
});

test("the test-bill link carries the header so unsaved values can be tried", () => {
  const changed: PrintSettings = { ...S, businessName: "Other & Co", businessPhones: "011 222 3333" };
  const back = applyOverrides(S, Object.fromEntries(new URLSearchParams(settingsToQuery(changed))));
  assert.equal(back.businessName, "Other & Co");
  assert.equal(back.businessPhones, "011 222 3333");
  assert.equal(back.businessTagline, TAGLINE);
  assert.equal(applyOverrides(S, {}).businessAddress, ADDRESS);
});

test("whole bill: the longer header keeps every line at the grid width, height a multiple of 5.5 in", () => {
  for (const n of [1, 5, 20, 50, 120]) {
    const inv = { ...sampleInvoice(n), business: B };
    for (const bill of [layoutBill(inv, S), layoutBillPlain(inv, S)]) {
      assert.equal(bill.clippedLines, 0, "no header line was clipped");
      bill.pages.forEach((page, i) => {
        for (const l of page) assert.equal(l.length, 49);
        const h = bill.pageHeightsIn[i];
        assert.ok(Math.abs(h / 5.5 - Math.round(h / 5.5)) < 1e-6, `${h} is a whole number of sheets`);
        assert.ok(h <= 6 * 5.5 + 1e-6, "at most 6 sheets");
      });
    }
    const first = layoutBill(inv, S).pages[0].map((l) => l.trimEnd());
    assert.deepEqual(
      first.slice(0, 5).map((l) => l.trim()),
      [NAME, "Dealers in All Kind of Essence, Cake", "Ingredients, Grocery & Scent etc...", ADDRESS, PHONES]
    );
    assert.match(first[5], /^-+$/, "the separator follows the header");
  }
});

test("rest of the bill is unchanged: Items: N, footer, Cashier, strike runs", () => {
  const inv = { ...sampleInvoice(12), business: B };
  const bill = layoutBill(inv, S);
  const text = bill.pages.flat().join("\n");
  assert.match(text, /Items: 12/);
  assert.match(text, /Thank you\. Come again\./);
  assert.match(text, /Cashier: New Kandy Essence\s/);
  assert.ok(bill.styles.flat().length > 0, "strike runs still produced");
  // The same bill with the header reduced to the name differs only above the first separator.
  const short = layoutBill({ ...inv, business: { name: NAME, tagline: "", address: "", phones: "" } }, S);
  const body = (b: typeof bill) =>
    b.pages
      .flat()
      .map((l) => l.trimEnd())
      .join("\n")
      .split(/\n-+\n/)
      .slice(1)
      .join("\n-\n")
      .replace(/\n+$/, "");
  assert.equal(body(bill), body(short));
});

test("a long bill cut into pieces repeats the name and keeps the totals together", () => {
  const settings = { ...S, maxSheets: 2 };
  const bill = layoutBill({ ...sampleInvoice(120), business: B }, settings);
  assert.equal(bill.mode, "pieces");
  assert.ok(bill.pages.length >= 2);
  bill.pages.forEach((p, i) => {
    assert.ok(p.join("\n").includes(NAME), `piece ${i + 1} has the name`);
    for (const l of p) assert.equal(l.length, 49);
  });
  assert.ok(bill.pages[0].join("\n").includes(PHONES));
  assert.ok(!bill.pages[1].join("\n").includes(PHONES), "later pieces: name only");
});
