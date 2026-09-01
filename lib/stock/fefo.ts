export interface FefoBatch {
  id: string;
  batch_number: string | null;
  expiry_date: string | null;
  quantity_remaining: number;
  created_at: string;
}

// First-Expired-First-Out: earliest expiry first, nulls (non-expiring/non-batch-
// tracked) last, then oldest-received first. One definition shared by every
// screen that suggests or lists batches, so the suggestion the user sees is
// never subtly different from what the database itself would return.
export function sortBatchesFefo<T extends FefoBatch>(batches: T[]): T[] {
  return [...batches].sort((a, b) => {
    if (a.expiry_date && b.expiry_date) return a.expiry_date.localeCompare(b.expiry_date);
    if (a.expiry_date) return -1;
    if (b.expiry_date) return 1;
    return a.created_at.localeCompare(b.created_at);
  });
}

export function suggestBatch<T extends FefoBatch>(batches: T[]): T | null {
  const withStock = sortBatchesFefo(batches).filter((b) => b.quantity_remaining > 0);
  return withStock[0] ?? sortBatchesFefo(batches)[0] ?? null;
}
