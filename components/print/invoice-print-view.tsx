"use client";

import { useCallback, useMemo, useState } from "react";
import { PrintFrame } from "@/components/print/print-frame";
import { layoutBill, type PrintInvoice } from "@/lib/print/invoice-layout";
import type { PrintSettings } from "@/lib/print/settings";
import { recordInvoicePrint } from "@/app/(app)/billing/actions";

// The bill as it will come out of the printer. Label rule:
//   printed before            -> COPY   (checkbox starts ticked, untick it if the
//                                        earlier print failed)
//   else edited after issue   -> REVISED
//   else                      -> no label
export function InvoicePrintView({
  invoiceId,
  invoice,
  settings,
  printCount: initialPrintCount,
  editCount,
  autoPrint,
}: {
  invoiceId: string;
  invoice: PrintInvoice;
  settings: PrintSettings;
  printCount: number;
  editCount: number;
  autoPrint: boolean;
}) {
  const [printCount, setPrintCount] = useState(initialPrintCount);
  const [copyChecked, setCopyChecked] = useState(initialPrintCount > 0);
  const [recording, setRecording] = useState(false);

  const label = copyChecked ? "COPY" : editCount > 0 ? "REVISED" : null;
  const layout = useMemo(
    () => layoutBill({ ...invoice, label }, settings),
    [invoice, label, settings]
  );

  const handleAfterPrint = useCallback(async () => {
    if (recording) return;
    setRecording(true);
    const count = await recordInvoicePrint(invoiceId);
    setRecording(false);
    if (count !== null) {
      setPrintCount(count);
      // the next print of this bill is a copy
      setCopyChecked(true);
    }
  }, [invoiceId, recording]);

  return (
    <PrintFrame
      pages={layout.pages}
      pageHeightsIn={layout.pageHeightsIn}
      settings={settings}
      title={invoice.invoiceNo}
      backHref={`/billing/${invoiceId}`}
      backLabel="Back to bill"
      autoPrint={autoPrint}
      onAfterPrint={handleAfterPrint}
      toolbarExtra={
        <label className="flex h-12 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            checked={copyChecked}
            onChange={(e) => setCopyChecked(e.target.checked)}
            className="h-5 w-5"
          />
          Print as COPY
        </label>
      }
      status={
        printCount > 0
          ? `This bill has been printed ${printCount} time${printCount === 1 ? "" : "s"}.`
          : "Not printed yet."
      }
    />
  );
}
