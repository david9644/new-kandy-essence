import { notFound } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { TillScreen } from "@/components/till/till-screen";
import { loadBillCustomers, loadBillShelf, todayIso } from "@/lib/billing-data";
import type { ShelfItem } from "@/lib/till/shelf";

// Owner only. The same till screen, pre-filled; saving asks for the Delete PIN.
export default async function EditBillPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  await requireOwner();
  const supabase = await createClient();

  const [{ data: invoice }, { data: lines }, { data: payments }, shelf, customers] =
    await Promise.all([
      supabase
        .from("invoices")
        .select(
          "id, invoice_no, date, customer_id, customer_name, customer_code, bill_discount, notes, cash_received"
        )
        .eq("id", invoiceId)
        .maybeSingle(),
      supabase
        .from("invoice_items")
        .select("item_id, unit_name, quantity, base_quantity, unit_price, line_discount, line_no")
        .eq("invoice_id", invoiceId)
        .order("line_no"),
      supabase
        .from("invoice_payments")
        .select("method, amount, cheque_number, cheque_bank, cheque_date, reference")
        .eq("invoice_id", invoiceId)
        .order("created_at"),
      loadBillShelf(supabase),
      loadBillCustomers(supabase),
    ]);

  // Deleted bills are invisible to the API (RLS), so this is also "not found".
  if (!invoice) notFound();

  // Stock this bill currently holds is restored before the new lines are
  // applied, so the screen counts it as available.
  const heldBase: Record<string, number> = {};
  for (const l of lines ?? []) {
    heldBase[l.item_id] = (heldBase[l.item_id] ?? 0) + l.base_quantity;
  }

  // An item on the bill may have been deactivated since: the shelf only lists
  // active items, so fetch those few by id so the lines keep their names.
  const onShelf = new Set((shelf?.items ?? []).map((i) => i.id));
  const missingIds = [...new Set((lines ?? []).map((l) => l.item_id))].filter((id) => !onShelf.has(id));
  let extraItems: ShelfItem[] = [];
  if (missingIds.length > 0) {
    const { data: missing } = await supabase
      .from("items")
      .select("id, code, name, base_unit, category_id, item_units(unit_name, conversion_factor_to_base)")
      .in("id", missingIds);
    extraItems = (missing ?? []).map((i) => ({
      id: i.id,
      code: i.code,
      name: i.name,
      category_id: i.category_id,
      base_unit: i.base_unit,
      stock: 0,
      sold_90d: 0,
      units: [
        { unit_name: i.base_unit, factor: 1, price: null },
        ...i.item_units.map((u) => ({
          unit_name: u.unit_name,
          factor: u.conversion_factor_to_base,
          price: null,
        })),
      ],
    }));
  }

  const customer =
    invoice.customer_id && invoice.customer_name
      ? { id: invoice.customer_id, code: invoice.customer_code ?? "", name: invoice.customer_name }
      : null;

  return (
    <TillScreen
      mode="edit"
      initialShelf={shelf}
      extraItems={extraItems}
      customers={customers}
      isOwner
      today={todayIso()}
      heldBase={heldBase}
      initial={{
        invoiceId: invoice.id,
        invoiceNo: invoice.invoice_no,
        date: invoice.date,
        customer,
        billDiscount: invoice.bill_discount,
        notes: invoice.notes ?? "",
        cashReceived: invoice.cash_received,
        lines: (lines ?? []).map((l) => ({
          itemId: l.item_id,
          unitName: l.unit_name,
          quantity: l.quantity,
          unitPrice: l.unit_price,
          discount: l.line_discount,
        })),
        payments: payments ?? [],
      }}
    />
  );
}
