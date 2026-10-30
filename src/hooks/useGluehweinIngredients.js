import { useCallback } from 'react';
import useDatabase from './useDatabase';

const PACK_TYPES = ['none', 'kasten', 'flasche', 'paket'];

const numOrNull = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const numOr = (v, fallback) => {
  const n = numOrNull(v);
  return n === null || Number.isNaN(n) ? fallback : n;
};

// Glühwein ingredients (Einkaufsliste > Zutaten): ingredients themselves (not year-bound, always editable) and their
// per-year terms (price, pack, extra need, stock on hand; locked with the year). Recipes reference gw_ingredients.id.
export function useGluehweinIngredients() {
  const { query, run } = useDatabase();

  const assertYearOpen = useCallback(async (year) => {
    const rows = await query('SELECT locked FROM app_years WHERE year = ?', [year]);
    if (rows[0]?.locked) throw new Error('YEAR_LOCKED');
  }, [query]);

  const fetchIngredients = useCallback(async (year) => {
    const rows = await query(
      `SELECT g.id, g.name, g.unit, g.sort_order, g.active,
              t.buy_price, t.pack_type, t.pack_size, t.extra_qty, t.stock_qty
         FROM gw_ingredients g
         LEFT JOIN gw_ingredient_terms t ON t.ingredient_id = g.id AND t.year = ?
        ORDER BY g.sort_order, g.name`,
      [year]
    );
    return rows.map((r) => ({
      ...r,
      buy_price: r.buy_price ?? null,
      pack_type: r.pack_type ?? 'none',
      pack_size: r.pack_size ?? 1,
      extra_qty: r.extra_qty ?? 0,
      stock_qty: r.stock_qty ?? 0,
    }));
  }, [query]);

  // ingredient: { id?, name, unit, active? }. Without id a new row is created (appended to the sort order).
  const saveIngredient = useCallback(async (ingredient) => {
    const name = String(ingredient.name ?? '').trim();
    const unit = ingredient.unit ? String(ingredient.unit).trim() : 'Stk';
    const active = ingredient.active === undefined || ingredient.active === null ? null : (ingredient.active ? 1 : 0);
    if (ingredient.id) {
      await run(
        'UPDATE gw_ingredients SET name = ?, unit = ?, active = COALESCE(?, active) WHERE id = ?',
        [name, unit, active, ingredient.id]
      );
      return ingredient.id;
    }
    const id = crypto.randomUUID();
    await run(
      `INSERT INTO gw_ingredients (id, name, unit, sort_order, active)
       VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM gw_ingredients), ?)`,
      [id, name, unit, active ?? 1]
    );
    return id;
  }, [run]);

  // terms: { buy_price, pack_type, pack_size, extra_qty, stock_qty } for one ingredient in one scout year (upsert).
  const saveIngredientTerms = useCallback(async (year, ingredientId, terms) => {
    await assertYearOpen(year);
    const packType = PACK_TYPES.includes(terms.pack_type) ? terms.pack_type : 'none';
    await run(
      `INSERT INTO gw_ingredient_terms (ingredient_id, year, buy_price, pack_type, pack_size, extra_qty, stock_qty)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ingredient_id, year) DO UPDATE SET
         buy_price = excluded.buy_price, pack_type = excluded.pack_type, pack_size = excluded.pack_size,
         extra_qty = excluded.extra_qty, stock_qty = excluded.stock_qty`,
      [
        ingredientId,
        year,
        numOrNull(terms.buy_price),
        packType,
        numOr(terms.pack_size, 1),
        numOr(terms.extra_qty, 0),
        numOr(terms.stock_qty, 0),
      ]
    );
  }, [run, assertYearOpen]);

  // Soft delete: refuses while a recipe uses the ingredient, else deactivates it.
  const deleteIngredient = useCallback(async (id) => {
    const used = await query('SELECT 1 FROM gw_recipe WHERE ingredient_id = ? LIMIT 1', [id]);
    if (used.length) throw new Error('INGREDIENT_IN_USE');
    await run('UPDATE gw_ingredients SET active = 0 WHERE id = ?', [id]);
  }, [query, run]);

  return { fetchIngredients, saveIngredient, saveIngredientTerms, deleteIngredient };
}
