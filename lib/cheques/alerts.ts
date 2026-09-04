import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";
import { CHEQUE_DUE_DAYS, BUSINESS_TIMEZONE } from "@/lib/constants";

type Client = SupabaseClient<Database>;

export interface ChequeDueRow {
  id: string;
  cheque_number: string;
  cheque_date: string;
  amount: number;
  supplier_id: string;
  supplier_name: string;
  bank_name: string;
  overdue: boolean;
  days_until: number;
}

export async function getChequesDueSoon(supabase: Client): Promise<ChequeDueRow[]> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: BUSINESS_TIMEZONE });
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + CHEQUE_DUE_DAYS);
  const cutoffIso = cutoff.toLocaleDateString("en-CA");

  // A single "cheque_date <= cutoff" filter already covers every overdue
  // pending cheque too, since cutoff is always >= today -- no separate
  // clause is needed to keep overdue cheques from dropping off the list.
  const { data } = await supabase
    .from("cheques")
    .select(
      "id, cheque_number, cheque_date, amount, supplier_id, suppliers(name), bank_accounts(name)"
    )
    .eq("status", "pending")
    .lte("cheque_date", cutoffIso)
    .order("cheque_date", { ascending: true });

  const todayMs = new Date(today).getTime();

  return (data ?? []).map((c) => {
    const supplier = c.suppliers as { name: string } | null;
    const bank = c.bank_accounts as { name: string } | null;
    return {
      id: c.id,
      cheque_number: c.cheque_number,
      cheque_date: c.cheque_date,
      amount: c.amount,
      supplier_id: c.supplier_id,
      supplier_name: supplier?.name ?? "-",
      bank_name: bank?.name ?? "-",
      overdue: c.cheque_date < today,
      days_until: Math.round((new Date(c.cheque_date).getTime() - todayMs) / 86_400_000),
    };
  });
}
