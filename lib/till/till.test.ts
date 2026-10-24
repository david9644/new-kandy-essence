import test from "node:test";
import assert from "node:assert/strict";
import {
  ALL_CATEGORY,
  CATEGORY_HUES,
  OTHER_CATEGORY,
  categoryHue,
  exactCodeMatch,
  filterByCategory,
  TILE_PAGE_SIZE,
  indexItems,
  normalizeShelf,
  pageOf,
  searchIndexed,
  searchItems,
  suggestionsFor,
  type ShelfItem,
} from "./shelf";
import {
  addOrIncrement,
  calcBill,
  lineIsFree,
  lineMissingPrice,
  type DraftLine,
} from "./bill";
import { buildPayments, cashReceivedToStore, computePay, quickAmounts, type PayInput } from "./pay";
import { settle } from "./net";
import { formatRs } from "./format";

function item(over: Partial<ShelfItem> & { id: string; name: string }): ShelfItem {
  return {
    code: "NKE-" + over.id,
    category_id: null,
    base_unit: "pack",
    stock: 10,
    sold_90d: 0,
    units: [{ unit_name: "pack", factor: 1, price: 100 }],
    ...over,
  };
}

const ITEMS: ShelfItem[] = [
  item({ id: "1", name: "Mastarbun 1kg", category_id: "catA" }),
  item({ id: "2", name: "Mango juice", category_id: "catB" }),
  item({ id: "3", name: "Cream Cracker", category_id: "catA" }),
  item({ id: "4", name: "Fresh milk 1ltr", category_id: null }),
  item({
    id: "5",
    name: "Rice",
    category_id: "catB",
    base_unit: "kg",
    units: [
      { unit_name: "kg", factor: 1, price: null },
      { unit_name: "bag", factor: 25, price: null },
    ],
  }),
];

test("category filter: All, one category, Other (uncategorised)", () => {
  assert.equal(filterByCategory(ITEMS, ALL_CATEGORY).length, 5);
  assert.deepEqual(filterByCategory(ITEMS, "catA").map((i) => i.id), ["1", "3"]);
  assert.deepEqual(filterByCategory(ITEMS, OTHER_CATEGORY).map((i) => i.id), ["4"]);
  assert.equal(filterByCategory(ITEMS, "nope").length, 0);
});

test("category filter is local and fast (a few ms even for 5,000 items)", () => {
  const big = Array.from({ length: 5000 }, (_, i) => item({ id: String(i), name: "Item " + i, category_id: "c" + (i % 12) }));
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) filterByCategory(big, "c3");
  const per = (performance.now() - t0) / 100;
  assert.ok(per < 5, `one filter took ${per.toFixed(2)} ms`);
});

test("search ranks code, prefix, word-start, then contains; empty query finds nothing", () => {
  assert.deepEqual(searchItems(ITEMS, "").map((i) => i.id), []);
  assert.equal(searchItems(ITEMS, "mas")[0].id, "1");
  assert.deepEqual(searchItems(ITEMS, "NKE-2").map((i) => i.id), ["2"]);
  assert.deepEqual(searchItems(ITEMS, "cracker").map((i) => i.id), ["3"]);
  assert.deepEqual(searchItems(ITEMS, "1kg").map((i) => i.id), ["1"]);
});

test("suggestions start at two characters", () => {
  assert.deepEqual(suggestionsFor(ITEMS, "m"), []);
  assert.deepEqual(suggestionsFor(ITEMS, " m "), []);
  assert.ok(suggestionsFor(ITEMS, "ma").length >= 1);
  assert.ok(suggestionsFor(ITEMS, "ma", 1).length === 1);
});

test("Enter only counts as a scan for an EXACT item code, never a suggestion", () => {
  assert.equal(exactCodeMatch(ITEMS, "NKE-2")?.id, "2");
  assert.equal(exactCodeMatch(ITEMS, "  nke-2 ")?.id, "2", "case/space tolerant");
  assert.equal(exactCodeMatch(ITEMS, "NKE-"), null, "a prefix is not a scan");
  assert.equal(exactCodeMatch(ITEMS, "Mango"), null, "a name is not a scan");
  assert.equal(exactCodeMatch(ITEMS, ""), null);
});

test("category colours are stable, from the palette, and none for uncategorised", () => {
  assert.equal(categoryHue(null), null);
  const a = categoryHue("11111111-1111-1111-1111-111111111111");
  assert.equal(a, categoryHue("11111111-1111-1111-1111-111111111111"));
  assert.ok(CATEGORY_HUES.includes(a as number));
  const hues = new Set(Array.from({ length: 40 }, (_, i) => categoryHue("cat-" + i)));
  assert.ok(hues.size >= 8, "ids spread over many of the palette colours");
});

