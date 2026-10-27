"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { deleteFailure, type DeletePinCode } from "@/lib/delete-pin";
import type { Json } from "@/lib/types/database.types";
import { normalizeShelf, type Shelf } from "@/lib/till/shelf";
import type { CustomerOption } from "@/components/billing/bill-types";
import { plainBillError } from "@/lib/billing-errors";
import { getCurrentProfile } from "@/lib/auth/session";
import { createItem, createCategory } from "@/app/(app)/items/actions";

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
  if (error) return { error: plainBillError(error.message) };

  const result = data as RpcStatus | null;
  if (result?.code === "insufficient_stock") return { shortages: result.shortages ?? [] };
  if (!result?.ok || !result.invoice_id || !result.invoice_no) {
    return { error: "Could not save the bill." };
  }

  // After the answer has gone out: a revalidatePath inside the action makes Next render the
  // page the cashier is on (the whole till shelf) into the response and wait for it, which
  // delays the "saved" answer for nothing: the till moves on to the print view at once.
  const savedId = result.invoice_id;
  after(() => revalidateBilling(savedId));
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
  if (error) return { error: plainBillError(error.message) };

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

// The customer list for the till (same narrow id/code/name read as the page): used when the
// till opens from memory and has no list yet.
export async function loadTillCustomers(): Promise<CustomerOption[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_customers_basic");
  if (error) return null;
  return (data ?? []).map((c) => ({ id: c.id, code: c.code, name: c.name }));
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

export interface TillItemInput {
  name: string;
  category_id: string | null;
  base_unit: string;
  batch_tracked: boolean;
  /** Optional selling price per base unit. */
  sale_price: number | null;
}

// "+ Add item" on the till. Owner only: checked here, and the database refuses a
// Store Keeper's insert as well (items_insert policy). No purchase cost and no
// stock are created; the price goes through the one price function (history row).
export async function addTillItem(input: TillItemInput) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "owner") return { error: "Only the Owner can add items." };
  const result = await createItem(
    {
      name: input.name,
      category_id: input.category_id,
      base_unit: input.base_unit,
      reorder_level: 0,
      batch_tracked: input.batch_tracked,
      sale_price: input.sale_price,
      units: [],
    },
    "item form"
  );
  if ("error" in result && result.error) return { error: result.error };
  revalidatePath("/items/prices");
  return result;
}

// A category added from the till's "+ Add item" popup. Owner only (RLS agrees).
export async function addTillCategory(name: string) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "owner") return { error: "Only the Owner can add categories." };
  return createCategory(name);
}
