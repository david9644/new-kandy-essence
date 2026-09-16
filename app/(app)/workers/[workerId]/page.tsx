import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/units";
import { WorkerDetailActions } from "@/components/workers/worker-detail-actions";
import {
  WorkerPaymentHistoryTable,
  type PaymentRow,
} from "@/components/workers/worker-payment-history-table";
import { BackButton } from "@/components/shared/back-button";
import { PrintLayout } from "@/components/shared/print-layout";

export default async function WorkerDetailPage({
  params,
}: {
  params: Promise<{ workerId: string }>;
}) {
  const { workerId } = await params;
  await requireOwner();
  const supabase = await createClient();

  const [{ data: worker }, { data: payments }] = await Promise.all([
    supabase.from("workers").select("*").eq("id", workerId).maybeSingle(),
    supabase.rpc("get_worker_payment_history", { p_worker_id: workerId }),
  ]);

  if (!worker) notFound();

  const currentYear = String(new Date().getFullYear());
  const totalPaidThisYear = (payments ?? [])
    .filter((p) => p.date.startsWith(currentYear))
    .reduce((sum, p) => sum + p.amount, 0);

  const paymentRows: PaymentRow[] = payments ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <BackButton href="/workers" />
      <div className="mb-4 flex items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{worker.name}</h1>
          <p className="text-sm text-muted">
            {worker.code}
            {worker.position ? ` · ${worker.position}` : ""}
          </p>
        </div>
        <WorkerDetailActions
          workerId={worker.id}
          workerName={worker.name}
          active={worker.active}
          initial={{
            name: worker.name,
            contact: worker.contact ?? "",
            position: worker.position ?? "",
            monthly_salary: worker.monthly_salary,
          }}
        />
      </div>

      <PrintLayout title={worker.name} subtitle={`${worker.code} · Payment Record`}>
        <div className="mb-6 rounded-xl border border-border bg-surface p-4">
          <p className="text-sm text-muted">Total Paid This Year</p>
          <p className="text-3xl font-semibold text-foreground">
            {formatCurrency(totalPaidThisYear)}
          </p>
        </div>

        <WorkerPaymentHistoryTable rows={paymentRows} workerId={workerId} />
      </PrintLayout>
    </div>
  );
}
