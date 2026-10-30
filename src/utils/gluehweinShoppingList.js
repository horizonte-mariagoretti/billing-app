// Glühwein Einkaufsliste: pure helper (no DB).
//
// Every active product with planned_qty > 0 is expanded through its recipe
// (ingredient need += planned_qty × qty_per_unit); a product without recipe rows is bought itself (need += planned_qty,
// e.g. beers). An active ingredient adds its extra_qty (Zusatzbedarf). Stock on hand (ingredients only) is subtracted
// (floor 0), the rest is rounded up to whole packs. Ingredients: buy_price is per unit, so a pack costs
// pack_size × buy_price. Products without recipe are bought per buying unit (buy_unit, e.g. Kasten) holding pack_size
// selling units; a pack costs buy_pack_price (fallback for legacy rows: pack_size × buy_price).

const round2 = (n) => Math.round(n * 100) / 100;
// Trims float noise (0.1 × 3) so Math.ceil does not add a pack.
const round6 = (n) => Math.round(n * 1e6) / 1e6;
const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const termsOf = (terms, id) => (terms instanceof Map ? terms.get(id) : terms?.[id]) || {};
const isActive = (row) => row?.active === undefined || row?.active === null || !!Number(row.active);

/**
 * products: gw_items rows ({ id, name, unit, active? }); ingredients: gw_ingredients rows (same shape).
 * productTerms: Map/object product id -> { planned_qty, buy_unit, buy_pack_price, pack_size (content), buy_price (legacy) }
 *   of this year.
 * ingredientTerms: Map/object ingredient id -> { buy_price, pack_type, pack_size, extra_qty, stock_qty } of this year.
 * recipe: [{ product_id, ingredient_id, qty_per_unit }].
 * Returns { rows, total }. rows: [{ key, id, source: 'ingredient'|'product', name, unit, packType, packSize,
 *   packLabel (products: buy_unit or null), need, stock, toBuy, packs, packPrice, cost }] — ingredients first, each group in input order; only rows with need > 0.
 */
export function buildShoppingList({ products, ingredients, productTerms, ingredientTerms, recipe }) {
  const prodList = products || [];
  const ingList = ingredients || [];
  const ingById = new Map(ingList.map((g) => [g.id, g]));
  const recipeOf = new Map();
  for (const r of recipe || []) {
    if (!recipeOf.has(r.product_id)) recipeOf.set(r.product_id, []);
    recipeOf.get(r.product_id).push(r);
  }

  const ingNeed = new Map();
  const addIng = (id, qty) => {
    if (!ingById.has(id) || !(qty > 0)) return;
    ingNeed.set(id, (ingNeed.get(id) || 0) + qty);
  };
  const prodNeed = new Map();
  for (const p of prodList) {
    if (!isActive(p)) continue;
    const planned = num(termsOf(productTerms, p.id).planned_qty);
    if (!(planned > 0)) continue;
    const rows = recipeOf.get(p.id);
    if (rows && rows.length) rows.forEach((r) => addIng(r.ingredient_id, planned * num(r.qty_per_unit)));
    else prodNeed.set(p.id, planned);
  }
  for (const g of ingList) {
    if (isActive(g)) addIng(g.id, num(termsOf(ingredientTerms, g.id).extra_qty));
  }

  const row = (source, it, t, need, stock) => {
    const size = num(t.pack_size) > 0 ? num(t.pack_size) : 1;
    const n = round6(need);
    const toBuy = Math.max(0, round6(n - stock));
    const packs = Math.ceil(round6(toBuy / size));
    const hasPackPrice = source === 'product' && t.buy_pack_price != null && t.buy_pack_price !== '';
    const packPrice = round2(hasPackPrice ? num(t.buy_pack_price) : size * num(t.buy_price));
    return {
      key: `${source}:${it.id}`,
      id: it.id,
      source,
      name: it.name || '',
      unit: it.unit || 'Stk',
      packType: t.pack_type || 'none',
      packSize: size,
      packLabel: source === 'product' ? (String(t.buy_unit ?? '').trim() || null) : null,
      need: n,
      stock,
      toBuy,
      packs,
      packPrice,
      cost: round2(hasPackPrice ? packs * num(t.buy_pack_price) : packs * size * num(t.buy_price)),
    };
  };

  const rows = [
    ...ingList.filter((g) => ingNeed.has(g.id)).map((g) => {
      const t = termsOf(ingredientTerms, g.id);
      return row('ingredient', g, t, ingNeed.get(g.id), Math.max(0, num(t.stock_qty)));
    }),
    ...prodList.filter((p) => prodNeed.has(p.id)).map((p) => (
      row('product', p, termsOf(productTerms, p.id), prodNeed.get(p.id), 0)
    )),
  ];
  return { rows, total: round2(rows.reduce((s, r) => s + r.cost, 0)) };
}
