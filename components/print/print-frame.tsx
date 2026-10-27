"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef } from "react";
import { fontSizePt, type PrintSettings } from "@/lib/print/settings";
import type { StyleRun } from "@/lib/print/invoice-layout";

// Renders pre-laid-out pages (arrays of fixed-width strings, see
// lib/print/invoice-layout.ts) on screen and on paper. It only knows how to
// show strings in a monospace font on a page of the configured size -- all
// layout decisions were already made by the engine.
//
// Exactness:
//   * font-size is chosen so a Courier-like glyph advances exactly 1/cpi inch
//     (advance = 0.6 em  ->  size = 120/cpi pt), and line-height is exactly
//     1/lpi inch, so character N always lands in column N of the grid;
//   * each piece is a hair shorter than its paper (0.01 in) so rounding can
//     never push content onto an extra sheet; every piece but the last breaks
//     after itself, so there is no blank trailing page; a continuous bill is
//     ONE piece as tall as a whole number of sheets (see layoutBill);
//   * @page sets the paper size with zero margins -- the margins live inside
//     the page div, so the printer driver's own margins stay at None.
// One line of a piece as React nodes: plain text, with the struck column ranges
// wrapped in a line-through span. Same characters in the same columns either way.
function renderLine(text: string, runs: StyleRun[]) {
  if (runs.length === 0) return text;
  const parts: React.ReactNode[] = [];
  let at = 0;
  [...runs]
    .sort((a, b) => a.start - b.start)
    .forEach((r, i) => {
      const start = Math.max(at, Math.min(r.start, text.length));
      const end = Math.max(start, Math.min(r.end, text.length));
      if (start > at) parts.push(text.slice(at, start));
      if (end > start) {
        parts.push(
          <span key={i} className="nke-strike">
            {text.slice(start, end)}
          </span>
        );
      }
      at = end;
    });
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}

export function PrintSheet({
  pages,
  styles,
  pageHeightsIn,
  settings,
}: {
  pages: string[][];
  /** Struck-through runs per piece (omit for none). */
  styles?: StyleRun[][];
  /** Printed height of each piece (a whole number of sheets). */
  pageHeightsIn: number[];
  settings: PrintSettings;
}) {
  const lineIn = 1 / settings.lpi;
  const heightOf = (i: number) => pageHeightsIn[i] ?? settings.pageHeightIn;
  const distinct = [...new Set(pages.map((_, i) => heightOf(i)))];
  // One paper size per document unless pieces differ (a very long bill cut into
  // pieces): then each distinct height gets its own named @page.
  const pageRules =
    distinct.length === 1
      ? `@page { size: ${settings.pageWidthIn}in ${distinct[0]}in; margin: 0; }`
      : `@page { size: ${settings.pageWidthIn}in ${heightOf(0)}in; margin: 0; }\n` +
        distinct
          .map(
            (h, k) =>
              `@page nke${k} { size: ${settings.pageWidthIn}in ${h}in; margin: 0; }\n.nke-page[data-h="${h}"] { page: nke${k}; }`
          )
          .join("\n");
  const css = `
${pageRules}
.nke-page {
  width: ${settings.pageWidthIn}in;
  padding: ${settings.marginTopIn}in ${settings.marginRightIn}in ${settings.marginBottomIn}in ${settings.marginLeftIn}in;
  box-sizing: border-box;
  overflow: hidden;
  background: #fff;
  color: #000;
}
.nke-page pre .nke-strike { text-decoration: line-through; text-decoration-thickness: 1px; }
.nke-page pre {
  margin: 0;
  padding: 0;
  font-family: "Courier New", Courier, monospace;
  font-size: ${fontSizePt(settings.cpi)}pt;
  line-height: ${lineIn}in;
  font-weight: 400;
  font-variant-ligatures: none;
  font-kerning: none;
  letter-spacing: 0;
  white-space: pre;
  overflow: hidden;
}
@media screen {
  .nke-page { margin: 14px auto; box-shadow: 0 1px 6px rgba(0,0,0,.35); }
}
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .nke-toolbar { display: none !important; }
  .nke-page { margin: 0 !important; box-shadow: none !important; break-after: page; page-break-after: always; }
  .nke-page:last-child { break-after: auto; page-break-after: auto; }
}`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="nke-sheet">
        {pages.map((lines, i) => (
          // The piece is a hair (0.01 in) shorter than the paper so rounding can
          // never push content onto an extra sheet; the text block is exactly
          // its line count tall.
          <div
            className="nke-page"
            key={i}
            data-page={i + 1}
            data-h={heightOf(i)}
            style={{ height: `${heightOf(i) - 0.01}in` }}
          >
            <pre style={{ height: `${lines.length * lineIn}in` }}>
              {lines.map((text, li) => (
                <Fragment key={li}>
                  {renderLine(text, (styles?.[i] ?? []).filter((r) => r.line === li))}
                  {li < lines.length - 1 ? "\n" : null}
                </Fragment>
              ))}
            </pre>
          </div>
        ))}
      </div>
    </>
  );
}

