import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/units";
import { WorkerDetailActions } from "@/components/workers/worker-detail-actions";
import {
  WorkerPaymentHistoryTable,
  type PaymentRow,
} from "@/components/workers/worker-payment-history-table";
import { WorkerMonthlyBreakdownTable } from "@/components/workers/worker-monthly-breakdown-table";
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

  const [{ data: worker }, { data: payments }, { data: balanceData }, { data: breakdown }] =
    await Promise.all([
      supabase.from("workers").select("*").eq("id", workerId).maybeSingle(),
      supabase.rpc("get_worker_payment_history", { p_worker_id: workerId }),
      supabase.rpc("get_worker_balance", { p_worker_id: workerId }),
      supabase.rpc("get_worker_monthly_breakdown", { p_worker_id: workerId }),
    ]);

  if (!worker) notFound();

  const paymentRows: PaymentRow[] = payments ?? [];
  const balance = balanceData ?? 0;
  const hasSalary = worker.monthly_salary != null;

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
            salary_start_date: worker.salary_start_date ?? "",
          }}
        />
      </div>

      <PrintLayout title={worker.name} subtitle={`${worker.code} · Payment Record`}>
        {hasSalary ? (
          <>
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-sm text-muted">Monthly Salary</p>
                <p className="text-3xl font-semibold text-foreground">
                  {formatCurrency(worker.monthly_salary ?? 0)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-4">
                <p className="text-sm text-muted">{balance < 0 ? "Advance Paid" : "Balance Due"}</p>
                <p
                  className={`text-3xl font-semibold ${
                    balance < 0 ? "text-warning" : "text-foreground"
                  }`}
                >
                  {formatCurrency(Math.abs(balance))}
                </p>
              </div>
            </div>

            <h2 className="mb-2 text-lg font-medium text-foreground">Monthly Breakdown</h2>
            <div className="mb-6">
              <WorkerMonthlyBreakdownTable rows={breakdown ?? []} />
            </div>
          </>
        ) : (
          <p className="mb-6 rounded-lg bg-background px-3 py-2 text-sm text-muted">
            Set a monthly salary to track the balance
          </p>
        )}

        <h2 className="mb-2 text-lg font-medium text-foreground">Payments</h2>
        <WorkerPaymentHistoryTable rows={paymentRows} workerId={workerId} />
      </PrintLayout>
    </div>
  );
}
