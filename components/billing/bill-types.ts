export interface CustomerOption {
  id: string;
  code: string;
  name: string;
}

export interface InitialBill {
  invoiceId: string;
  invoiceNo: string;
  date: string;
  customer: CustomerOption | null;
  billDiscount: number;
  notes: string;
  /** Cash the customer handed over, when it was recorded. */
  cashReceived: number | null;
  lines: {
    itemId: string;
    unitName: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    /** Normal-price snapshot saved with the line (null on old bills / unpriced items). */
    listUnitPrice: number | null;
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
