// Glühwein recipe rows by name (pure helper, no DB).
//
// A recipe row names its ingredient, typed or picked. A name matches an existing ingredient case-insensitively; an
// unknown name becomes a new ingredient when the recipe is saved, so ingredients need not be created first.

const key = (s) => String(s ?? '').trim().toLowerCase();

/**
 * rows: [{ name, unit, qty_per_unit }] (unit only used for a new ingredient; default 'Stk').
 * ingredients: [{ id, name, unit, active }] of all gw_ingredients (inactive included).
 * Returns { recipe: [{ ingredient_id, qty_per_unit }], create: [{ id, name, unit }], reactivate: [id] }.
 * Throws RECIPE_ROW_INVALID (blank name or qty <= 0) or RECIPE_DUPLICATE (same ingredient twice).
 */
export function planRecipeRows(rows, ingredients, newId = () => crypto.randomUUID()) {
  const byName = new Map((ingredients || []).map((g) => [key(g.name), g]));
  const seen = new Set();
  const recipe = [];
  const create = [];
  const reactivate = [];
  for (const r of rows || []) {
    const name = String(r?.name ?? '').trim();
    const qty = Number(r?.qty_per_unit);
    if (!name || !(qty > 0)) throw new Error('RECIPE_ROW_INVALID');
    const k = key(name);
    if (seen.has(k)) throw new Error('RECIPE_DUPLICATE');
    seen.add(k);
    let g = byName.get(k);
    if (!g) {
      g = { id: newId(), name, unit: String(r.unit ?? '').trim() || 'Stk' };
      create.push(g);
    } else if (!g.active) {
      reactivate.push(g.id);
    }
    recipe.push({ ingredient_id: g.id, qty_per_unit: qty });
  }
  return { recipe, create, reactivate };
}
