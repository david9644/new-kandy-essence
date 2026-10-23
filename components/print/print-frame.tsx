"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { fontSizePt, type PrintSettings } from "@/lib/print/settings";

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
export function PrintSheet({
  pages,
  pageHeightsIn,
  settings,
}: {
  pages: string[][];
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
            <pre style={{ height: `${lines.length * lineIn}in` }}>{lines.join("\n")}</pre>
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
  pageHeightsIn,
  settings,
  title,
  backHref,
  backLabel = "Back",
  autoPrint = false,
  onAfterPrint,
  toolbarExtra,
  status,
}: {
  pages: string[][];
  pageHeightsIn: number[];
  settings: PrintSettings;
  title: string;
  backHref: string;
  backLabel?: string;
  autoPrint?: boolean;
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

  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => {
      if (autoDone.current) return;
      autoDone.current = true;
      window.print();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [autoPrint]);

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
      <PrintSheet pages={pages} pageHeightsIn={pageHeightsIn} settings={settings} />
    </div>
  );
}
