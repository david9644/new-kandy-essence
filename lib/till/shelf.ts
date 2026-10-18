// The shelf: everything the till screen needs to show tiles, held in memory.
// Pure functions only -- category filter, search, suggestions, colours.

export interface ShelfUnit {
  unit_name: string;
  factor: number;
  /** Effective price for ONE of this unit, null = "Set price". */
  price: number | null;
  source: "default" | "last" | null;
}

export interface ShelfItem {
  id: string;
  code: string;
  name: string;
  category_id: string | null;
  base_unit: string;
  /** Base units on hand. */
  stock: number;
  units: ShelfUnit[];
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
      units: ((i.units as Array<Record<string, unknown>> | null) ?? []).map((u) => ({
        unit_name: String(u.unit_name),
        factor: Number(u.factor),
        price: u.price === null || u.price === undefined ? null : Number(u.price),
        source: (u.source as ShelfUnit["source"]) ?? null,
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

function rank(item: ShelfItem, q: string): number {
  const name = item.name.toLowerCase();
  const code = item.code.toLowerCase();
  if (code === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.split(/\s+/).some((w) => w.startsWith(q))) return 2;
  if (name.includes(q) || code.includes(q)) return 3;
  return -1;
}

/** Name / code search over the held shelf, best matches first. */
export function searchItems(items: ShelfItem[], query: string, limit = 200): ShelfItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return items
    .map((item) => ({ item, r: rank(item, q) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map((x) => x.item);
}

/** Suggestions as the cashier types: from two characters, a handful. */
export function suggestionsFor(items: ShelfItem[], query: string, limit = 8): ShelfItem[] {
  if (query.trim().length < 2) return [];
  return searchItems(items, query, limit);
}

/** Enter in the search box: only an EXACT item code counts as a scan. */
export function exactCodeMatch(items: ShelfItem[], text: string): ShelfItem | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  return items.find((i) => i.code.toLowerCase() === t) ?? null;
}

export function firstPrice(item: ShelfItem): number | null {
  return item.units.find((u) => u.price !== null)?.price ?? null;
}

export function hasMissingPrice(item: ShelfItem): boolean {
  return item.units.some((u) => u.price === null);
}
