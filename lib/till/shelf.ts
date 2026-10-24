// The shelf: everything the till screen needs to show tiles, held in memory.
// Pure functions only -- category filter, search, suggestions, colours.

export interface ShelfUnit {
  unit_name: string;
  factor: number;
  /** Price for ONE of this unit: the item's own selling price x the unit's size.
   * null = the item has no selling price yet ("Set price"). Never a price from a
   * previous bill. */
  price: number | null;
}

export interface ShelfItem {
  id: string;
  code: string;
  name: string;
  category_id: string | null;
  base_unit: string;
  /** Base units on hand. */
  stock: number;
  /** Non-deleted bill lines for this item in the last 90 days (the server also
   * returns the shelf most-sold first). */
  sold_90d: number;
  units: ShelfUnit[];
  /** Set only on an item added from the till in this session (it has no stock
   * yet): its tile says "No stock" instead of looking sold out. */
  fresh?: boolean;
}

export interface ShelfCategory {
  id: string;
  name: string;
}

export interface Shelf {
  categories: ShelfCategory[];
  items: ShelfItem[];
}

export const ALL_CATEGORY = "__all__";
export const OTHER_CATEGORY = "__other__";

/** Coerces the get_billing_shelf() JSON (numeric columns can arrive as strings). */
export function normalizeShelf(raw: unknown): Shelf {
  const r = (raw ?? {}) as { categories?: ShelfCategory[]; items?: Array<Record<string, unknown>> };
  return {
    categories: (r.categories ?? []).map((c) => ({ id: c.id, name: c.name })),
    items: (r.items ?? []).map((i) => ({
      id: String(i.id),
      code: String(i.code),
      name: String(i.name),
      category_id: (i.category_id as string | null) ?? null,
      base_unit: String(i.base_unit),
      stock: Number(i.stock ?? 0),
      sold_90d: Number(i.sold_90d ?? 0),
      units: ((i.units as Array<Record<string, unknown>> | null) ?? []).map((u) => ({
        unit_name: String(u.unit_name),
        factor: Number(u.factor),
        price: u.price === null || u.price === undefined ? null : Number(u.price),
      })),
    })),
  };
}

// ── category colours ────────────────────────────────────────────────────

/** Accessible hues (degrees); the tint itself is a soft mix, see the tile styles. */
export const CATEGORY_HUES = [205, 160, 35, 345, 265, 175, 95, 20, 300, 230, 55, 125];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable per category id: the same category is always the same colour. */
export function categoryHue(categoryId: string | null): number | null {
  if (!categoryId) return null;
  return CATEGORY_HUES[hash(categoryId) % CATEGORY_HUES.length];
}

// ── filtering ───────────────────────────────────────────────────────────

export function filterByCategory(items: ShelfItem[], categoryId: string): ShelfItem[] {
  if (categoryId === ALL_CATEGORY) return items;
  if (categoryId === OTHER_CATEGORY) return items.filter((i) => i.category_id === null);
  return items.filter((i) => i.category_id === categoryId);
}

/** The shelf with names/codes lower-cased ONCE, so a keystroke never lower-cases
 * thousands of strings. `pos` is the item's place in the (most-sold first)
 * shelf order, used as the tie-break so popular items stay on top. */
export interface IndexedItem {
  item: ShelfItem;
  name: string;
  code: string;
  words: string[];
  pos: number;
}

export function indexItems(items: ShelfItem[]): IndexedItem[] {
  return items.map((item, pos) => {
    const name = item.name.toLowerCase();
    return { item, name, code: item.code.toLowerCase(), words: name.split(/\s+/), pos };
  });
}

function rank(x: IndexedItem, q: string): number {
  if (x.code === q) return 0;
  if (x.name.startsWith(q)) return 1;
  for (const w of x.words) if (w.startsWith(q)) return 2;
  if (x.name.includes(q) || x.code.includes(q)) return 3;
  return -1;
}

/** Name / code search over the indexed shelf: best matches first, then the
 * shelf's own order (most sold first). */
export function searchIndexed(index: IndexedItem[], query: string, limit = 200): ShelfItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: { x: IndexedItem; r: number }[] = [];
  for (const x of index) {
    const r = rank(x, q);
    if (r >= 0) hits.push({ x, r });
  }
  hits.sort((a, b) => a.r - b.r || a.x.pos - b.x.pos);
  return hits.slice(0, limit).map((h) => h.x.item);
}

/** Suggestions as the cashier types: from two characters, a handful. */
export function suggestionsIndexed(index: IndexedItem[], query: string, limit = 8): ShelfItem[] {
  if (query.trim().length < 2) return [];
  return searchIndexed(index, query, limit);
}

/** Enter in the search box: only an EXACT item code counts as a scan. */
export function exactCodeIndexed(index: IndexedItem[], text: string): ShelfItem | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  return index.find((x) => x.code === t)?.item ?? null;
}

// Convenience wrappers on a plain item list (tests, one-off use).
export function searchItems(items: ShelfItem[], query: string, limit = 200): ShelfItem[] {
  return searchIndexed(indexItems(items), query, limit);
}
export function suggestionsFor(items: ShelfItem[], query: string, limit = 8): ShelfItem[] {
  return suggestionsIndexed(indexItems(items), query, limit);
}
export function exactCodeMatch(items: ShelfItem[], text: string): ShelfItem | null {
  return exactCodeIndexed(indexItems(items), text);
}

// ── paging ──────────────────────────────────────────────────────────────

/** Tiles drawn at once; "Show more" adds another page. */
export const TILE_PAGE_SIZE = 60;

export function pageOf<T>(list: T[], shown: number): { visible: T[]; remaining: number } {
  const n = Math.max(0, Math.min(list.length, shown));
  return { visible: list.slice(0, n), remaining: list.length - n };
}

export function firstPrice(item: ShelfItem): number | null {
  return item.units.find((u) => u.price !== null)?.price ?? null;
}

export function hasMissingPrice(item: ShelfItem): boolean {
  return item.units.some((u) => u.price === null);
}
