// The API returns at most 1,000 rows per request (the project's max rows
// setting), so a plain select of "all items" silently drops everything past
// the 1,000th once the shop has more items than that. This reads a list in
// pages of 1,000 until a short page. The query MUST have a stable order that
// ends in a unique column (e.g. .order("name").order("id")), or rows could be
// skipped / repeated between pages.
export const API_PAGE_SIZE = 1000;

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += API_PAGE_SIZE) {
    const { data } = await page(from, from + API_PAGE_SIZE - 1);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < API_PAGE_SIZE) break;
  }
  return out;
}
