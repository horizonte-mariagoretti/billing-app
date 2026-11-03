import { useCallback } from 'react';
import useDatabase from './useDatabase';
import { planRecipeRows } from '../utils/gluehweinRecipeRows';

// Glühwein recipe library (gw_recipe_library, migration 52): saved recipe templates, not tied to one product or year.
// A template holds rows { name, unit, qty_per_unit } and is loaded into RecipeEditor; nothing changes on a product
// until its recipe is saved there. Ingredients named in a template are created when the recipe is saved.
export function useGluehweinRecipeLibrary() {
  const { query, run, transaction } = useDatabase();

  // [{ id, name, rows: [{ name, unit, qty_per_unit }] }], sorted by name.
  const fetchRecipes = useCallback(async () => {
    const recipes = await query('SELECT id, name FROM gw_recipe_library ORDER BY name');
    const rowsAll = await query(
      'SELECT library_id, name, unit, qty_per_unit FROM gw_recipe_library_rows ORDER BY library_id, name'
    );
    const byRecipe = new Map();
    for (const r of rowsAll) {
      if (!byRecipe.has(r.library_id)) byRecipe.set(r.library_id, []);
      byRecipe.get(r.library_id).push({ name: r.name, unit: r.unit, qty_per_unit: r.qty_per_unit });
    }
    return recipes.map((r) => ({ ...r, rows: byRecipe.get(r.id) || [] }));
  }, [query]);

  // rows: [{ name, unit, qty_per_unit }]. Validates the rows like a recipe; returns the new template id.
  const saveRecipe = useCallback(async (name, rows) => {
    const cleanName = String(name ?? '').trim();
    if (!cleanName) throw new Error('NAME_REQUIRED');
    planRecipeRows(rows, []); // throws on a blank name, qty <= 0 or a duplicate
    const id = crypto.randomUUID();
    const ops = [{
      sql: 'INSERT INTO gw_recipe_library (id, name) VALUES (?, ?)',
      params: [id, cleanName],
    }];
    for (const r of rows) {
      ops.push({
        sql: 'INSERT INTO gw_recipe_library_rows (library_id, name, unit, qty_per_unit) VALUES (?, ?, ?, ?)',
        params: [id, String(r.name).trim(), String(r.unit ?? '').trim() || 'Stk', Number(r.qty_per_unit)],
      });
    }
    await transaction(ops);
    return id;
  }, [transaction]);

  const deleteRecipe = useCallback(async (id) => {
    await run('DELETE FROM gw_recipe_library WHERE id = ?', [id]);
  }, [run]);

  return { fetchRecipes, saveRecipe, deleteRecipe };
}
