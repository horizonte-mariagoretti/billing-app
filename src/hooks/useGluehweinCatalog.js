import { useCallback } from 'react';
import useDatabase from './useDatabase';

const numOrNull = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const numOr = (v, fallback) => {
  const n = numOrNull(v);
  return n === null || Number.isNaN(n) ? fallback : n;
};

// Glühwein Sortiment: sellable products (not year-bound), per-year terms (prices, buying unit, planned qty; locked with
// the year) and recipes (product -> gw_ingredients, not year-bound). Ingredients live in useGluehweinIngredients.
// gw_items.kind is a legacy column (SQLite CHECK): new rows get 'drink', it is not read any more.
// Sold per selling unit (gw_items.unit), bought per buying unit (terms.buy_unit) at buy_pack_price; pack_size is the
// content (selling units per buying unit). sell_price and planned_qty are per selling unit.
export function useGluehweinCatalog() {
  const { query, run, transaction } = useDatabase();

  const assertYearOpen = useCallback(async (year) => {
    const rows = await query('SELECT locked FROM app_years WHERE year = ?', [year]);
    if (rows[0]?.locked) throw new Error('YEAR_LOCKED');
  }, [query]);

  const fetchItems = useCallback(async (year) => {
    const items = await query(
      `SELECT i.id, i.name, i.unit, i.sort_order, i.active,
              t.sell_price, t.buy_price, t.pack_type, t.pack_size, t.buy_unit, t.buy_pack_price, t.planned_qty
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
      buy_unit: i.buy_unit ?? null,
      buy_pack_price: i.buy_pack_price ?? null,
      planned_qty: i.planned_qty ?? 0,
      recipe: recipes.get(i.id) || [],
    }));
  }, [query]);

  // item: { id?, name, unit, sort_order?, active? }. Without id a new row is created.
  // On update, omitted sort_order / active keep their stored value.
  const saveItem = useCallback(async (item) => {
    const name = String(item.name ?? '').trim();
    const unit = item.unit ? String(item.unit).trim() : 'Stk';
    const sortOrder = item.sort_order === undefined || item.sort_order === null ? null : Number(item.sort_order);
    const active = item.active === undefined || item.active === null ? null : (item.active ? 1 : 0);
    if (item.id) {
      await run(
        `UPDATE gw_items SET name = ?, unit = ?,
                sort_order = COALESCE(?, sort_order), active = COALESCE(?, active)
          WHERE id = ?`,
        [name, unit, sortOrder, active, item.id]
      );
      return item.id;
    }
    const id = crypto.randomUUID();
    await run(
      "INSERT INTO gw_items (id, name, kind, unit, sort_order, active) VALUES (?, ?, 'drink', ?, ?, ?)",
      [id, name, unit, sortOrder ?? 0, active ?? 1]
    );
    return id;
  }, [run]);

  // Soft delete: deactivates the product (terms, recipe and Kasse history stay).
  const deleteItem = useCallback(async (id) => {
    const rows = await query('SELECT id, name, unit, sort_order FROM gw_items WHERE id = ?', [id]);
    if (!rows[0]) return;
    await saveItem({ ...rows[0], active: 0 });
  }, [query, saveItem]);

  // terms: { sell_price, buy_unit, buy_pack_price, pack_size (content), planned_qty } for one item in one scout year
  // (upsert). Legacy columns for compatibility (migration 39): pack_type is always 'none' (its CHECK only knows four
  // fixed values) and buy_price = buy_pack_price / pack_size, i.e. the price per selling unit as before.
  // Recipe products may pass keepBuy: true to leave the stored (ignored) buy fields untouched.
  const saveTerms = useCallback(async (year, itemId, terms) => {
    await assertYearOpen(year);
    const content = numOr(terms.pack_size, 1) > 0 ? numOr(terms.pack_size, 1) : 1;
    const packPrice = numOrNull(terms.buy_pack_price);
    const buyUnit = terms.buy_unit ? String(terms.buy_unit).trim() || null : null;
    const legacyUnitPrice = packPrice == null ? null : Math.round((packPrice / content) * 1e4) / 1e4;
    if (terms.keepBuy) {
      await run(
        `INSERT INTO gw_item_terms (item_id, year, sell_price, pack_type, pack_size, planned_qty)
         VALUES (?, ?, ?, 'none', 1, ?)
         ON CONFLICT(item_id, year) DO UPDATE SET
           sell_price = excluded.sell_price, planned_qty = excluded.planned_qty`,
        [itemId, year, numOrNull(terms.sell_price), numOr(terms.planned_qty, 0)]
      );
      return;
    }
    await run(
      `INSERT INTO gw_item_terms
         (item_id, year, sell_price, buy_price, pack_type, pack_size, buy_unit, buy_pack_price, planned_qty)
       VALUES (?, ?, ?, ?, 'none', ?, ?, ?, ?)
       ON CONFLICT(item_id, year) DO UPDATE SET
         sell_price = excluded.sell_price, buy_price = excluded.buy_price, pack_type = excluded.pack_type,
         pack_size = excluded.pack_size, buy_unit = excluded.buy_unit, buy_pack_price = excluded.buy_pack_price,
         planned_qty = excluded.planned_qty`,
      [
        itemId,
        year,
        numOrNull(terms.sell_price),
        legacyUnitPrice,
        content,
        buyUnit,
        packPrice,
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
