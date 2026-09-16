import Link from "next/link";
import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { WorkersTable, type LastPaid } from "@/components/workers/workers-table";

export default async function WorkersPage() {
  await requireOwner();
  const supabase = await createClient();

  const [{ data: workers }, { data: payments }] = await Promise.all([
    supabase.from("workers").select("id, code, name, position").order("name"),
    supabase
      .from("salary_payments")
      .select("worker_id, date, period, created_at")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const lastPaidByWorker = new Map<string, LastPaid>();
  for (const p of payments ?? []) {
    if (!lastPaidByWorker.has(p.worker_id)) {
      lastPaidByWorker.set(p.worker_id, { date: p.date, period: p.period });
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Workers</h1>
        <Link
          href="/workers/new"
          className="flex h-11 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground active:opacity-90"
        >
          + New Worker
        </Link>
      </div>
      <WorkersTable workers={workers ?? []} lastPaidByWorker={lastPaidByWorker} />
    </div>
  );
}
