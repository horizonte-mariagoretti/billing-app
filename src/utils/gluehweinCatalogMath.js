// Glühwein Sortiment economics: pure helpers (no DB).
//
// Products are SOLD per selling unit (gw_items.unit: Glas, Becher, Shot ...) and BOUGHT per buying unit
// (buy_unit: Flasche, Kasten ...) at buy_pack_price; pack_size is the content (selling units per buying unit).
// Products with a recipe are costed through their ingredients instead (recipeCost per selling unit).

// Trims float noise (0.1 × 3) so Math.ceil does not add a pack.
const round6 = (n) => Math.round(n * 1e6) / 1e6;
const numOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/**
 * Label of a unit mode ('portion' | 'buy' | 'liter', as in plan_unit and recipe_unit) for one product: the selling unit
 * (default Stk), the buying unit (buyFallback when it is empty) or 'l'. Used by the Sortiment Übrig select and the
 * recipe base amount.
 */
export function unitModeLabel(item, mode, buyFallback = 'Einkaufseinheit') {
  if (mode === 'liter') return 'l';
  if (mode === 'buy') return String(item?.buy_unit || '').trim() || buyFallback;
  return String(item?.unit || '').trim() || 'Stk';
}

/**
 * Selling units one recipe base amount stands for, to cost the recipe per selling unit. 'portion' = recipe_amount;
 * 'buy' = recipe_amount × pack_size; 'liter' = recipe_amount (liter products are costed per liter, as before).
 * null when the amount is not > 0 or the content is missing.
 */
export function portionsPerRecipe({ recipe_amount, recipe_unit, pack_size } = {}) {
  const amount = numOrNull(recipe_amount);
  if (!(amount > 0)) return null;
  if (recipe_unit === 'buy') {
    const content = numOrNull(pack_size);
    return content > 0 ? amount * content : null;
  }
  return amount;
}

/**
 * Planned quantity in selling units (portions). plan_unit: 'portion' = planned_qty is portions; 'liter' = planned_qty
 * is total liters, one portion holds liters_per_portion; 'buy' = planned_qty is buying units (bottles), content =
 * pack_size portions each. Returns null when the conversion value is missing (never 0).
 */
export function plannedPortions({ planned_qty, plan_unit, liters_per_portion, pack_size } = {}) {
  const planned = numOrNull(planned_qty) ?? 0;
  if (plan_unit === 'liter') {
    const liters = numOrNull(liters_per_portion);
    return liters > 0 ? planned / liters : null;
  }
  if (plan_unit === 'buy') {
    const content = numOrNull(pack_size);
    return content > 0 ? planned * content : null;
  }
  return planned;
}

/**
 * { sell_price, buy_pack_price, pack_size, planned_qty, recipeCost } ->{ cost, margin, marginPct, packsToBuy,
 * revenue, profit }. recipeCost (per selling unit) given => recipe product: cost = recipeCost, packsToBuy = null.
 * Missing values give null (never 0) so the UI can render "–" and totals can skip them.
 */
export function itemEconomics({ sell_price, buy_pack_price, pack_size, planned_qty, recipeCost } = {}) {
  const sell = numOrNull(sell_price);
  const price = numOrNull(buy_pack_price);
  const content = numOrNull(pack_size);
  const planned = numOrNull(planned_qty) ?? 0;
  const isRecipe = recipeCost !== undefined && recipeCost !== null;
  const cost = isRecipe
    ? Number(recipeCost)
    : (content != null && content > 0 && price != null ? price / content : null);
  const margin = sell != null && cost != null ? sell - cost : null;
  const marginPct = margin != null && sell > 0 ? margin / sell : null;
  const packsToBuy = isRecipe
    ? null
    : (content != null && content > 0 ? Math.ceil(round6(Math.max(0, planned) / content)) : null);
  const revenue = sell != null ? planned * sell : null;
  const profit = margin != null ? planned * margin : null;
  return { cost, margin, marginPct, packsToBuy, revenue, profit };
}

/**
 * Ingredient price per ingredient unit. buy_price is the price per pack (Packungspreis), pack_size the content of one
 * pack in ingredient units. Null when no price is entered.
 */
export function ingredientUnitPrice(terms) {
  const price = numOrNull(terms?.buy_price);
  if (price == null) return null;
  const size = numOrNull(terms?.pack_size);
  return price / (size > 0 ? size : 1);
}

/**
 * Cost of one selling unit through the recipe: Σ qty_per_unit × ingredient unit price (same semantics as the shopping
 * list; proportional, no pack rounding). Ingredients without price count 0.
 * recipeRows: [{ ingredient_id, qty_per_unit }]; ingredientTerms: Map/object id -> { buy_price, pack_size } or an array
 * of ingredient rows ({ id, buy_price, pack_size }). Returns null for an empty recipe.
 */
export function recipeCostPerUnit(recipeRows, ingredientTerms) {
  if (!recipeRows || recipeRows.length === 0) return null;
  const lookup = Array.isArray(ingredientTerms)
    ? new Map(ingredientTerms.map((g) => [g.id, g]))
    : ingredientTerms;
  const termsOf = (id) => (lookup instanceof Map ? lookup.get(id) : lookup?.[id]) || {};
  const sum = recipeRows.reduce((s, r) => (
    s + (numOrNull(r.qty_per_unit) ?? 0) * (ingredientUnitPrice(termsOf(r.ingredient_id)) ?? 0)
  ), 0);
  return round6(sum);
}
