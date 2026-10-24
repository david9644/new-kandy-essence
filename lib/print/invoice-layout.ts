// Invoice -> pages of fixed-width text lines.
//
// Pure and output-independent: the browser print view renders these strings
// in a monospace font, and a later step can send the very same lines to the
// printer as raw text. Nothing here knows about the DOM, fonts or CSS.
//
// Contract of the result: every page is exactly `grid.rows` lines and every
// line is exactly `grid.cols` characters (padded with spaces). Item names are
// wrapped, never truncated; the totals block is never split across pages
// (unless it is taller than a whole page, which only happens on absurdly tiny
// grids); no page is ever empty.

import { formatQuantity } from "../units";
import { lineAmounts } from "../line-price";
import {
  deriveGrid,
  printedHeight,
  rowsForHeight,
  type PrintGrid,
  type PrintSettings,
  type StrikeMode,
} from "./settings";

export type PrintLabel = "COPY" | "REVISED" | null;

export interface PrintBusiness {
  name: string;
  address: string;
  phone1: string;
  phone2: string;
}

export interface PrintInvoiceLine {
  itemName: string;
  quantity: number;
  unitName: string;
  unitPrice: number;
  lineDiscount: number;
  lineTotal: number;
  /** The item's list price for this unit when the line was billed (a server
   * snapshot); null/undefined = none recorded. Used only to show the crossed-out
   * normal amount (lib/line-price.ts). */
  listUnitPrice?: number | null;
}

export interface PrintInvoicePayment {
  method: "cash" | "cheque" | "bank_transfer" | string;
  amount: number;
  chequeNumber?: string | null;
  chequeBank?: string | null;
  chequeDate?: string | null;
  reference?: string | null;
}

export interface PrintInvoice {
  business: PrintBusiness;
  invoiceNo: string;
  date: string;
  customerName: string | null;
  customerCode: string | null;
  customerPhone: string | null;
  cashierName: string | null;
  lines: PrintInvoiceLine[];
  subtotal: number;
  lineDiscountTotal: number;
  billDiscount: number;
  total: number;
  payments: PrintInvoicePayment[];
  /** Cash handed over by the customer, when it was recorded. */
  cashReceived: number | null;
  /** Unpaid remainder. */
  credit: number;
  footer: string;
  label: PrintLabel;
}

/** Columns [start, end) of line `line` (0-based, within its page) drawn crossed out. */
export interface StyleRun {
  line: number;
  start: number;
  end: number;
}

/** Internal: a line of text with the column ranges that are struck. */
interface Ln {
  t: string;
  strike?: Array<[number, number]>;
}
const ln = (t: string): Ln => ({ t });

export interface LayoutResult {
  pages: string[][];
  /** Struck-through runs per page (same page order as `pages`). */
  styles: StyleRun[][];
  /** Lines that had to be clipped to the width (should always be 0). */
  clippedLines: number;
  /** Lines dropped because a page's header + body exceeded the page height
   * (only possible on a grid too small for the header). */
  overflowLines: number;
}

const MIN_NAME_WIDTH = 12;

// ── text helpers ────────────────────────────────────────────────────────

function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

