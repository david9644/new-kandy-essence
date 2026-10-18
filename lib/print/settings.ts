// Print settings for the bill printer. Pure: no browser, no database. Nothing
// about the character grid is hard-coded anywhere else -- the page size,
// margins, characters-per-inch and lines-per-inch all come from here (stored
// in app_settings and tunable from Settings -> Printing with a test print).

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
}

export interface PrintGrid {
  /** Characters per printed line. */
  cols: number;
  /** Lines per page. */
  rows: number;
}

// 5.5 x 5.5 in tractor paper (hole strips included), 12 cpi / 6 lpi.
export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  pageWidthIn: 5.5,
  pageHeightIn: 5.5,
  marginTopIn: 0.25,
  marginBottomIn: 0.25,
  marginLeftIn: 0.5,
  marginRightIn: 0.5,
  cpi: 12,
  lpi: 6,
  footer: "Thank you. Come again.",
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
  });
  return p.toString();
}
