import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PrintFrame } from "@/components/print/print-frame";
import { loadPrintConfig } from "@/lib/print/load";
import { layoutBill, layoutCalibration, sampleInvoice } from "@/lib/print/invoice-layout";
import { applyOverrides, deriveGrid, validatePrintSettings } from "@/lib/print/settings";

// Test prints for tuning the grid at Station 1. Owner only. Writes nothing to
// the database: the page and the sample bill are generated on the fly.
// Query params (w, h, mt, mb, ml, mr, cpi, lpi, footer) override the saved
// settings so values can be tried before they are saved.
export default async function PrintTestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  await requireOwner();
  const supabase = await createClient();
  const config = await loadPrintConfig(supabase);

  const settings = applyOverrides(config.settings, params);
  const error = validatePrintSettings(settings);
  const kind = params.kind === "bill" ? "bill" : "calibration";
  const nRaw = Number(Array.isArray(params.n) ? params.n[0] : params.n);
  const lineCount = Number.isFinite(nRaw) ? Math.min(300, Math.max(1, Math.round(nRaw))) : 50;

  if (error) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <p className="rounded-lg bg-danger-surface px-4 py-3 text-danger">{error}</p>
        <a href="/settings" className="mt-4 inline-block font-medium text-primary">
          Back to Settings
        </a>
      </div>
    );
  }

  const grid = deriveGrid(settings);
  const bill =
    kind === "bill"
      ? layoutBill(
          { ...sampleInvoice(lineCount), business: config.business, footer: settings.footer },
          settings
        )
      : null;
  const pages = bill ? bill.pages : layoutCalibration(grid);
  // The calibration page is one ordinary sheet (the page height itself).
  const pageHeightsIn = bill ? bill.pageHeightsIn : pages.map(() => settings.pageHeightIn);

  return (
    <PrintFrame
      pages={pages}
      styles={bill?.styles}
      pageHeightsIn={pageHeightsIn}
      settings={settings}
      title={
        kind === "bill"
          ? `Test bill (${lineCount} lines) · ${grid.cols} chars wide`
          : `Calibration page · ${grid.cols}×${grid.rows}`
      }
      backHref="/settings"
      backLabel="Back to Settings"
    />
  );
}
