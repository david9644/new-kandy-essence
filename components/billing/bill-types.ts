export interface BillItem {
  id: string;
  code: string;
  name: string;
  base_unit: string;
  sale_price: number | null;
  units: { unit_name: string; conversion_factor_to_base: number }[];
  /** Total base-unit quantity on hand across batches. */
  on_hand: number;
}

export interface CustomerOption {
  id: string;
  code: string;
  name: string;
}

export interface BillLine {
  key: string;
  itemId: string;
  unitName: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  /** Once the user types a price, stop auto-filling it on unit changes. */
  priceTouched: boolean;
}

export interface ChequeRow {
  key: string;
  number: string;
  bank: string;
  date: string;
  amount: string;
}

export interface PayState {
  /** false = follow the total (default: paid in full, in cash). */
  touched: boolean;
  cash: string;
  bank: string;
  bankRef: string;
  cheques: ChequeRow[];
}

export interface InitialBill {
  invoiceId: string;
  invoiceNo: string;
  date: string;
  customer: CustomerOption | null;
  billDiscount: number;
  notes: string;
  lines: {
    itemId: string;
    unitName: string;
    quantity: number;
    unitPrice: number;
    discount: number;
  }[];
  payments: {
    method: string;
    amount: number;
    cheque_number: string | null;
    cheque_bank: string | null;
    cheque_date: string | null;
    reference: string | null;
  }[];
}

export function factorOf(item: BillItem | undefined, unitName: string): number {
  if (!item) return 1;
  if (unitName === item.base_unit) return 1;
  return item.units.find((u) => u.unit_name === unitName)?.conversion_factor_to_base ?? 1;
}
