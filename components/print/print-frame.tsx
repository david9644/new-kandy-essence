"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { deriveGrid, fontSizePt, type PrintSettings } from "@/lib/print/settings";

// Renders pre-laid-out pages (arrays of fixed-width strings, see
// lib/print/invoice-layout.ts) on screen and on paper. It only knows how to
// show strings in a monospace font on a page of the configured size -- all
// layout decisions were already made by the engine.
//
// Exactness:
//   * font-size is chosen so a Courier-like glyph advances exactly 1/cpi inch
//     (advance = 0.6 em  ->  size = 120/cpi pt), and line-height is exactly
//     1/lpi inch, so character N always lands in column N of the grid;
//   * the page div is a hair shorter than the paper (0.01 in) so rounding can
//     never push content onto an extra sheet; every page but the last breaks
//     after itself, so there is no blank trailing page;
//   * @page sets the paper size with zero margins -- the margins live inside
//     the page div, so the printer driver's own margins stay at None.
export function PrintSheet({ pages, settings }: { pages: string[][]; settings: PrintSettings }) {
  const { rows } = deriveGrid(settings);
  const lineIn = 1 / settings.lpi;
  const css = `
@page { size: ${settings.pageWidthIn}in ${settings.pageHeightIn}in; margin: 0; }
.nke-page {
  width: ${settings.pageWidthIn}in;
  height: ${settings.pageHeightIn - 0.01}in;
  padding: ${settings.marginTopIn}in ${settings.marginRightIn}in ${settings.marginBottomIn}in ${settings.marginLeftIn}in;
  box-sizing: border-box;
  overflow: hidden;
  background: #fff;
  color: #000;
}
.nke-page pre {
  margin: 0;
  padding: 0;
  height: ${rows * lineIn}in;
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
          <div className="nke-page" key={i} data-page={i + 1}>
            <pre>{lines.join("\n")}</pre>
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
          <strong>off</strong>. {pages.length} {pages.length === 1 ? "page" : "pages"}.
        </p>
        {status && <p className="mx-auto mt-1 max-w-3xl text-xs text-foreground">{status}</p>}
      </div>
      <PrintSheet pages={pages} settings={settings} />
    </div>
  );
}
