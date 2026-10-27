"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  returnToNewBill,
}: {
  invoiceId: string;
  invoice: PrintInvoice;
  settings: PrintSettings;
  printCount: number;
  editCount: number;
  autoPrint: boolean;
  /** Save & Print: after the automatic print, go back to a fresh empty new bill. */
  returnToNewBill: boolean;
}) {
  const router = useRouter();
  const [printCount, setPrintCount] = useState(initialPrintCount);
  const [copyChecked, setCopyChecked] = useState(initialPrintCount > 0);
  const [recordFailed, setRecordFailed] = useState(false);
  const recording = useRef(false);
  const returnPending = useRef(false);

  const label = copyChecked ? "COPY" : editCount > 0 ? "REVISED" : null;
  const layout = useMemo(
    () => layoutBill({ ...invoice, label }, settings),
    [invoice, label, settings]
  );

  // A bill that was printed before is never printed automatically again (a reload
  // of this page, Back/Forward): only the Print button prints it, as a COPY.
  const autoPrintNow = autoPrint && initialPrintCount === 0;

  const handleAfterPrint = useCallback(async () => {
    if (recording.current) return;
    recording.current = true;
    const count = await recordInvoicePrint(invoiceId);
    recording.current = false;
    if (count === null) {
      // printed, but not recorded: stay here so nobody misses it (no retry: a retry
      // could count the same print twice)
      returnPending.current = false;
      setRecordFailed(true);
      return;
    }
    setPrintCount(count);
    // the next print of this bill is a copy
    setCopyChecked(true);
    if (returnPending.current) {
      returnPending.current = false;
      // replace: Back from the new bill never lands on this print view
      router.replace("/billing/new");
    }
  }, [invoiceId, router]);

  return (
    <PrintFrame
      pages={layout.pages}
      styles={layout.styles}
      pageHeightsIn={layout.pageHeightsIn}
      settings={settings}
      title={invoice.invoiceNo}
      backHref={`/billing/${invoiceId}`}
      backLabel="Back to bill"
      autoPrint={autoPrintNow}
      autoPrintKey={invoiceId}
      onAutoPrint={() => {
        returnPending.current = returnToNewBill;
      }}
      newBillHref="/billing/new"
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
        recordFailed
          ? "It printed, but the print could not be recorded on the bill. Press New bill to carry on."
          : printCount > 0
            ? `This bill has been printed ${printCount} time${printCount === 1 ? "" : "s"}.`
            : "Not printed yet."
      }
    />
  );
}
