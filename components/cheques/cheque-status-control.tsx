"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateChequeStatus } from "@/app/(app)/cheques/actions";
import type { Database } from "@/lib/types/database.types";

type ChequeStatus = Database["public"]["Enums"]["cheque_status"];

const STATUS_STYLES: Record<ChequeStatus, string> = {
  pending: "border-warning text-warning bg-warning-surface",
  cleared: "border-success text-success bg-success-surface",
  bounced: "border-danger text-danger bg-danger-surface",
};

export function ChequeStatusControl({
  chequeId,
  status,
}: {
  chequeId: string;
  status: ChequeStatus;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          await updateChequeStatus(chequeId, e.target.value as ChequeStatus);
          router.refresh();
        })
      }
      className={`h-9 rounded-full border px-3 text-xs font-medium capitalize focus:outline-none focus:ring-2 focus:ring-accent-cheques disabled:opacity-50 ${STATUS_STYLES[status]}`}
    >
      <option value="pending">Pending</option>
      <option value="cleared">Cleared</option>
      <option value="bounced">Bounced</option>
    </select>
  );
}