test("normalizeShelf coerces numerics and keeps nulls", () => {
  const shelf = normalizeShelf({
    categories: [{ id: "c", name: "N" }],
    items: [
      {
        id: "i",
        code: "NKE-1",
        name: "X",
        category_id: null,
        base_unit: "pack",
        stock: "12.5",
        units: [
          { unit_name: "pack", factor: "1", price: "1250.50", source: "default" },
          { unit_name: "box", factor: "12", price: null, source: null },
        ],
      },
    ],
  });
  assert.equal(shelf.items[0].stock, 12.5);
  assert.equal(shelf.items[0].units[0].price, 1250.5);
  assert.equal(shelf.items[0].units[1].price, null);
  assert.deepEqual(normalizeShelf(null), { categories: [], items: [] });
});

// ── bill ───────────────────────────────────────────────────────────────

test("tapping the same item and unit again adds one; another unit is a new line", () => {
  let lines: DraftLine[] = [];
  let r = addOrIncrement(lines, "1", "pack", 100, "k1");
  lines = r.lines;
  assert.equal(r.created, true);
  r = addOrIncrement(lines, "1", "pack", 100, "k2");
  lines = r.lines;
  assert.equal(r.created, false);
  assert.equal(r.key, "k1");
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, "2");
  r = addOrIncrement(lines, "1", "box", 1200, "k3");
  assert.equal(r.lines.length, 2);
});

test("an item with no price adds a line with an EMPTY price that blocks the bill", () => {
  const r = addOrIncrement([], "5", "kg", null, "k");
  assert.equal(r.lines[0].unitPrice, "");
  assert.ok(lineMissingPrice(r.lines[0]));
  const calc = calcBill(r.lines, "", new Map(ITEMS.map((i) => [i.id, i])));
  assert.ok(calc.missingPrice);
  assert.match(calc.issues[0], /needs a price/);
});

test("a deliberate price of 0 is a FREE line: allowed, flagged, counted", () => {
  const lines: DraftLine[] = [
    { key: "a", itemId: "1", unitName: "pack", quantity: "1", unitPrice: "0", discount: "" },
    { key: "b", itemId: "2", unitName: "pack", quantity: "2", unitPrice: "50", discount: "" },
  ];
  assert.ok(lineIsFree(lines[0]));
  assert.ok(!lineMissingPrice(lines[0]));
  const calc = calcBill(lines, "", new Map(ITEMS.map((i) => [i.id, i])));
  assert.equal(calc.freeLines, 1);
  assert.equal(calc.missingPrice, false);
  assert.equal(calc.totalC, 10000);
  assert.deepEqual(calc.issues, []);
});

test("an all-free bill cannot be saved (total must be more than zero)", () => {
  const lines: DraftLine[] = [
    { key: "a", itemId: "1", unitName: "pack", quantity: "1", unitPrice: "0", discount: "" },
  ];
  const calc = calcBill(lines, "", new Map(ITEMS.map((i) => [i.id, i])));
  assert.match(calc.issues.join(" "), /more than zero/);
});

test("bill maths in cents: line discounts, bill discount, goods vs to pay", () => {
  const map = new Map(ITEMS.map((i) => [i.id, i]));
  const lines: DraftLine[] = [
    { key: "a", itemId: "1", unitName: "pack", quantity: "2", unitPrice: "1250.5", discount: "" },
    { key: "b", itemId: "2", unitName: "pack", quantity: "3", unitPrice: "45.5", discount: "5" },
    { key: "c", itemId: "1", unitName: "pack", quantity: "1", unitPrice: "1250.5", discount: "" },
  ];
  const c = calcBill(lines, "10", map);
  assert.equal(c.subtotalC, 388800);
  assert.equal(c.lineDiscC, 500);
  assert.equal(c.goodsC, 388300);
  assert.equal(c.billDiscC, 1000);
  assert.equal(c.totalC, 387300);
  assert.deepEqual(c.lineTotalsC, [250100, 13150, 125050]);
  assert.equal(c.requested.get("1"), 3);
  assert.equal(calcBill(lines, "999999", map).issues.some((i) => /discount is more/.test(i)), true);
});

test("50 lines add up exactly", () => {
  const map = new Map(ITEMS.map((i) => [i.id, i]));
  const lines: DraftLine[] = Array.from({ length: 50 }, (_, i) => ({
    key: "k" + i,
    itemId: i % 2 ? "2" : "1",
    unitName: "pack",
    quantity: "1",
    unitPrice: i % 2 ? "45.5" : "1250.5",
    discount: "",
  }));
  assert.equal(calcBill(lines, "", map).totalC, 25 * 125050 + 25 * 4550);
});

// ── pay ────────────────────────────────────────────────────────────────

