// Glühwein Einkaufsliste: pure helper (no DB).
//
// Every product with planned_qty > 0 is expanded through its recipe (ingredient need += planned_qty × qty_per_unit);
// a product without recipe rows is bought itself (need += planned_qty). Needs are grouped per item, then rounded up
// to whole packs. No stock on hand.

const round2 = (n) => Math.round(n * 100) / 100;
// Trims float noise (0.1 × 3) so Math.ceil does not add a pack.
const round6 = (n) => Math.round(n * 1e6) / 1e6;
const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const termsOf = (terms, id) => (terms instanceof Map ? terms.get(id) : terms?.[id]) || {};

/**
 * items: gw_items rows; terms: Map/object item_id -> terms of this year (planned_qty, pack_size, buy_price);
 * recipe: [{ product_id, ingredient_id, qty_per_unit }].
 * Returns { rows: [{ item, need, packs, cost }], total } — rows in the order of items.
 */
export function buildShoppingList({ items, terms, recipe }) {
  const list = items || [];
  const byId = new Map(list.map((it) => [it.id, it]));
  const recipeOf = new Map();
  for (const r of recipe || []) {
    if (!recipeOf.has(r.product_id)) recipeOf.set(r.product_id, []);
    recipeOf.get(r.product_id).push(r);
  }

  const need = new Map();
  const add = (id, qty) => {
    if (!byId.has(id) || !(qty > 0)) return;
    need.set(id, (need.get(id) || 0) + qty);
  };
  for (const it of list) {
    const planned = num(termsOf(terms, it.id).planned_qty);
    if (!(planned > 0)) continue;
    const rows = recipeOf.get(it.id);
    if (rows && rows.length) rows.forEach((r) => add(r.ingredient_id, planned * num(r.qty_per_unit)));
    else add(it.id, planned);
  }

  const rows = list
    .filter((it) => need.has(it.id))
    .map((it) => {
      const t = termsOf(terms, it.id);
      const size = num(t.pack_size) > 0 ? num(t.pack_size) : 1;
      const n = round6(need.get(it.id));
      const packs = Math.ceil(round6(n / size));
      return { item: it, need: n, packs, cost: round2(packs * size * num(t.buy_price)) };
    });
  return { rows, total: round2(rows.reduce((s, r) => s + r.cost, 0)) };
}
