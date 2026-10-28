// The header of the printed bill: business name, tagline, address, phones. Pure (no
// browser, no database). The ONE place that turns the four header settings into printed
// lines, so the real print view, the test bill, the calibration sample and the Settings
// preview cannot drift apart.
//
// Every line is centred in the line width given by the print settings (never a fixed
// number). Text wraps at word boundaries, balanced so the lines look even; a single word
// longer than the line is cut at the line width, never allowed to overflow.

export interface PrintBusiness {
  name: string;
  /** Printed directly under the name. */
  tagline: string;
  address: string;
  /** Printed with the prefix "Tel: ". */
  phones: string;
}

/** Longest values, in characters (also enforced by the database). */
export const BUSINESS_NAME_MAX = 40;
export const BUSINESS_TAGLINE_MAX = 120;
export const BUSINESS_ADDRESS_MAX = 80;
export const BUSINESS_PHONES_MAX = 60;

/** One-line, single-spaced text. Control characters become spaces. */
export function squash(s: string | null | undefined): string {
  return (s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Distinct characters a dot-matrix printer cannot print (anything outside plain ASCII
 * from space to ~). Line breaks and tabs are not listed: they are squashed to spaces. */
export function unprintableChars(s: string): string[] {
  const found: string[] = [];
  for (const ch of squash(s)) {
    if (!/^[ -~]$/.test(ch) && !found.includes(ch)) found.push(ch);
  }
  return found;
}

/** The text exactly as it is printed: squashed, and every character the printer cannot
 * print shown as "?" (one per character, so the width stays what the form checked). */
export function toPrintable(s: string | null | undefined): string {
  return Array.from(squash(s))
    .map((ch) => (/^[ -~]$/.test(ch) ? ch : "?"))
    .join("");
}

function center(s: string, w: number): string {
  if (s.length >= w) return s;
  return " ".repeat(Math.floor((w - s.length) / 2)) + s;
}

function greedy(words: string[], width: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur === "") cur = w;
    else if (cur.length + 1 + w.length <= width) cur += " " + w;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// Same number of lines as the plain greedy wrap, but at the narrowest width that still
// gives that many lines, so the lines come out about the same length.
function balanced(words: string[], width: number): string[] {
  const lines = greedy(words, width);
  if (lines.length <= 1) return lines;
  let w = Math.max(...words.map((x) => x.length));
  while (w < width && greedy(words, w).length > lines.length) w++;
  return greedy(words, w);
}

/** Wrap at word boundaries into balanced lines no longer than `width`. A word longer
 * than `width` is cut into pieces of `width`. Empty text gives no lines. */
export function wrapBalanced(text: string, width: number): string[] {
  const t = toPrintable(text);
  if (t === "") return [];
  const w = Math.max(1, Math.floor(width));
  const out: string[] = [];
  let seg: string[] = [];
  const flush = () => {
    if (seg.length) out.push(...balanced(seg, w));
    seg = [];
  };
  for (const word of t.split(" ")) {
    if (word.length > w) {
      flush();
      let rest = word;
      while (rest.length > w) {
        out.push(rest.slice(0, w));
        rest = rest.slice(w);
      }
      if (rest) seg = [rest];
    } else {
      seg.push(word);
    }
  }
  flush();
  return out;
}

function centeredWrapped(text: string, cols: number): string[] {
  return wrapBalanced(text, cols).map((l) => center(l, cols));
}

/** The phones as printed: "Tel: " in front, unless the owner typed it already. */
export function phonesText(phones: string | null | undefined): string {
  const p = toPrintable(phones);
  if (p === "") return "";
  return /^tel\s*[:.]/i.test(p) ? p : `Tel: ${p}`;
}

/** The header lines, centred in `cols`. `full` = the first page (name, tagline, address,
 * phones); otherwise just the name (the short header repeated on later pieces).
 * An empty part is skipped without leaving a blank line. */
export function businessHeaderLines(b: PrintBusiness, cols: number, full: boolean): string[] {
  const out: string[] = [];
  out.push(...centeredWrapped(b.name, cols));
  if (!full) return out;
  out.push(...centeredWrapped(b.tagline, cols));
  for (const part of (b.address ?? "").split(/\r?\n/)) out.push(...centeredWrapped(part, cols));
  out.push(...centeredWrapped(phonesText(b.phones), cols));
  return out;
}
