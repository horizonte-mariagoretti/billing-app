// Glühwein Einkaufsliste: pure helper (no DB).
//
// Everything is driven by Einkauf (purchase_qty in buy units, e.g. Kasten or Flasche), never by Übrig (planned_qty).
// Getränke: every active product with Einkauf, in name order. A product with no Einkauf has no row.
//  - With a recipe (use_recipe on, recipe rows): Einkauf × content = sold units; each recipe row needs
//    sold units × qty_per_unit. Its cost is informational (the ingredients are bought in the Zutaten list).
//  - Without recipe: Einkauf is bought itself (packs = Einkauf, cost = packs × pack price).
// Zutaten (the actual purchase list): one row per ingredient, need = sum over all drinks + Zusatzbedarf (extra_qty,
// active ingredients only). Stock on hand is subtracted (floor 0), the rest is rounded up to whole packs.
// Ingredients: buy_price is per unit, so a pack costs pack_size × buy_price.

const round2 = (n) => Math.round(n * 100) / 100;
// Trims float noise (0.1 × 3) so Math.ceil does not add a pack.
const round6 = (n) => Math.round(n * 1e6) / 1e6;
const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const termsOf = (terms, id) => (terms instanceof Map ? terms.get(id) : terms?.[id]) || {};
const isActive = (row) => row?.active === undefined || row?.active === null || !!Number(row.active);
const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'de-DE');

/**
 * products: gw_items rows ({ id, name, unit, active?, use_recipe? }); ingredients: gw_ingredients rows (same shape).
 * productTerms: Map/object product id -> { purchase_qty, pack_size (content), buy_unit, buy_pack_price, buy_price (legacy) }
 *   of this year. pack_size is the sold units per buy unit (liter products: liters per buy unit).
 * ingredientTerms: Map/object ingredient id -> { buy_price, pack_type, pack_size, extra_qty, stock_qty } of this year.
 * recipe: [{ product_id, ingredient_id, qty_per_unit }] (qty per sold unit).
 * Returns { drinks, ingredients, total }.
 *  drinks: { key, id, name, unit, hasRecipe, need (sold units), packs (Einkauf), packLabel (buy_unit or null),
 *    packSize, packPrice, cost, lines }. Recipe drinks: cost = Σ line need × ingredient buy_price (per unit, not
 *    rounded to packs), packPrice = cost / packs; lines: { key, id, name, unit, need (this drink only) }.
 *    Without recipe: lines = [], packPrice = buy_pack_price (legacy: pack_size × buy_price), cost = packs × packPrice.
 *  ingredients: { key, id, source: 'ingredient', name, unit, packType, packSize, need, stock, toBuy, packs, packPrice,
 *    cost }, in input order.
 *  total: what is really bought: Zutaten cost + cost of the drinks without recipe (recipe drinks are already in
 *    their ingredients).
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
  const drinks = [];
  for (const p of prodList) {
    if (!isActive(p)) continue;
    const t = termsOf(productTerms, p.id);
    const bought = num(t.purchase_qty);
    if (!(bought > 0)) continue;
    const size = num(t.pack_size) > 0 ? num(t.pack_size) : 1;
    const soldUnits = bought * size;
    const base = {
      key: `product:${p.id}`,
      id: p.id,
      name: p.name || '',
      unit: p.unit || 'Stk',
      need: round6(soldUnits),
      packs: bought,
      packLabel: String(t.buy_unit ?? '').trim() || null,
      packSize: size,
    };
    const rows = p.use_recipe ? (recipeOf.get(p.id) || []).filter((r) => ingById.has(r.ingredient_id)) : [];
    if (rows.length === 0) {
      // Bought as it is: Einkauf is already counted in buy units, no rounding.
      const hasPackPrice = t.buy_pack_price != null && t.buy_pack_price !== '';
      const packPrice = round2(hasPackPrice ? num(t.buy_pack_price) : size * num(t.buy_price));
      drinks.push({ ...base, hasRecipe: false, packPrice, cost: round2(bought * packPrice), lines: [] });
      continue;
    }
    let cost = 0;
    const lines = [];
    for (const r of rows) {
      const need = soldUnits * num(r.qty_per_unit);
      if (!(need > 0)) continue;
      const g = ingById.get(r.ingredient_id);
      addIng(g.id, need);
      cost += need * num(termsOf(ingredientTerms, g.id).buy_price);
      lines.push({ key: `ingredient:${g.id}:${p.id}`, id: g.id, name: g.name || '', unit: g.unit || 'Stk', need: round6(need) });
    }
    drinks.push({ ...base, hasRecipe: true, packPrice: round2(cost / bought), cost: round2(cost), lines });
  }
  drinks.sort(byName);
  for (const g of ingList) {
    if (isActive(g)) addIng(g.id, num(termsOf(ingredientTerms, g.id).extra_qty));
  }

  // Each ingredient once (all drinks + Zusatzbedarf).
  const ingRows = ingList.filter((g) => ingNeed.has(g.id)).map((g) => {
    const t = termsOf(ingredientTerms, g.id);
    const size = num(t.pack_size) > 0 ? num(t.pack_size) : 1;
    const need = round6(ingNeed.get(g.id));
    const stock = Math.max(0, num(t.stock_qty));
    const toBuy = Math.max(0, round6(need - stock));
    const packs = Math.ceil(round6(toBuy / size));
    return {
      key: `ingredient:${g.id}`,
      id: g.id,
      source: 'ingredient',
      name: g.name || '',
      unit: g.unit || 'Stk',
      packType: t.pack_type || 'none',
      packSize: size,
      need,
      stock,
      toBuy,
      packs,
      packPrice: round2(size * num(t.buy_price)),
      cost: round2(packs * size * num(t.buy_price)),
    };
  });
  // Footer total: the real purchase cost. Recipe drinks are left out, their ingredients are already in ingRows.
  const total = round2(ingRows.reduce((s, r) => s + r.cost, 0)
    + drinks.filter((d) => !d.hasRecipe).reduce((s, d) => s + d.cost, 0));
  return { drinks, ingredients: ingRows, total };
}