const pay = (cash: string, rows: PayInput["rows"] = []): PayInput => ({ cash, rows });
const row = (over: Partial<PayInput["rows"][number]> & { method: PayInput["rows"][number]["method"] }) => ({
  key: "r",
  amount: "",
  number: "",
  bank: "",
  date: "2026-10-19",
  reference: "",
  ...over,
});

test("exact cash: no change, no credit, no issues", () => {
  const s = computePay(387300, pay("3873"), false);
  assert.equal(s.changeC, 0);
  assert.equal(s.creditC, 0);
  assert.deepEqual(s.issues, []);
});

test("over-tendered cash gives change", () => {
  const s = computePay(387300, pay("4000"), false);
  assert.equal(s.cashAppliedC, 387300);
  assert.equal(s.changeC, 12700);
});

test("change counts EVERY method: cash + bank transfer + cheque", () => {
  // bill 3,873.00: bank 1,000 + cheque 500 -> cash still owed 2,373; hands over 3,000 -> change 627
  const s = computePay(
    387300,
    pay("3000", [
      row({ method: "bank_transfer", amount: "1000", reference: "T1" }),
      row({ method: "cheque", amount: "500", number: "556677", bank: "BOC" }),
    ]),
    false
  );
  assert.equal(s.nonCashC, 150000);
  assert.equal(s.cashAppliedC, 237300);
  assert.equal(s.changeC, 62700);
  assert.equal(s.creditC, 0);
  assert.deepEqual(s.issues, []);
});

test("cash + bank transfer + credit: the remainder is credit and needs a customer", () => {
  const input = pay("1000", [
    row({ method: "bank_transfer", amount: "500" }),
    row({ method: "credit" }),
  ]);
  const noCustomer = computePay(387300, input, false);
  assert.equal(noCustomer.creditC, 387300 - 100000 - 50000);
  assert.equal(noCustomer.changeC, 0, "no change when credit is left");
  assert.match(noCustomer.issues.join(" "), /registered customer/);
  const withCustomer = computePay(387300, input, true);
  assert.deepEqual(withCustomer.issues, []);
  const built = buildPayments(withCustomer, input);
  assert.deepEqual(
    built.map((p) => [p.method, p.amount]),
    [
      ["cash", 1000],
      ["bank_transfer", 500],
    ],
    "credit is not sent as a payment"
  );
});

test("credit is never silent: an uncovered remainder without a Credit row is blocked", () => {
  const s = computePay(387300, pay("1000"), true);
  assert.match(s.issues.join(" "), /not covered/);
});

test("non-cash cannot exceed the bill", () => {
  const s = computePay(100000, pay("0", [row({ method: "bank_transfer", amount: "1500" })]), true);
  assert.ok(s.overpaid);
  assert.match(s.issues.join(" "), /more than the bill/);
});

test("cheque needs digits-only number, bank and date; amounts must be entered", () => {
  const bad = (r: Partial<PayInput["rows"][number]>) =>
    computePay(100000, pay("0", [row({ method: "cheque", amount: "1000", number: "123", bank: "BOC", ...r })]), true).issues;
  assert.deepEqual(bad({}), []);
  assert.match(bad({ number: "12AB" }).join(), /digits only/);
  assert.match(bad({ bank: " " }).join(), /bank/);
  assert.match(bad({ date: "" }).join(), /date/);
  assert.match(bad({ amount: "" }).join(), /amount/);
});

test("only one Credit row", () => {
  const s = computePay(100000, pay("0", [row({ method: "credit" }), row({ method: "credit" })]), true);
  assert.match(s.issues.join(), /Only one Credit/);
});

test("cash_received is stored only when there is change (or an edited bill had it)", () => {
  const over = computePay(387300, pay("4000"), false);
  assert.equal(cashReceivedToStore(over, false), 4000);
  const exact = computePay(387300, pay("3873"), false);
  assert.equal(cashReceivedToStore(exact, false), null);
  assert.equal(cashReceivedToStore(exact, true), 3873);
  const none = computePay(387300, pay("0", [row({ method: "credit" })]), true);
  assert.equal(cashReceivedToStore(none, true), null);
});

test("quick amounts: exact, then the next round notes", () => {
  assert.deepEqual(quickAmounts(187350), [1873.5, 1900, 2000, 5000, 10000]);
  assert.deepEqual(quickAmounts(100000), [1000, 5000, 10000]);
  assert.deepEqual(quickAmounts(0), []);
  assert.ok(quickAmounts(387300).every((v) => v >= 3873));
});

// ── network ────────────────────────────────────────────────────────────

