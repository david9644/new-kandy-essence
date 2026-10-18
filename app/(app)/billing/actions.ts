"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteFailure, type DeletePinCode } from "@/lib/delete-pin";
import type { Json } from "@/lib/types/database.types";
import { normalizeShelf, type Shelf } from "@/lib/till/shelf";

export interface BillLineInput {
  item_id: string;
  unit_name: string;
  quantity: number;
  unit_price: number;
  line_discount: number;
}

export interface BillPaymentInput {
  method: "cash" | "cheque" | "bank_transfer";
  amount: number;
  cheque_number?: string;
  cheque_bank?: string;
  cheque_date?: string;
  reference?: string;
}

export interface BillInput {
  date: string;
  customer_id: string | null;
  bill_discount: number;
  notes: string;
  lines: BillLineInput[];
  payments: BillPaymentInput[];
  /** The total the screen showed. The server recomputes everything from the
   * lines and rejects the bill if this does not match to the cent. */
  expected_total: number;
  confirm_shortage: boolean;
  /** Cash the customer handed over (optional). Must cover the cash payment;
   * the change is worked out from it when printing. */
  cash_received: number | null;
}

export interface StockShortage {
  item_id: string;
  item_name: string;
  base_unit: string;
  available: number;
  requested: number;
}

export type SaveBillResult =
  | { ok: true; invoiceId: string; invoiceNo: string }
  | { shortages: StockShortage[] }
  | { error: string; code?: DeletePinCode };

interface RpcStatus {
  ok?: boolean;
  code?: string;
  shortages?: StockShortage[];
  invoice_id?: string;
  invoice_no?: string;
}

function revalidateBilling(invoiceId?: string) {
  revalidatePath("/billing");
  if (invoiceId) revalidatePath(`/billing/${invoiceId}`);
  revalidatePath("/stock");
  revalidatePath("/stock/out");
  revalidatePath("/dashboard");
  // customer ledgers / balances change when a bill has a registered customer
  revalidatePath("/customers", "layout");
}

function rpcArgs(input: BillInput) {
  return {
    p_date: input.date,
    p_customer_id: input.customer_id,
    p_bill_discount: input.bill_discount,
    p_notes: input.notes.trim() || null,
    p_lines: input.lines as unknown as Json,
    p_payments: input.payments as unknown as Json,
    p_expected_total: input.expected_total,
    p_confirm_shortage: input.confirm_shortage,
    p_cash_received: input.cash_received,
  };
}

// Owner or Store Keeper. Totals, stock and the customer ledger are all
// decided inside create_invoice (one transaction); clientKey makes a
// double-tapped Save harmless.
export async function createInvoice(input: BillInput, clientKey: string): Promise<SaveBillResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invoice", {
    ...rpcArgs(input),
    p_client_key: clientKey,
  });
  if (error) return { error: error.message };

  const result = data as RpcStatus | null;
  if (result?.code === "insufficient_stock") return { shortages: result.shortages ?? [] };
  if (!result?.ok || !result.invoice_id || !result.invoice_no) {
    return { error: "Could not save the bill." };
  }

  revalidateBilling(result.invoice_id);
  return { ok: true, invoiceId: result.invoice_id, invoiceNo: result.invoice_no };
}

// Owner only, Delete PIN required. Same validations as create; the server
// swaps the old lines / stock / ledger rows for the new ones atomically.
export async function updateInvoice(
  invoiceId: string,
  input: BillInput,
  deletePin: string,
  editKey?: string
): Promise<SaveBillResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_invoice", {
    ...rpcArgs(input),
    p_invoice_id: invoiceId,
    p_delete_pin: deletePin,
    p_edit_key: editKey ?? null,
  });
  if (error) return { error: error.message };

  const result = data as RpcStatus | null;
  if (result?.code === "insufficient_stock") return { shortages: result.shortages ?? [] };
  if (!result?.ok) {
    const failure = deleteFailure(data, null);
    return failure ?? { error: "Could not save the bill." };
  }

  revalidateBilling(invoiceId);
  return { ok: true, invoiceId, invoiceNo: result.invoice_no ?? "" };
}

// The whole shelf for the till screen in one read: categories, active items,
// units with effective prices, stock on hand. No cost data (see 0029).
export async function loadShelf(): Promise<Shelf | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_billing_shelf");
  if (error || !data) return null;
  return normalizeShelf(data);
}

// "Delete bill": soft delete, Owner + Delete PIN. Stock is restored and the
// linked customer-ledger entries are removed; the row itself stays hidden.
export async function cancelInvoice(invoiceId: string, deletePin: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_invoice", {
    p_invoice_id: invoiceId,
    p_delete_pin: deletePin,
  });
  const failure = deleteFailure(data, error);
  if (failure) return failure;

  revalidateBilling(invoiceId);
  redirect("/billing");
}

// Auto-fill fallback: what this item was last billed at in this unit.
export async function getLastSalePrice(itemId: string, unitName: string): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_item_last_sale_price", {
    p_item_id: itemId,
    p_unit_name: unitName,
  });
  if (error) return null;
  return data ?? null;
}

export async function quickAddCustomer(name: string, contact: string) {
  if (!name.trim()) return { error: "Name is required." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quick_add_customer", {
    p_name: name,
    p_contact: contact.trim() || null,
  });
  if (error) return { error: error.message };

  const customer = data as { id: string; code: string; name: string } | null;
  if (!customer) return { error: "Could not add the customer." };

  revalidatePath("/customers");
  return { ok: true as const, customer };
}

// Called by the print view after the browser print dialog closes. Bumps the
// bill's print counter (a later print is labelled COPY).
export async function recordInvoicePrint(invoiceId: string): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_invoice_print", { p_invoice_id: invoiceId });
  if (error) return null;
  return (data as { print_count?: number } | null)?.print_count ?? null;
}
