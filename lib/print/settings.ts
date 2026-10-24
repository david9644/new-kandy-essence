// Print settings for the bill printer. Pure: no browser, no database. Nothing
// about the character grid is hard-coded anywhere else -- the page size,
// margins, characters-per-inch and lines-per-inch all come from here (stored
// in app_settings and tunable from Settings -> Printing with a test print).

/** How a discounted line's NORMAL amount is printed:
 *  strike = crossed out (the default), text = written "(was 360.00)", off = not shown. */
export type StrikeMode = "strike" | "text" | "off";
export const STRIKE_MODES: readonly StrikeMode[] = ["strike", "text", "off"];

export interface PrintSettings {
  pageWidthIn: number;
  pageHeightIn: number;
  marginTopIn: number;
  marginBottomIn: number;
  marginLeftIn: number;
  marginRightIn: number;
  /** Characters per inch (printer pitch). */
  cpi: number;
  /** Lines per inch. */
  lpi: number;
  footer: string;
  /** Print the whole bill as ONE long piece (see layoutBill). */
  continuous: boolean;
  /** Longest single piece, in sheets (one sheet = pageHeightIn). Longer bills
   * are cut into pieces of this length, each with a header and "Page x of y". */
  maxSheets: number;
  /** Crossed-out normal price on discounted lines (see StrikeMode). */
  strikeMode: StrikeMode;
}

export interface PrintGrid {
  /** Characters per printed line. */
  cols: number;
  /** Lines per page. */
  rows: number;
}

/** 1 cm in inches. The right margin was widened by this much (migration 0030):
 * the printed text now ends 1 cm earlier on the right than before. */
export const ONE_CM_IN = 0.3937;

// 5.5 x 5.5 in tractor paper (hole strips included), 12 cpi / 6 lpi.
export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  pageWidthIn: 5.5,
  pageHeightIn: 5.5,
  marginTopIn: 0.25,
  marginBottomIn: 0.25,
  marginLeftIn: 0.5,
  marginRightIn: 0.8937, // 0.5 in + 1 cm
  cpi: 12,
  lpi: 6,
  footer: "Thank you. Come again.",
  continuous: true,
  maxSheets: 6,
  strikeMode: "strike",
};

export const MIN_COLS = 30;
export const MIN_ROWS = 20;

const EPS = 1e-9;

export function deriveGrid(s: PrintSettings): PrintGrid {
  const usableW = s.pageWidthIn - s.marginLeftIn - s.marginRightIn;
  const usableH = s.pageHeightIn - s.marginTopIn - s.marginBottomIn;
  return {
    cols: Math.max(0, Math.floor(usableW * s.cpi + EPS)),
    rows: Math.max(0, Math.floor(usableH * s.lpi + EPS)),
  };
}

/** Whole lines that fit in a page of the given height (top/bottom margins taken off). */
export function rowsForHeight(s: PrintSettings, heightIn: number): number {
  return Math.max(0, Math.floor((heightIn - s.marginTopIn - s.marginBottomIn) * s.lpi + EPS));
}

/** Printed length of a piece with `lineCount` lines: lines x line height plus
 * the top and bottom margins, ROUNDED UP to a whole number of sheets, so the
 * next bill starts on a perforation of the tractor paper. */
export function printedHeight(
  s: PrintSettings,
  lineCount: number
): { sheets: number; heightIn: number } {
  const needIn = Math.max(1, lineCount) / s.lpi + s.marginTopIn + s.marginBottomIn;
  const sheets = Math.max(1, Math.ceil(needIn / s.pageHeightIn - 1e-6));
  return { sheets, heightIn: Math.round(sheets * s.pageHeightIn * 1000) / 1000 };
}

/** Font size (pt) whose monospace advance width is exactly 1/cpi inch.
 * Courier-like fonts have a 0.6 em advance: 72/cpi pt per char / 0.6. */
export function fontSizePt(cpi: number): number {
  return 120 / cpi;
}

function inRange(n: number, min: number, max: number): boolean {
  return Number.isFinite(n) && n >= min && n <= max;
}

