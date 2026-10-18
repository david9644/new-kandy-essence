import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PrintFrame } from "@/components/print/print-frame";
import { loadPrintConfig } from "@/lib/print/load";
import { layoutCalibration, layoutInvoice, sampleInvoice } from "@/lib/print/invoice-layout";
import {
  applyOverrides,
  deriveGrid,
  validatePrintSettings,
} from "@/lib/print/settings";

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
  const pages =
    kind === "bill"
      ? layoutInvoice(
          { ...sampleInvoice(50), business: config.business, footer: settings.footer },
          grid
        )
      : layoutCalibration(grid);

  return (
    <PrintFrame
      pages={pages}
      settings={settings}
      title={
        kind === "bill"
          ? `Test bill (50 lines) · ${grid.cols}×${grid.rows}`
          : `Calibration page · ${grid.cols}×${grid.rows}`
      }
      backHref="/settings"
      backLabel="Back to Settings"
    />
  );
}
