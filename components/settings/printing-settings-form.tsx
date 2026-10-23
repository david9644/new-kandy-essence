"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";
import { layoutBill, sampleInvoice } from "@/lib/print/invoice-layout";
import {
  DEFAULT_PRINT_SETTINGS,
  deriveGrid,
  settingsToQuery,
  validatePrintSettings,
  type PrintSettings,
} from "@/lib/print/settings";

const NUM =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-right text-sm tabular-nums text-foreground focus:border-primary focus:outline-none";

type NumKey = Exclude<keyof PrintSettings, "footer" | "continuous">;
type Draft = Record<NumKey, string> & { footer: string; continuous: boolean };

function toDraft(s: PrintSettings): Draft {
  return {
    pageWidthIn: String(s.pageWidthIn),
    pageHeightIn: String(s.pageHeightIn),
    marginTopIn: String(s.marginTopIn),
    marginBottomIn: String(s.marginBottomIn),
    marginLeftIn: String(s.marginLeftIn),
    marginRightIn: String(s.marginRightIn),
    cpi: String(s.cpi),
    lpi: String(s.lpi),
    footer: s.footer,
    continuous: s.continuous,
    maxSheets: String(s.maxSheets),
  };
}

function fromDraft(d: Draft): PrintSettings {
  const n = (v: string) => (v.trim() === "" ? NaN : Number(v));
  return {
    pageWidthIn: n(d.pageWidthIn),
    pageHeightIn: n(d.pageHeightIn),
    marginTopIn: n(d.marginTopIn),
    marginBottomIn: n(d.marginBottomIn),
    marginLeftIn: n(d.marginLeftIn),
    marginRightIn: n(d.marginRightIn),
    cpi: n(d.cpi),
    lpi: n(d.lpi),
    footer: d.footer,
    continuous: d.continuous,
    maxSheets: n(d.maxSheets),
  };
}

export function PrintingSettingsForm({
  initial,
  onSubmit,
}: {
  initial: PrintSettings;
  onSubmit: (input: PrintSettings) => Promise<{ error?: string; ok?: boolean }>;
}) {
  const [draft, setDraft] = useState<Draft>(toDraft(initial));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const settings = fromDraft(draft);
  const problem = validatePrintSettings(settings);
  const grid = problem ? null : deriveGrid(settings);
  const query = settingsToQuery(settings);

  // What a typical 20-line and 50-line bill comes out as with these values.
  const typical = problem
    ? null
    : [20, 50].map((n) => {
        const l = layoutBill(sampleInvoice(n), settings);
        const total = l.pageHeightsIn.reduce((a, b) => a + b, 0);
        return {
          n,
          pieces: l.pages.length,
          heightIn: total,
          sheets: Math.round((total / settings.pageHeightIn) * 100) / 100,
        };
      });

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  }

  function field(label: string, key: NumKey, hint?: string) {
    return (
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
        <KeyboardNumberInput value={draft[key]} onChange={(v) => set(key, v)} className={NUM} />
        {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (problem) {
      setError(problem);
      return;
    }
    startTransition(async () => {
      const result = await onSubmit(settings);
      if (result?.error) setError(result.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {field("Page width (in)", "pageWidthIn", "Including the tractor-hole strips")}
        {field("Page height (in)", "pageHeightIn")}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {field("Top margin (in)", "marginTopIn")}
        {field("Bottom margin (in)", "marginBottomIn")}
        {field("Left margin (in)", "marginLeftIn")}
        {field("Right margin (in)", "marginRightIn")}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field("Characters per inch", "cpi", "10 or 12 for most dot-matrix printers")}
        {field("Lines per inch", "lpi", "Usually 6")}
      </div>

      <div className="rounded-lg border border-border p-3">
        <label className="flex min-h-[44px] items-center gap-3 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            checked={draft.continuous}
            onChange={(e) => set("continuous", e.target.checked)}
            className="h-5 w-5"
          />
          Continuous bill (one long piece instead of several sheets)
        </label>
        <div className="mt-2 max-w-[14rem]">
          {field(
            "Maximum bill length (sheets)",
            "maxSheets",
            `One sheet = the page height (${draft.pageHeightIn} in). Longer bills are split.`
          )}
        </div>
      </div>

      <div className="rounded-lg bg-background px-3 py-2 text-sm">
        {grid && typical ? (
          <>
            <p>
              <span className="text-muted">Characters per line: </span>
              <span className="font-semibold text-foreground">{grid.cols}</span>
              <span className="text-muted"> &middot; lines per sheet: </span>
              <span className="font-semibold text-foreground">{grid.rows}</span>
            </p>
            {typical.map((t) => (
              <p key={t.n}>
                <span className="text-muted">Typical {t.n}-line bill (sample items) prints </span>
                <span className="font-semibold text-foreground">
                  {t.heightIn} in ({t.sheets} sheets
                  {t.pieces > 1 ? `, ${t.pieces} pieces` : ""})
                </span>
              </p>
            ))}
          </>
        ) : (
          <span className="text-danger">{problem}</span>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Bill footer line</label>
        <KeyboardTextInput
          value={draft.footer}
          onChange={(v) => set("footer", v)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending || problem !== null}
          className="flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save Printing Settings"}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(toDraft(DEFAULT_PRINT_SETTINGS));
            setSaved(false);
          }}
          className="flex h-11 items-center rounded-lg border border-border px-4 text-sm font-medium text-foreground active:bg-background"
        >
          Reset to defaults
        </button>
        {error && <p className="text-xs text-danger">{error}</p>}
        {saved && <p className="text-xs text-success">Saved.</p>}
      </div>

      <div className="rounded-xl border border-border bg-surface p-3">
        <p className="mb-2 text-sm font-medium text-foreground">Test prints</p>
        <p className="mb-3 text-xs text-muted">
          These use the values above (saved or not) and write nothing to the database. Choose
          printer <strong>TH880GJMS</strong>, paper <strong>NKE55</strong>, margins{" "}
          <strong>None</strong>, scale <strong>100%</strong>, headers/footers off. Check the
          border, the ruler (column numbers) and the line numbers on the paper: anything cut off
          means that margin is too small. With Continuous bill on, the test bill comes out as one long piece: its length is rounded up to a whole number of sheets, so check that the paper feeds that full length and stops on a perforation.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={problem ? "#" : `/print-test?kind=calibration&${query}`}
            aria-disabled={problem !== null}
            className={`flex h-11 items-center rounded-lg border border-primary px-4 text-sm font-medium text-primary ${
              problem ? "pointer-events-none opacity-40" : "active:bg-background"
            }`}
          >
            Print test page
          </Link>
          <Link
            href={problem ? "#" : `/print-test?kind=bill&${query}`}
            aria-disabled={problem !== null}
            className={`flex h-11 items-center rounded-lg border border-primary px-4 text-sm font-medium text-primary ${
              problem ? "pointer-events-none opacity-40" : "active:bg-background"
            }`}
          >
            Print test bill (50 lines)
          </Link>
        </div>
      </div>
    </form>
  );
}
