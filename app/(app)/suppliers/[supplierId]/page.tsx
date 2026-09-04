import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/units";
import { ActiveToggleButton } from "@/components/items/active-toggle-button";
import { EditSupplierModalButton } from "@/components/suppliers/edit-supplier-modal-button";
import { AddPaymentModalButton } from "@/components/payments/add-payment-modal-button";
import { LedgerTable, type LedgerRow, type PaymentDetail } from "@/components/suppliers/ledger-table";
import { updateSupplier, setSupplierActive } from "@/app/(app)/suppliers/actions";

function monthStartIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("en-CA");
}

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
}

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { supplierId } = await params;
  const { from, to } = await searchParams;
  const fromDate = from || monthStartIso();
  const toDate = to || todayIso();

  const profile = await requireProfile();
  const supabase = await createClient();
  const isOwner = profile.role === "owner";

  const [{ data: supplier }, { data: financials }] = await Promise.all([
    supabase.from("suppliers").select("*").eq("id", supplierId).maybeSingle(),
    supabase
      .from("supplier_financials")
      .select("opening_balance")
      .eq("supplier_id", supplierId)
      .maybeSingle(),
  ]);

  if (!supplier) notFound();

  let balance = 0;
  let ledgerRows: LedgerRow[] = [];
  let bankAccounts: { id: string; name: string }[] = [];

  if (isOwner) {
    const [{ data: balanceData }, { data: ledger }, { data: payments }, { data: bankAccountsData }] =
      await Promise.all([
        supabase.rpc("get_supplier_balance", { p_supplier_id: supplierId }),
        supabase.rpc("get_supplier_ledger", { p_supplier_id: supplierId, p_from: fromDate, p_to: toDate }),
        supabase
          .from("supplier_payments")
          .select(
            "id, payment_type, notes, cheques(bank_account_id, cheque_number, cheque_date, amount, status)"
          )
          .eq("supplier_id", supplierId)
          .gte("date", fromDate)
          .lte("date", toDate),
        supabase.from("bank_accounts").select("id, name").eq("active", true).order("name"),
      ]);

    balance = balanceData ?? 0;
    bankAccounts = bankAccountsData ?? [];

    const paymentDetailById = new Map<string, PaymentDetail>(
      (payments ?? []).map((p) => {
        const cheque = p.cheques as PaymentDetail["cheque"];
        return [
          p.id,
          { payment_type: p.payment_type, notes: p.notes ?? "", cheque },
        ];
      })
    );

    ledgerRows = (ledger ?? []).map((row) => ({
      ...row,
      paymentDetail:
        row.entry_type === "payment" ? paymentDetailById.get(row.entry_id) : undefined,
    }));
  }

  const boundUpdate = updateSupplier.bind(null, supplierId);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{supplier.name}</h1>
          <p className="text-sm text-muted">{supplier.code}</p>
        </div>
        {isOwner && (
          <div className="flex flex-wrap justify-end gap-2">
            <EditSupplierModalButton
              initial={{
                name: supplier.name,
                contact: supplier.contact ?? "",
                address: supplier.address ?? "",
                opening_balance: financials?.opening_balance ?? 0,
              }}
              onSubmit={boundUpdate}
            />
            <AddPaymentModalButton
              supplier={{ id: supplier.id, code: supplier.code, name: supplier.name }}
              bankAccounts={bankAccounts}
            />
            <ActiveToggleButton
              active={supplier.active}
              onToggle={setSupplierActive.bind(null, supplierId, !supplier.active)}
            />
          </div>
        )}
      </div>

      {isOwner ? (
        <>
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

          <LedgerTable rows={ledgerRows} bankAccounts={bankAccounts} supplierId={supplierId} />
        </>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border border-border bg-surface p-4 text-sm">
          <dt className="text-muted">Contact</dt>
          <dd className="text-foreground">{supplier.contact ?? "-"}</dd>
          <dt className="text-muted">Address</dt>
          <dd className="text-foreground">{supplier.address ?? "-"}</dd>
        </dl>
      )}
    </div>
  );
}
