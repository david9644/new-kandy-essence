import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/units";
import { CustomerDetailActions } from "@/components/customers/customer-detail-actions";
import { CustomerLedgerTable, type LedgerRow } from "@/components/customers/customer-ledger-table";

function monthStartIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("en-CA");
}

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { customerId } = await params;
  const { from, to } = await searchParams;
  const fromDate = from || monthStartIso();
  const toDate = to || todayIso();

  await requireOwner();
  const supabase = await createClient();

  const [
    { data: customer },
    { data: financials },
    { data: balanceData },
    { data: ledger },
    { data: credits },
    { data: payments },
  ] = await Promise.all([
    supabase.from("customers").select("*").eq("id", customerId).maybeSingle(),
    supabase
      .from("customer_financials")
      .select("opening_balance")
      .eq("customer_id", customerId)
      .maybeSingle(),
    supabase.rpc("get_customer_balance", { p_customer_id: customerId }),
    supabase.rpc("get_customer_ledger", {
      p_customer_id: customerId,
      p_from: fromDate,
      p_to: toDate,
    }),
    supabase
      .from("customer_credits")
      .select("id, notes")
      .eq("customer_id", customerId)
      .gte("date", fromDate)
      .lte("date", toDate),
    supabase
      .from("customer_payments")
      .select("id, notes")
      .eq("customer_id", customerId)
      .gte("date", fromDate)
      .lte("date", toDate),
  ]);

  if (!customer) notFound();

  const notesById = new Map<string, string>([
    ...(credits ?? []).map((c) => [c.id, c.notes ?? ""] as [string, string]),
    ...(payments ?? []).map((p) => [p.id, p.notes ?? ""] as [string, string]),
  ]);

  const ledgerRows: LedgerRow[] = (ledger ?? []).map((row) => ({
    ...row,
    notes: notesById.get(row.entry_id),
  }));

  const balance = balanceData ?? 0;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{customer.name}</h1>
          <p className="text-sm text-muted">{customer.code}</p>
        </div>
        <CustomerDetailActions
          customerId={customer.id}
          customerName={customer.name}
          active={customer.active}
          initial={{
            name: customer.name,
            contact: customer.contact ?? "",
            opening_balance: financials?.opening_balance ?? 0,
          }}
        />
      </div>

      <div className="mb-6 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-muted">Current Outstanding Balance</p>
        <p className="text-3xl font-semibold text-foreground">{formatCurrency(balance)}</p>
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">From</label>
          <input
            type="date"
            name="from"
            defaultValue={fromDate}
            className="h-11 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">To</label>
          <input
            type="date"
            name="to"
            defaultValue={toDate}
            className="h-11 rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Filter
        </button>
      </form>

      <CustomerLedgerTable rows={ledgerRows} customerId={customerId} />
    </div>
  );
}
