"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PrintFrame } from "@/components/print/print-frame";
import { layoutBill, type PrintInvoice } from "@/lib/print/invoice-layout";
import type { PrintSettings } from "@/lib/print/settings";
import { recordInvoicePrint } from "@/app/(app)/billing/actions";
// The fresh bill after a print opens from what the till already holds in the browser
// (see lib/till/memory.ts) instead of waiting for the whole shelf from the server again.
import { FRESH_BILL_HREF as NEW_BILL_FROM_MEMORY, FULL_PREFETCH, flagUnrecordedPrint } from "@/lib/till/memory";

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

  // the way back is fetched while this prints (the till did the same a moment ago)
  useEffect(() => {
    if (returnToNewBill) router.prefetch(NEW_BILL_FROM_MEMORY, FULL_PREFETCH);
  }, [returnToNewBill, router]);

  const label = copyChecked ? "COPY" : editCount > 0 ? "REVISED" : null;
  const layout = useMemo(
    () => layoutBill({ ...invoice, label }, settings),
    [invoice, label, settings]
  );

  // A bill that was printed before is never printed automatically again (a reload
  // of this page, Back/Forward): only the Print button prints it, as a COPY.
  const autoPrintNow = autoPrint && initialPrintCount === 0;

  // After the print: the record of the print and the way back to a fresh bill start TOGETHER,
  // so the cashier is never kept waiting for the record. It is still recorded exactly once
  // per print (the guard below). A failed record after we have left is reported on the
  // fresh bill; staying here (the Print button) it shows here, as before.
  const handleAfterPrint = useCallback(() => {
    if (recording.current) return;
    recording.current = true;
    const leaving = returnPending.current;
    returnPending.current = false;
    const done = recordInvoicePrint(invoiceId);
    if (leaving) router.replace(NEW_BILL_FROM_MEMORY); // replace: Back never lands on this print view
    void done.then(
      (count) => {
        recording.current = false;
        if (count === null) return failed(leaving);
        setPrintCount(count);
        // the next print of this bill is a copy
        setCopyChecked(true);
      },
      () => {
        recording.current = false;
        failed(leaving);
      }
    );
    // no retry on failure: a retry could count the same print twice
    function failed(left: boolean) {
      if (left) flagUnrecordedPrint(invoice.invoiceNo);
      else setRecordFailed(true);
    }
  }, [invoiceId, invoice.invoiceNo, router]);

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
      newBillHref={NEW_BILL_FROM_MEMORY}
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
