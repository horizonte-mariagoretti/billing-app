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
 * { sell_price, buy_pack_price, pack_size, planned_qty, recipeCost } -> { cost, margin, marginPct, packsToBuy,
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
 * Cost of one selling unit through the recipe: Σ qty_per_unit × ingredient buy price per ingredient unit
 * (same semantics as the shopping list; proportional, no pack rounding). Ingredients without price count 0.
 * recipeRows: [{ ingredient_id, qty_per_unit }]; ingredientTerms: Map/object id -> { buy_price } or an array of
 * ingredient rows ({ id, buy_price }). Returns null for an empty recipe.
 */
export function recipeCostPerUnit(recipeRows, ingredientTerms) {
  if (!recipeRows || recipeRows.length === 0) return null;
  const lookup = Array.isArray(ingredientTerms)
    ? new Map(ingredientTerms.map((g) => [g.id, g]))
    : ingredientTerms;
  const termsOf = (id) => (lookup instanceof Map ? lookup.get(id) : lookup?.[id]) || {};
  const sum = recipeRows.reduce((s, r) => (
    s + (numOrNull(r.qty_per_unit) ?? 0) * (numOrNull(termsOf(r.ingredient_id).buy_price) ?? 0)
  ), 0);
  return round6(sum);
}