/** Returns an error message, or null when the settings are usable. */
export function validatePrintSettings(s: PrintSettings): string | null {
  if (!inRange(s.pageWidthIn, 2, 12)) return "Page width must be between 2 and 12 inches.";
  if (!inRange(s.pageHeightIn, 2, 14)) return "Page height must be between 2 and 14 inches.";
  for (const [label, v] of [
    ["Top margin", s.marginTopIn],
    ["Bottom margin", s.marginBottomIn],
    ["Left margin", s.marginLeftIn],
    ["Right margin", s.marginRightIn],
  ] as const) {
    if (!inRange(v, 0, 3)) return `${label} must be between 0 and 3 inches.`;
  }
  if (!inRange(s.cpi, 5, 30)) return "Characters per inch must be between 5 and 30.";
  if (!inRange(s.lpi, 3, 16)) return "Lines per inch must be between 3 and 16.";
  if (!Number.isInteger(s.maxSheets) || s.maxSheets < 1 || s.maxSheets > 20) {
    return "Maximum bill length must be a whole number of sheets between 1 and 20.";
  }
  if (!STRIKE_MODES.includes(s.strikeMode)) {
    return "Choose how the normal price of a discounted line is printed.";
  }
  if (s.footer.length > 80) return "The footer line can be at most 80 characters.";
  if (/[\r\n]/.test(s.footer)) return "The footer must be a single line.";

  const grid = deriveGrid(s);
  if (grid.cols < MIN_COLS) {
    return `Only ${grid.cols} characters fit across the page; at least ${MIN_COLS} are needed. Reduce the side margins or the characters per inch.`;
  }
  if (grid.rows < MIN_ROWS) {
    return `Only ${grid.rows} lines fit on the page; at least ${MIN_ROWS} are needed. Reduce the top/bottom margins or the lines per inch.`;
  }
  return null;
}

/** Read overrides from URL search params (used by the test-print page so the
 * owner can try values before saving them). Unknown / invalid -> base value. */
export function applyOverrides(
  base: PrintSettings,
  params: Record<string, string | string[] | undefined>
): PrintSettings {
  const num = (key: string, fallback: number): number => {
    const raw = params[key];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (v === undefined || v === "") return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const flag = (key: string, fallback: boolean): boolean => {
    const raw = params[key];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (v === undefined || v === "") return fallback;
    return v === "1" || v === "true";
  };
  const strikeParam = (raw: string | string[] | undefined, fallback: StrikeMode): StrikeMode => {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (STRIKE_MODES as readonly string[]).includes(v ?? "") ? (v as StrikeMode) : fallback;
  };
  const footerRaw = params.footer;
  const footer = Array.isArray(footerRaw) ? footerRaw[0] : footerRaw;
  return {
    pageWidthIn: num("w", base.pageWidthIn),
    pageHeightIn: num("h", base.pageHeightIn),
    marginTopIn: num("mt", base.marginTopIn),
    marginBottomIn: num("mb", base.marginBottomIn),
    marginLeftIn: num("ml", base.marginLeftIn),
    marginRightIn: num("mr", base.marginRightIn),
    cpi: num("cpi", base.cpi),
    lpi: num("lpi", base.lpi),
    footer: footer !== undefined ? footer : base.footer,
    continuous: flag("cont", base.continuous),
    maxSheets: num("maxs", base.maxSheets),
    strikeMode: strikeParam(params.sm, base.strikeMode),
  };
}

export function settingsToQuery(s: PrintSettings): string {
  const p = new URLSearchParams({
    w: String(s.pageWidthIn),
    h: String(s.pageHeightIn),
    mt: String(s.marginTopIn),
    mb: String(s.marginBottomIn),
    ml: String(s.marginLeftIn),
    mr: String(s.marginRightIn),
    cpi: String(s.cpi),
    lpi: String(s.lpi),
    footer: s.footer,
    cont: s.continuous ? "1" : "0",
    maxs: String(s.maxSheets),
    sm: s.strikeMode,
  });
  return p.toString();
}
