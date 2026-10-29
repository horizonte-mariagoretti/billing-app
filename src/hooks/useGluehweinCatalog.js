import { useCallback } from 'react';
import useDatabase from './useDatabase';

const PACK_TYPES = ['none', 'kasten', 'flasche', 'paket'];

const numOrNull = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const numOr = (v, fallback) => {
  const n = numOrNull(v);
  return n === null || Number.isNaN(n) ? fallback : n;
};

// Glühwein catalog: items (not year-bound), per-year terms (prices, packs, planned qty; locked with the year)
// and recipes (product -> ingredients, not year-bound).
export function useGluehweinCatalog() {
  const { query, run, transaction } = useDatabase();

  const assertYearOpen = useCallback(async (year) => {
    const rows = await query('SELECT locked FROM app_years WHERE year = ?', [year]);
    if (rows[0]?.locked) throw new Error('YEAR_LOCKED');
  }, [query]);

  const fetchItems = useCallback(async (year) => {
    const items = await query(
      `SELECT i.id, i.name, i.kind, i.unit, i.sort_order, i.active,
              t.sell_price, t.buy_price, t.pack_type, t.pack_size, t.planned_qty
         FROM gw_items i
         LEFT JOIN gw_item_terms t ON t.item_id = i.id AND t.year = ?
        ORDER BY i.sort_order, i.name`,
      [year]
    );
    const recipeRows = await query(
      'SELECT product_id, ingredient_id, qty_per_unit FROM gw_recipe ORDER BY product_id, ingredient_id'
    );
    const recipes = new Map();
    for (const r of recipeRows) {
      if (!recipes.has(r.product_id)) recipes.set(r.product_id, []);
      recipes.get(r.product_id).push({ ingredient_id: r.ingredient_id, qty_per_unit: r.qty_per_unit });
    }
    return items.map((i) => ({
      ...i,
      sell_price: i.sell_price ?? null,
      buy_price: i.buy_price ?? null,
      pack_type: i.pack_type ?? 'none',
      pack_size: i.pack_size ?? 1,
      planned_qty: i.planned_qty ?? 0,
      recipe: recipes.get(i.id) || [],
    }));
  }, [query]);

  // item: { id?, name, kind, unit, sort_order?, active? }. Without id a new row is created.
  // On update, omitted sort_order / active keep their stored value.
  const saveItem = useCallback(async (item) => {
    const name = String(item.name ?? '').trim();
    const unit = item.unit ? String(item.unit).trim() : 'Stk';
    const sortOrder = item.sort_order === undefined || item.sort_order === null ? null : Number(item.sort_order);
    const active = item.active === undefined || item.active === null ? null : (item.active ? 1 : 0);
    if (item.id) {
      await run(
        `UPDATE gw_items SET name = ?, kind = ?, unit = ?,
                sort_order = COALESCE(?, sort_order), active = COALESCE(?, active)
          WHERE id = ?`,
        [name, item.kind, unit, sortOrder, active, item.id]
      );
      return item.id;
    }
    const id = crypto.randomUUID();
    await run(
      'INSERT INTO gw_items (id, name, kind, unit, sort_order, active) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, item.kind, unit, sortOrder ?? 0, active ?? 1]
    );
    return id;
  }, [run]);

  // Soft delete: refuses while the item is a recipe ingredient or was sold in a Kasse, else deactivates it.
  const deleteItem = useCallback(async (id) => {
    const used = await query(
      `SELECT 1 FROM gw_recipe WHERE ingredient_id = ?
       UNION ALL
       SELECT 1 FROM sales_kasse_lines WHERE item_id = ?
       LIMIT 1`,
      [id, id]
    );
    if (used.length) throw new Error('ITEM_IN_USE');
    const rows = await query('SELECT id, name, kind, unit, sort_order FROM gw_items WHERE id = ?', [id]);
    if (!rows[0]) return;
    await saveItem({ ...rows[0], active: 0 });
  }, [query, saveItem]);

  // terms: { sell_price, buy_price, pack_type, pack_size, planned_qty } for one item in one scout year (upsert).
  const saveTerms = useCallback(async (year, itemId, terms) => {
    await assertYearOpen(year);
    const packType = PACK_TYPES.includes(terms.pack_type) ? terms.pack_type : 'none';
    await run(
      `INSERT INTO gw_item_terms (item_id, year, sell_price, buy_price, pack_type, pack_size, planned_qty)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(item_id, year) DO UPDATE SET
         sell_price = excluded.sell_price, buy_price = excluded.buy_price, pack_type = excluded.pack_type,
         pack_size = excluded.pack_size, planned_qty = excluded.planned_qty`,
      [
        itemId,
        year,
        numOrNull(terms.sell_price),
        numOrNull(terms.buy_price),
        packType,
        numOr(terms.pack_size, 1),
        numOr(terms.planned_qty, 0),
      ]
    );
  }, [run, assertYearOpen]);

  // rows: [{ ingredient_id, qty_per_unit }]. Replaces the whole recipe of the product in one transaction.
  const saveRecipe = useCallback(async (productId, rows) => {
    const ops = [{ sql: 'DELETE FROM gw_recipe WHERE product_id = ?', params: [productId] }];
    for (const r of rows || []) {
      if (!r?.ingredient_id) continue;
      ops.push({
        sql: 'INSERT INTO gw_recipe (product_id, ingredient_id, qty_per_unit) VALUES (?, ?, ?)',
        params: [productId, r.ingredient_id, Number(r.qty_per_unit) || 0],
      });
    }
    await transaction(ops);
  }, [transaction]);

  return { fetchItems, saveItem, deleteItem, saveTerms, saveRecipe };
}