function wrap(text: string, width: number): string[] {
  const t = clean(text);
  if (t === "") return [""];
  const w = Math.max(1, width);
  const out: string[] = [];
  let cur = "";
  for (const word of t.split(" ")) {
    let rest = word;
    // A single word longer than the line is broken, never cut off.
    while (rest.length > w) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
      out.push(rest.slice(0, w));
      rest = rest.slice(w);
    }
    if (rest === "") continue;
    if (cur === "") cur = rest;
    else if (cur.length + 1 + rest.length <= w) cur += " " + rest;
    else {
      out.push(cur);
      cur = rest;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function padR(s: string, w: number): string {
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}

function padL(s: string, w: number): string {
  return s.length >= w ? s : " ".repeat(w - s.length) + s;
}

function center(s: string, w: number): string {
  if (s.length >= w) return s;
  return " ".repeat(Math.floor((w - s.length) / 2)) + s;
}

function centered(text: string, cols: number): string[] {
  return wrap(text, cols).map((l) => center(l, cols));
}

// `right` is NOT trimmed (callers may pad it to keep the layout stable).
function row(left: string, right: string, cols: number): string[] {
  // keep a leading indent (e.g. "  less discount") but collapse everything else
  const indentW = Math.min(left.length - left.trimStart().length, Math.floor(cols / 4));
  const indent = " ".repeat(indentW);
  const l = clean(left);
  if (right === "") return wrap(l, cols - indentW).map((p) => indent + p);
  if (indentW + l.length + 1 + right.length <= cols) {
    return [indent + l + " ".repeat(cols - indentW - l.length - right.length) + right];
  }
  const leftW = cols - right.length - 1 - indentW;
  if (leftW >= 8) {
    const parts = wrap(l, leftW);
    const last = parts.length - 1;
    return parts.map((p, i) =>
      i === last
        ? indent + p + " ".repeat(Math.max(1, cols - indentW - p.length - right.length)) + right
        : indent + p
    );
  }
  return [...wrap(l, cols - indentW).map((p) => indent + p), padL(right, cols)];
}

const SEP = (cols: number) => "-".repeat(cols);

export function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function qtyText(l: PrintInvoiceLine): string {
  const unit = clean(l.unitName);
  return `${formatQuantity(l.quantity)}${unit ? " " + unit : ""}`;
}

// ── columns ─────────────────────────────────────────────────────────────

interface Columns {
  stacked: boolean;
  /** Spaces between the number columns (2 when the name column can spare it). */
  gap: number;
  nameW: number;
  qtyW: number;
  priceW: number;
  amtW: number;
}

function columnsFor(inv: PrintInvoice, cols: number): Columns {
  const qtyW = Math.max(3, ...inv.lines.map((l) => qtyText(l).length));
  const priceW = Math.max("Price".length, ...inv.lines.map((l) => fmtMoney(l.unitPrice).length));
  const amtW = Math.max("Amount".length, ...inv.lines.map((l) => fmtMoney(l.lineTotal).length));
  const roomy = cols - qtyW - priceW - amtW - 6;
  const gap = roomy >= 20 ? 2 : 1;
  const nameW = cols - qtyW - priceW - amtW - 3 * gap;
  return { stacked: nameW < MIN_NAME_WIDTH, gap, nameW, qtyW, priceW, amtW };
}

function columnHeader(c: Columns, cols: number): string[] {
  if (c.stacked) return row("Item / Qty x Price", "Amount", cols);
  const g = " ".repeat(c.gap);
  return [
    `${padR("Item", c.nameW)}${g}${padL("Qty", c.qtyW)}${g}${padL("Price", c.priceW)}${g}${padL("Amount", c.amtW)}`,
  ];
}

// A discounted line (see lib/line-price.ts) in the "strike" and "text" modes:
//   Darck chocolate (1/800)                 <- the name, full width
//     2 box x 1,250.50      2,501.00 2,250.00   <- qty x price, struck normal amount, final amount
// In "text" mode the normal amount is written "(was 2,501.00)" instead of struck.
function discountedBlock(
  l: PrintInvoiceLine,
  normal: number,
  cols: number,
  mode: "strike" | "text"
): Ln[] {
  const out: Ln[] = wrap(l.itemName, cols).map(ln);
  const left = `  ${qtyText(l)} x ${fmtMoney(l.unitPrice)}`;
  const normalTxt = fmtMoney(normal);
  const shown = mode === "strike" ? normalTxt : `(was ${normalTxt})`;
  const final = fmtMoney(l.lineTotal);
  const right = `${shown} ${final}`;

  if (right.length <= cols - 2) {
    const rows = row(left, right, cols);
    const last = rows.length - 1;
    rows.forEach((t, i) => {
      if (i === last && mode === "strike") {
        const start = cols - right.length;
        out.push({ t, strike: [[start, start + normalTxt.length]] });
      } else out.push(ln(t));
    });
  } else {
    // absurdly large amounts on a narrow grid: the left part, then the normal and
    // final amounts each on their own right-aligned row
    for (const t of row(left, "", cols)) out.push(ln(t));
    out.push(
      mode === "strike"
        ? { t: padL(shown, cols), strike: [[cols - shown.length, cols]] }
        : ln(padL(shown, cols))
    );
    out.push(ln(padL(final, cols)));
  }
  return out;
}

function itemBlock(l: PrintInvoiceLine, c: Columns, cols: number, mode: StrikeMode): Ln[] {
  if (mode !== "off") {
    const a = lineAmounts({
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      listUnitPrice: l.listUnitPrice,
      lineTotal: l.lineTotal,
    });
    if (a.struck) return discountedBlock(l, a.normalAmount, cols, mode);
  }

  const out: string[] = [];
  if (c.stacked) {
    out.push(...wrap(l.itemName, cols));
    out.push(
      ...row(`  ${qtyText(l)} x ${fmtMoney(l.unitPrice)}`, fmtMoney(l.lineTotal), cols)
    );
  } else {
    const nameLines = wrap(l.itemName, c.nameW);
    const g = " ".repeat(c.gap);
    out.push(
      `${padR(nameLines[0], c.nameW)}${g}${padL(qtyText(l), c.qtyW)}${g}${padL(fmtMoney(l.unitPrice), c.priceW)}${g}${padL(fmtMoney(l.lineTotal), c.amtW)}`
    );
    for (let i = 1; i < nameLines.length; i++) out.push(nameLines[i]);
  }
  if (Math.abs(l.lineDiscount) > 0.004) {
    out.push(...row("  less discount", `-${fmtMoney(l.lineDiscount)}`, cols));
  }
  return out.map(ln);
}

// ── headers ─────────────────────────────────────────────────────────────

function businessLines(b: PrintBusiness, cols: number, full: boolean): string[] {
  const out: string[] = [];
  if (clean(b.name)) out.push(...centered(b.name, cols));
  if (full) {
    for (const part of (b.address ?? "").split(/\r?\n/)) {
      if (clean(part)) out.push(...centered(part, cols));
    }
    const phones = [b.phone1, b.phone2].map(clean).filter(Boolean).join(" / ");
    if (phones) out.push(...centered(phones, cols));
  }
  return out;
}

function pageText(page: number, count: number): string {
  // count 0 = one continuous piece: no "Page x of y" at all
  if (count <= 0) return "";
  // padded to the widest value so the header is the same height on every page
  return padL(`Page ${page} of ${count}`, `Page ${count} of ${count}`.length);
}

function fullHeader(inv: PrintInvoice, c: Columns, cols: number, page: number, count: number): string[] {
  const out: string[] = [...businessLines(inv.business, cols, true)];
  if (out.length > 0) out.push(SEP(cols));
  out.push(...row(`Bill: ${inv.invoiceNo}${inv.label ? "  " + inv.label : ""}`, pageText(page, count), cols));
  out.push(...row(`Date: ${inv.date}`, inv.cashierName ? `Cashier: ${clean(inv.cashierName)}` : "", cols));
  if (inv.customerName) {
    const code = clean(inv.customerCode);
    out.push(...wrap(`Customer: ${inv.customerName}${code ? ` (${code})` : ""}`, cols));
    if (clean(inv.customerPhone)) out.push(...wrap(`Phone: ${inv.customerPhone}`, cols));
  } else {
    out.push("Customer: Walk-in");
  }
  out.push(SEP(cols), ...columnHeader(c, cols), SEP(cols));
  return out;
}

function compactHeader(inv: PrintInvoice, c: Columns, cols: number, page: number, count: number): string[] {
  const out: string[] = [...businessLines(inv.business, cols, false)];
  out.push(
    ...row(
      `Bill ${inv.invoiceNo}  ${inv.date}${inv.label ? "  " + inv.label : ""}`,
      pageText(page, count),
      cols
    )
  );
  out.push(SEP(cols), ...columnHeader(c, cols), SEP(cols));
  return out;
}

// ── totals ──────────────────────────────────────────────────────────────

function paymentLabel(p: PrintInvoicePayment): string {
  if (p.method === "cash") return "Cash";
  if (p.method === "bank_transfer") {
    return `Bank transfer${clean(p.reference) ? ` (${clean(p.reference)})` : ""}`;
  }
  if (p.method === "cheque") {
    const parts = [`Cheque ${clean(p.chequeNumber)}`, clean(p.chequeBank), clean(p.chequeDate)];
    return parts.filter((x) => x && x !== "Cheque").join(" ");
  }
  return clean(p.method);
}

function totalsBlock(inv: PrintInvoice, cols: number): string[] {
  const out: string[] = [SEP(cols)];
  out.push(...row("Subtotal", fmtMoney(inv.subtotal), cols));
  if (inv.lineDiscountTotal > 0.004) {
    out.push(...row("Line discounts", `-${fmtMoney(inv.lineDiscountTotal)}`, cols));
  }
  if (inv.billDiscount > 0.004) {
    out.push(...row("Bill discount", `-${fmtMoney(inv.billDiscount)}`, cols));
  }
  out.push(...row("TOTAL", fmtMoney(inv.total), cols));
  out.push(SEP(cols));

  for (const p of inv.payments) {
    out.push(...row(paymentLabel(p), fmtMoney(p.amount), cols));
  }
  if (inv.cashReceived !== null) {
    const cashPaid = inv.payments
      .filter((p) => p.method === "cash")
      .reduce((sum, p) => sum + p.amount, 0);
    out.push(...row("Cash received", fmtMoney(inv.cashReceived), cols));
    out.push(...row("Change", fmtMoney(Math.max(0, inv.cashReceived - cashPaid)), cols));
  }
  if (inv.credit > 0.004) {
    out.push(...row("Credit (unpaid)", fmtMoney(inv.credit), cols));
  }
  if (clean(inv.footer)) {
    out.push("", ...centered(inv.footer, cols));
  }
  return out;
}

// ── pagination ──────────────────────────────────────────────────────────

function fitLine(s: string, cols: number, counters: { clipped: number }): string {
  if (s.length > cols) {
    counters.clipped++;
    return s.slice(0, cols);
  }
  return padR(s, cols);
}

function build(inv: PrintInvoice, grid: PrintGrid, count: number, mode: StrikeMode): LayoutResult {
  const { cols, rows } = grid;
  const columns = columnsFor(inv, cols);
  const header1Height = fullHeader(inv, columns, cols, 1, count).length;
  const headerNHeight = compactHeader(inv, columns, cols, 2, count).length;

  const body: Ln[][] = [[]];
  const capacity = (pageIndex: number) => rows - (pageIndex === 0 ? header1Height : headerNHeight);

  // Places a block on the current page, or on a fresh one if it does not fit.
  // Blocks (an item with its wrapped name lines, the whole totals block) stay
  // together; they are only cut when taller than an entire empty page.
  function place(block: Ln[]) {
    let rest = block;
    for (;;) {
      const cur = body[body.length - 1];
      const room = capacity(body.length - 1) - cur.length;
      if (rest.length <= room) {
        cur.push(...rest);
        return;
      }
      if (cur.length > 0) {
        body.push([]);
        continue;
      }
      const take = Math.max(1, room);
      cur.push(...rest.slice(0, take));
      rest = rest.slice(take);
      if (rest.length === 0) return;
      body.push([]);
    }
  }

  for (const line of inv.lines) place(itemBlock(line, columns, cols, mode));
  place(totalsBlock(inv, cols).map(ln));

  if (body.length > 1 && body[body.length - 1].length === 0) body.pop();

  const counters = { clipped: 0 };
  let overflow = 0;
  const styles: StyleRun[][] = [];
  const pages = body.map((bodyLines, i) => {
    const header =
      i === 0
        ? fullHeader(inv, columns, cols, 1, body.length)
        : compactHeader(inv, columns, cols, i + 1, body.length);
    let lines: Ln[] = [...header.map(ln), ...bodyLines];
    if (lines.length > rows) {
      overflow += lines.length - rows;
      lines = lines.slice(0, rows);
    }
    styles.push(runsOf(lines));
    const fitted = lines.map((l) => fitLine(l.t, cols, counters));
    while (fitted.length < rows) fitted.push(" ".repeat(cols));
    return fitted;
  });

  return { pages, styles, clippedLines: counters.clipped, overflowLines: overflow };
}

function runsOf(lines: Ln[]): StyleRun[] {
  const out: StyleRun[] = [];
  lines.forEach((l, i) => {
    for (const [start, end] of l.strike ?? []) out.push({ line: i, start, end });
  });
  return out;
}

/** Lay an invoice out on the given character grid. */
export function layoutInvoiceDetailed(
  inv: PrintInvoice,
  grid: PrintGrid,
  mode: StrikeMode = "off"
): LayoutResult {
  // "Page x of y" is padded to the width of the final count, which itself
  // depends on the layout: iterate until the count is stable (1-2 rounds).
  let count = 1;
  let result = build(inv, grid, count, mode);
  for (let i = 0; i < 6 && result.pages.length !== count; i++) {
    count = result.pages.length;
    result = build(inv, grid, count, mode);
  }
  return result;
}

export function layoutInvoice(inv: PrintInvoice, grid: PrintGrid): string[][] {
  return layoutInvoiceDetailed(inv, grid).pages;
}

// ── the bill as printed: one continuous piece, long pieces or sheets ────

export type BillMode = "continuous" | "pieces" | "sheets";

export interface BillLayout {
  /** Each piece is exactly `heights[i]`'s worth of lines, every line `cols` wide. */
  pages: string[][];
  /** Struck-through runs per piece (empty unless strikeMode is "strike"). */
  styles: StyleRun[][];
  /** Printed height of each piece, a whole number of sheets. */
  pageHeightsIn: number[];
  mode: BillMode;
  cols: number;
  clippedLines: number;
  overflowLines: number;
}

function fitTo(lines: Ln[], cols: number, rows: number, counters: { clipped: number }): string[] {
  const out = lines.slice(0, rows).map((l) => fitLine(l.t, cols, counters));
  while (out.length < rows) out.push(" ".repeat(cols));
  return out;
}

/** Lay a bill out the way it will be printed.
 *
 *  continuous ON (default): ONE piece holding the header, every item and the
 *  totals; no "Page x of y". Its height is (lines / lpi + top + bottom margin)
 *  rounded UP to a whole number of sheets (a sheet = the page height), so the
 *  next bill starts on a perforation. If that is longer than `maxSheets`
 *  sheets, the bill is cut into pieces of `maxSheets` sheets (header repeated,
 *  "Page x of y", totals never split); only the last piece is shorter.
 *
 *  continuous OFF: the original behaviour, pages of one sheet each. */
export function layoutBill(inv: PrintInvoice, settings: PrintSettings): BillLayout {
  const grid = deriveGrid(settings);
  const { cols } = grid;

  const strike = settings.strikeMode;
  if (!settings.continuous) {
    const r = layoutInvoiceDetailed(inv, grid, strike);
    return {
      pages: r.pages,
      styles: r.styles,
      pageHeightsIn: r.pages.map(() => settings.pageHeightIn),
      mode: "sheets",
      cols,
      clippedLines: r.clippedLines,
      overflowLines: r.overflowLines,
    };
  }

  const columns = columnsFor(inv, cols);
  const lines: Ln[] = fullHeader(inv, columns, cols, 1, 0).map(ln);
  for (const l of inv.lines) lines.push(...itemBlock(l, columns, cols, strike));
  lines.push(...totalsBlock(inv, cols).map(ln));

  let { sheets, heightIn } = printedHeight(settings, lines.length);
  let rows = rowsForHeight(settings, heightIn);
  while (rows < lines.length) {
    sheets += 1;
    heightIn = Math.round(sheets * settings.pageHeightIn * 1000) / 1000;
    rows = rowsForHeight(settings, heightIn);
  }

  if (sheets <= settings.maxSheets) {
    const counters = { clipped: 0 };
    return {
      pages: [fitTo(lines, cols, rows, counters)],
      styles: [runsOf(lines.slice(0, rows))],
      pageHeightsIn: [heightIn],
      mode: "continuous",
      cols,
      clippedLines: counters.clipped,
      overflowLines: 0,
    };
  }

  // Longer than the maximum: pieces of maxSheets sheets each.
  const maxHeight = Math.round(settings.maxSheets * settings.pageHeightIn * 1000) / 1000;
  const maxRows = rowsForHeight(settings, maxHeight);
  const r = layoutInvoiceDetailed(inv, { cols, rows: maxRows }, strike);
  const counters = { clipped: r.clippedLines };
  const heights: number[] = [];
  const styles: StyleRun[][] = [];
  const pages = r.pages.map((page, i) => {
    if (i < r.pages.length - 1) {
      heights.push(maxHeight);
      styles.push(r.styles[i]);
      return page;
    }
    let used = page.length;
    while (used > 1 && page[used - 1].trim() === "") used--;
    let last = printedHeight(settings, used);
    let lastRows = rowsForHeight(settings, last.heightIn);
    while (lastRows < used) {
      last = { sheets: last.sheets + 1, heightIn: (last.sheets + 1) * settings.pageHeightIn };
      lastRows = rowsForHeight(settings, last.heightIn);
    }
    heights.push(last.heightIn);
    styles.push(r.styles[i].filter((x) => x.line < lastRows));
    return fitTo(page.slice(0, used).map(ln), cols, lastRows, counters);
  });
  return {
    pages,
    styles,
    pageHeightsIn: heights,
    mode: "pieces",
    cols,
    clippedLines: counters.clipped,
    overflowLines: r.overflowLines,
  };
}

/** The same bill with every crossed-out amount written as "(was 360.00)" instead
 * (no style runs at all): plain text for raw printing, e.g. a later QZ Tray step
 * that sends the lines straight to the printer. */
export function layoutBillPlain(inv: PrintInvoice, settings: PrintSettings): BillLayout {
  return layoutBill(inv, { ...settings, strikeMode: settings.strikeMode === "off" ? "off" : "text" });
}

// ── test data + calibration page (never touch the database) ─────────────

export function sampleInvoice(lineCount: number): PrintInvoice {
  const names = [
    "Mastarbun 1kg",
    "Darck chocolate (1/800)",
    "Fresh milk 1ltr",
    "Vegetable oil 20ltr",
    "Extra long sample item name used to test how wrapping behaves on paper",
    "Sponch cups (white)",
  ];
  const units = ["pack", "box", "kg", "litre", "piece", "bag"];
  const lines: PrintInvoiceLine[] = [];
  for (let i = 0; i < lineCount; i++) {
    const quantity = [1, 2, 3, 12.5, 100, 7][i % 6];
    const unitPrice = [100, 1250.5, 45, 8750, 12, 999.99][i % 6];
    // line discount on some lines, none on the others
    const lineDiscount = i % 9 === 4 ? 25 : i % 12 === 6 ? 10 : 0;
    const gross = Math.round(quantity * unitPrice * 100) / 100;
    // One of each kind of line for the test prints:
    //  0  no list price at all (an item with no selling price)  [+ discount on i%12==6]
    //  1  normal, 4 normal + the line discount above
    //  2  price typed BELOW the list price  -> crossed-out normal amount
    //  3  price typed ABOVE the list price  -> nothing crossed out
    //  5  price typed below the list price (smaller gap)
    const kind = i % 6;
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const listUnitPrice =
      kind === 0
        ? null
        : kind === 2
          ? round2(unitPrice * 1.25)
          : kind === 3
            ? round2(unitPrice * 0.8)
            : kind === 5
              ? round2(unitPrice * 1.2)
              : unitPrice;
    lines.push({
      itemName: `${names[i % names.length]}${lineCount > 6 ? ` #${i + 1}` : ""}`,
      quantity,
      unitName: units[i % units.length],
      unitPrice,
      lineDiscount,
      lineTotal: Math.round((gross - lineDiscount) * 100) / 100,
      listUnitPrice,
    });
  }
  const subtotal = Math.round(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0) * 100) / 100;
  const lineDiscountTotal = lines.reduce((s, l) => s + l.lineDiscount, 0);
  const billDiscount = 50;
  const total = Math.round((subtotal - lineDiscountTotal - billDiscount) * 100) / 100;
  const cash = Math.round((total / 2) * 100) / 100;
  const cheque = Math.round((total / 4) * 100) / 100;
  const credit = Math.round((total - cash - cheque) * 100) / 100;
  return {
    business: {
      name: "NEW KANDY ESSENCE",
      address: "Sample address line, Kandy",
      phone1: "081 0000000",
      phone2: "077 0000000",
    },
    invoiceNo: "INV-TEST",
    date: "2026-01-01",
    customerName: "Sample Customer",
    customerCode: "CUS-0001",
    customerPhone: "077 1234567",
    cashierName: "Test",
    lines,
    subtotal,
    lineDiscountTotal,
    billDiscount,
    total,
    payments: [
      { method: "cash", amount: cash },
      {
        method: "cheque",
        amount: cheque,
        chequeNumber: "123456",
        chequeBank: "BOC",
        chequeDate: "2026-02-01",
      },
    ],
    cashReceived: cash + 100,
    credit,
    footer: "Thank you. Come again.",
    label: null,
  };
}

/** One calibration page: a border on the exact first/last column and line, a
 * column ruler, line numbers, corner markers and a small sample bill. */
export function layoutCalibration(grid: PrintGrid): string[][] {
  const { cols, rows } = grid;
  const blank = () => Array.from({ length: cols }, () => " ");
  const put = (cells: string[], at: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      const idx = at + i;
      if (idx >= 1 && idx < cols - 1) cells[idx] = text[i];
    }
  };

  const grid2: string[][] = Array.from({ length: rows }, blank);
  const toLine = (cells: string[]) => cells.join("");

  // border
  for (let r = 0; r < rows; r++) {
    const cells = grid2[r];
    if (r === 0 || r === rows - 1) {
      for (let c = 0; c < cols; c++) cells[c] = c === 0 || c === cols - 1 ? "+" : "-";
    } else {
      cells[0] = "|";
      cells[cols - 1] = "|";
    }
  }

  // ruler (1-based columns): tens row, then ones row
  const tens = grid2[1];
  const ones = grid2[2];
  for (let c = 2; c <= cols - 1; c++) {
    tens[c - 1] = c % 10 === 0 ? String(Math.floor(c / 10) % 10) : " ";
    ones[c - 1] = String(c % 10);
  }

  // line numbers on every other inner line
  for (let r = 3; r < rows - 1; r++) put(grid2[r], 1, String(r + 1).padStart(2, "0"));

  // corner markers
  put(grid2[3], 4, "TL");
  put(grid2[3], cols - 6, "TR");
  put(grid2[rows - 2], 4, "BL");
  put(grid2[rows - 2], cols - 6, "BR");

  const info = [
    `CALIBRATION  ${cols} cols x ${rows} lines`,
    "Border = first/last column + line.",
    "Missing side? raise that margin.",
  ];
  info.forEach((t, i) => {
    if (4 + i < rows - 2) put(grid2[4 + i], 5, t);
  });

  // small sample bill in the remaining space
  const sampleCols = cols - 8;
  if (sampleCols >= 24) {
    const sample = layoutInvoice(sampleInvoice(3), { cols: sampleCols, rows: 60 })[0];
    const trimmed = sample.map((l) => l.trimEnd());
    while (trimmed.length && trimmed[trimmed.length - 1] === "") trimmed.pop();
    const start = 4 + info.length + 1;
    const maxLines = rows - 3 - start;
    trimmed.slice(0, Math.max(0, maxLines)).forEach((t, i) => put(grid2[start + i], 5, t));
  }

  return [grid2.map(toLine)];
}
