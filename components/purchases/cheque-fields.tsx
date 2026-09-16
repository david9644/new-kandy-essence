"use client";

import { useEffect, useState } from "react";
import type { ChequeInput } from "@/app/(app)/purchases/actions";
import { formatCurrency } from "@/lib/units";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";
import { QuickAddBankModal } from "@/components/settings/quick-add-bank-modal";
import { createClient } from "@/lib/supabase/client";

export interface BankAccountOption {
  id: string;
  name: string;
}

export function ChequeFields({
  bankAccounts,
  value,
  onChange,
  amount,
}: {
  bankAccounts: BankAccountOption[];
  value: ChequeInput;
  onChange: (next: ChequeInput) => void;
  /** The purchase total or payment amount -- the cheque amount always
   * equals this, so it's never a separately-typed field that could drift
   * from it. */
  amount: number;
}) {
  const [accounts, setAccounts] = useState(bankAccounts);
  const [quickAddBank, setQuickAddBank] = useState(false);
  const [dailyLimit, setDailyLimit] = useState(0);
  const [existingTotal, setExistingTotal] = useState(0);

  useEffect(() => {
    onChange({ ...value, amount });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

  // Daily Cheque Limit setting -- loaded once; 0 means no limit is set, in
  // which case the warning below never renders.
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("app_settings")
      .select("daily_cheque_limit")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => setDailyLimit(data?.daily_cheque_limit ?? 0));
  }, []);

  // Re-fetches the running total for whatever date is currently selected.
  // Cash-flow-safety warning only -- this intentionally doesn't exclude the
  // cheque being edited (if any) from that date's total, so editing an
  // existing cheque without changing its date/amount can show a harmless
  // false-positive warning; it never blocks saving either way.
  useEffect(() => {
    if (!value.cheque_date) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .rpc("get_cheques_total_for_date", { p_date: value.cheque_date })
      .then(({ data }) => {
        if (!cancelled) setExistingTotal(data ?? 0);
      });
    return () => {
      cancelled = true;
    };
  }, [value.cheque_date]);

  const projectedTotal = existingTotal + amount;
  const overDailyLimit = Boolean(value.cheque_date) && dailyLimit > 0 && projectedTotal > dailyLimit;

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Bank Account</label>
        <div className="flex gap-2">
          <select
            value={value.bank_account_id}
            onChange={(e) => onChange({ ...value, bank_account_id: e.target.value })}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            <option value="">Select account</option>
            {accounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setQuickAddBank(true)}
            className="flex h-11 shrink-0 items-center whitespace-nowrap rounded-lg border border-border px-3 text-sm font-medium text-foreground active:bg-background"
          >
            + Add new bank
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Cheque Number</label>
          <KeyboardNumberInput
            value={value.cheque_number}
            onChange={(v) => onChange({ ...value, cheque_number: v })}
            allowDecimal={false}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Cheque Date</label>
          <input
            type="date"
            value={value.cheque_date}
            onChange={(e) => onChange({ ...value, cheque_date: e.target.value })}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Cheque Amount</label>
        <div className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-right text-sm tabular-nums text-muted">
          {formatCurrency(amount)}
        </div>
      </div>
      {overDailyLimit && (
        <p className="rounded-lg bg-warning-surface px-3 py-2 text-sm text-warning">
          Cheques dated {value.cheque_date} would total {formatCurrency(projectedTotal)} — over
          your {formatCurrency(dailyLimit)} daily limit.
        </p>
      )}
      {quickAddBank && (
        <QuickAddBankModal
          onClose={() => setQuickAddBank(false)}
          onCreated={(bank) => {
            setAccounts((prev) => [...prev, bank]);
            onChange({ ...value, bank_account_id: bank.id });
            setQuickAddBank(false);
          }}
        />
      )}
    </div>
  );
}