test("settle: a value, a rejection, a timeout, and a late value after timeout", async () => {
  const ok = await settle(Promise.resolve(7), 50);
  assert.deepEqual(ok, { kind: "value", value: 7 });

  const failed = await settle(Promise.reject(new Error("network")), 50);
  assert.deepEqual(failed, { kind: "unconfirmed" });

  let late: number | null = null;
  const slow = new Promise<number>((r) => setTimeout(() => r(9), 80));
  const timedOut = await settle(slow, 20, (v) => (late = v));
  assert.deepEqual(timedOut, { kind: "unconfirmed" });
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(late, 9, "the late answer is still delivered");
});

test("formatRs", () => {
  assert.equal(formatRs(250), "Rs 250.00");
  assert.equal(formatRs(1250.5), "Rs 1,250.50");
});

// ── shelf: payload shape, ordering, paging, indexed search ───────────────

test("normalizeShelf keeps ONLY the known keys: cost-like data in the payload never reaches the till", () => {
  const shelf = normalizeShelf({
    categories: [{ id: "c", name: "N", cost: 5 }],
    items: [
      {
        id: "i",
        code: "NKE-1",
        name: "X",
        category_id: null,
        base_unit: "pack",
        stock: 1,
        sold_90d: "7",
        last_purchase_cost: 99,
        total_value: 1000,
        units: [{ unit_name: "pack", factor: 1, price: 5, last_cost: 4, source: "last" }],
      },
    ],
  });
  assert.deepEqual(Object.keys(shelf).sort(), ["categories", "items"]);
  assert.deepEqual(Object.keys(shelf.categories[0]).sort(), ["id", "name"]);
  assert.deepEqual(Object.keys(shelf.items[0]).sort(), [
    "base_unit",
    "category_id",
    "code",
    "id",
    "name",
    "sold_90d",
    "stock",
    "units",
  ]);
  assert.deepEqual(Object.keys(shelf.items[0].units[0]).sort(), ["factor", "price", "unit_name"]);
  assert.equal(shelf.items[0].sold_90d, 7);
  assert.equal(JSON.stringify(shelf).match(/cost|value|last/i), null);
});

test("a unit with no price stays null: nothing invents a price", () => {
  const shelf = normalizeShelf({
    categories: [],
    items: [{ id: "i", code: "c", name: "n", base_unit: "pc", units: [{ unit_name: "pc", factor: 1, price: null }] }],
  });
  assert.equal(shelf.items[0].units[0].price, null);
});

function bigShelf(n: number): ShelfItem[] {
  return Array.from({ length: n }, (_, i) =>
    item({ id: String(i), name: `Item ${String(i).padStart(4, "0")} ${i % 7 === 0 ? "rice" : "flour"}`, category_id: "c" + (i % 12) })
  );
}

test("search over an indexed shelf: code, prefix, word start, contains; shelf order breaks ties", () => {
  const items = bigShelf(3000);
  const index = indexItems(items);
  assert.equal(searchIndexed(index, "NKE-42")[0].id, "42", "exact code first");
  const rice = searchIndexed(index, "rice", 5);
  assert.deepEqual(rice.map((i) => i.id), ["0", "7", "14", "21", "28"], "ties keep the most-sold-first shelf order");
  assert.equal(searchIndexed(index, "item 0042")[0].id, "42");
  assert.deepEqual(searchIndexed(index, "zzzz"), []);
  assert.deepEqual(searchIndexed(index, "   "), []);
});

test("paging: first page of tiles, the rest behind Show more", () => {
  const list = bigShelf(3000);
  const p1 = pageOf(list, TILE_PAGE_SIZE);
  assert.equal(p1.visible.length, TILE_PAGE_SIZE);
  assert.equal(p1.remaining, 3000 - TILE_PAGE_SIZE);
  const p2 = pageOf(list, TILE_PAGE_SIZE * 2);
  assert.equal(p2.visible.length, TILE_PAGE_SIZE * 2);
  assert.equal(p2.visible[0], list[0], "paging never reorders");
  assert.deepEqual(pageOf(list.slice(0, 10), TILE_PAGE_SIZE), { visible: list.slice(0, 10), remaining: 0 });
});

test("search and category filter stay fast on 3,000 items (well under 300 ms, measured per call)", () => {
  const items = bigShelf(3000);
  const t0 = performance.now();
  const index = indexItems(items);
  const tIndex = performance.now() - t0;
  const t1 = performance.now();
  for (let i = 0; i < 50; i++) searchIndexed(index, "rice");
  const perSearch = (performance.now() - t1) / 50;
  const t2 = performance.now();
  for (let i = 0; i < 50; i++) filterByCategory(items, "c3");
  const perFilter = (performance.now() - t2) / 50;
  assert.ok(tIndex < 100, `index build ${tIndex.toFixed(1)} ms`);
  assert.ok(perSearch < 20, `search ${perSearch.toFixed(2)} ms`);
  assert.ok(perFilter < 20, `filter ${perFilter.toFixed(2)} ms`);
});
