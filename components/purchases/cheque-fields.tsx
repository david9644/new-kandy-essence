"use client";

import type { ChequeInput } from "@/app/(app)/purchases/actions";
import { KeyboardTextInput } from "@/components/keyboard/keyboard-text-input";
import { KeyboardNumberInput } from "@/components/keyboard/keyboard-number-input";

export interface BankAccountOption {
  id: string;
  name: string;
}

export function ChequeFields({
  bankAccounts,
  value,
  onChange,
}: {
  bankAccounts: BankAccountOption[];
  value: ChequeInput;
  onChange: (next: ChequeInput) => void;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Bank Account</label>
        <select
          value={value.bank_account_id}
          onChange={(e) => onChange({ ...value, bank_account_id: e.target.value })}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
        >
          <option value="">Select account</option>
          {bankAccounts.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Cheque Number</label>
          <KeyboardTextInput
            value={value.cheque_number}
            onChange={(v) => onChange({ ...value, cheque_number: v })}
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
        <KeyboardNumberInput
          value={value.amount ? String(value.amount) : ""}
          onChange={(v) => onChange({ ...value, amount: v === "" ? 0 : Number(v) })}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm tabular-nums text-foreground focus:border-primary focus:outline-none"
        />
      </div>
    </div>
  );
}
