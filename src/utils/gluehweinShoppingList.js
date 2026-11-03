// Glühwein Einkaufsliste: pure helper (no DB).
//
// Everything is driven by Einkauf (purchase_qty in buy units, e.g. Kasten or Flasche), never by Übrig (planned_qty).
// Getränke: every active product with Einkauf, in name order. A product with no Einkauf has no row.
//  - With a recipe (use_recipe on, recipe rows): the recipe rows are the ingredients for one recipe base amount
//    (recipe_amount in recipe_unit). Einkauf is converted into recipe_unit (boughtInRecipeUnit), batches = that /
//    recipe_amount, each recipe row needs batches × qty_per_unit. Its cost is informational (the ingredients are
//    bought in the Zutaten list). A missing conversion gives no ingredient need and sets recipeIssue (never a silent 0).
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
 * Einkauf (purchase_qty, buy units) converted into a recipe unit: 'buy' = Einkauf; 'portion' = Einkauf × pack_size
 * (sold units per buy unit); 'liter' = Einkauf × pack_liters (liters per buy unit). null when the conversion value is
 * missing or not > 0.
 */
export function boughtInRecipeUnit(terms, unit) {
  const bought = num(terms?.purchase_qty);
  if (unit === 'buy') return bought;
  const factor = num(unit === 'liter' ? terms?.pack_liters : terms?.pack_size);
  return factor > 0 ? bought * factor : null;
}

/**
 * products: gw_items rows ({ id, name, unit, active?, use_recipe?, plan_unit?, recipe_amount?, recipe_unit? });
 *   ingredients: gw_ingredients rows ({ id, name, unit, active? }). recipe_amount / recipe_unit default to 1 / 'portion'
 *   (qty per sold unit).
 * productTerms: Map/object product id -> { purchase_qty, pack_size (content), pack_liters, buy_unit, buy_pack_price,
 *   buy_price (legacy) } of this year. pack_size is the sold units per buy unit, pack_liters the liters per buy unit.
 * ingredientTerms: Map/object ingredient id -> { buy_price, pack_type, pack_size, extra_qty, stock_qty } of this year.
 * recipe: [{ product_id, ingredient_id, qty_per_unit }] (qty per recipe base amount).
 * Returns { drinks, ingredients, total }.
 *  drinks: { key, id, name, unit, hasRecipe, need (sold amount for display), packs (Einkauf), packLabel (buy_unit or
 *    null), packSize, packPrice, cost, lines, recipeIssue }. Liter products (plan_unit 'liter') show need in 'l'
 *    (Einkauf × pack_liters), the others in their unit (Einkauf × pack_size); packSize is that factor (missing = 1).
 *    Recipe drinks: cost = Σ line need × ingredient buy_price (per unit, not rounded to packs), packPrice = cost /
 *    packs; lines: { key, id, name, unit, need (this drink only) }; recipeIssue: null, or 'pack_size' | 'pack_liters' |
 *    'recipe_amount' when Einkauf cannot be converted into recipe batches (then lines = [], cost = packPrice = null).
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
    const isLiter = p.plan_unit === 'liter';
    const factor = num(isLiter ? t.pack_liters : t.pack_size);
    const size = factor > 0 ? factor : 1;
    const base = {
      key: `product:${p.id}`,
      id: p.id,
      name: p.name || '',
      unit: isLiter ? 'l' : p.unit || 'Stk',
      need: round6(bought * size),
      packs: bought,
      packLabel: String(t.buy_unit ?? '').trim() || null,
      packSize: size,
      recipeIssue: null,
    };
    const rows = p.use_recipe ? (recipeOf.get(p.id) || []).filter((r) => ingById.has(r.ingredient_id)) : [];
    if (rows.length === 0) {
      // Bought as it is: Einkauf is already counted in buy units, no rounding. Legacy: buy_price is per sold unit.
      const hasPackPrice = t.buy_pack_price != null && t.buy_pack_price !== '';
      const content = num(t.pack_size) > 0 ? num(t.pack_size) : 1;
      const packPrice = round2(hasPackPrice ? num(t.buy_pack_price) : content * num(t.buy_price));
      drinks.push({ ...base, hasRecipe: false, packPrice, cost: round2(bought * packPrice), lines: [] });
      continue;
    }
    const recipeUnit = p.recipe_unit || 'portion';
    const recipeAmount = p.recipe_amount == null || p.recipe_amount === '' ? 1 : num(p.recipe_amount);
    const converted = boughtInRecipeUnit(t, recipeUnit);
    if (!(recipeAmount > 0) || converted == null) {
      const recipeIssue = !(recipeAmount > 0) ? 'recipe_amount' : recipeUnit === 'liter' ? 'pack_liters' : 'pack_size';
      drinks.push({ ...base, hasRecipe: true, recipeIssue, packPrice: null, cost: null, lines: [] });
      continue;
    }
    const batches = converted / recipeAmount;
    let cost = 0;
    const lines = [];
    for (const r of rows) {
      const need = batches * num(r.qty_per_unit);
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