// Screen-only toolbar + the sheet. `onAfterPrint` fires when the browser's
// print dialog closes (also when it is cancelled -- browsers do not tell the
// page which).
export function PrintFrame({
  pages,
  styles,
  pageHeightsIn,
  settings,
  title,
  backHref,
  backLabel = "Back",
  autoPrint = false,
  autoPrintKey,
  onAutoPrint,
  newBillHref,
  onAfterPrint,
  toolbarExtra,
  status,
}: {
  pages: string[][];
  styles?: StyleRun[][];
  pageHeightsIn: number[];
  settings: PrintSettings;
  title: string;
  backHref: string;
  backLabel?: string;
  autoPrint?: boolean;
  /** Identifies this document for the "already printed automatically" memory. */
  autoPrintKey?: string;
  /** Called right before an automatic print starts. */
  onAutoPrint?: () => void;
  /** When set, a "New bill" button is always shown in the toolbar. */
  newBillHref?: string;
  onAfterPrint?: () => void;
  toolbarExtra?: React.ReactNode;
  status?: React.ReactNode;
}) {
  const autoDone = useRef(false);
  const totalIn = pageHeightsIn.reduce((a, b) => a + b, 0);
  const sheets = Math.round((totalIn / settings.pageHeightIn) * 100) / 100;
  const lengthText = `${Math.round(totalIn * 100) / 100} in (${sheets} sheet${sheets === 1 ? "" : "s"}${
    pages.length > 1 ? `, ${pages.length} pieces` : ""
  })`;
  const afterRef = useRef(onAfterPrint);
  useEffect(() => {
    afterRef.current = onAfterPrint;
  }, [onAfterPrint]);

  useEffect(() => {
    const handler = () => afterRef.current?.();
    window.addEventListener("afterprint", handler);
    return () => window.removeEventListener("afterprint", handler);
  }, []);

  const onAutoPrintRef = useRef(onAutoPrint);
  useEffect(() => {
    onAutoPrintRef.current = onAutoPrint;
  }, [onAutoPrint]);

  // The automatic print happens at most ONCE per document: not twice by React's
  // double effect (autoDone), not again after a reload or Back/Forward (the
  // sessionStorage memory, and the address stops asking for it). Printing again
  // is only ever the Print button, on purpose.
  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => {
      if (autoDone.current) return;
      const memory = autoPrintKey ? `nke-autoprint:${autoPrintKey}` : null;
      try {
        if (memory && window.sessionStorage.getItem(memory)) return;
      } catch {
        // no sessionStorage: the server-side "printed before" check still protects a reload
      }
      autoDone.current = true;
      try {
        if (memory) window.sessionStorage.setItem(memory, "1");
      } catch {
        // see above
      }
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has("auto") || url.searchParams.has("next")) {
          url.searchParams.delete("auto");
          url.searchParams.delete("next");
          window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
        }
      } catch {
        // cosmetic only
      }
      onAutoPrintRef.current?.();
      window.print();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [autoPrint, autoPrintKey]);

  return (
    <div className="min-h-screen bg-neutral-300 pb-8 print:bg-white print:pb-0">
      <div className="nke-toolbar sticky top-0 z-30 border-b border-border bg-surface px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex h-12 items-center rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground"
          >
            Print
          </button>
          <Link
            href={backHref}
            className="flex h-12 items-center rounded-xl border border-border px-5 text-base font-medium text-foreground active:bg-background"
          >
            {backLabel}
          </Link>
          {newBillHref && (
            <Link
              href={newBillHref}
              replace
              className="flex h-12 items-center rounded-xl border border-border px-5 text-base font-medium text-foreground active:bg-background"
            >
              New bill
            </Link>
          )}
          {toolbarExtra}
          <span className="ml-auto text-sm font-medium text-foreground">{title}</span>
        </div>
        <p className="mx-auto mt-2 max-w-3xl text-xs text-muted">
          In the print window choose printer <strong>TH880GJMS</strong>, paper{" "}
          <strong>NKE55</strong> ({settings.pageWidthIn} × {settings.pageHeightIn} in), margins{" "}
          <strong>None</strong>, scale <strong>100%</strong>, headers and footers{" "}
          <strong>off</strong>. Printed length: <strong>{lengthText}</strong>.
        </p>
        {status && <p className="mx-auto mt-1 max-w-3xl text-xs text-foreground">{status}</p>}
      </div>
      <PrintSheet pages={pages} styles={styles} pageHeightsIn={pageHeightsIn} settings={settings} />
    </div>
  );
}
