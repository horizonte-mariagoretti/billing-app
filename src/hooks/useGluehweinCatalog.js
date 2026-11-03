import { useCallback } from 'react';
import useDatabase from './useDatabase';
import { plannedPortions } from '../utils/gluehweinCatalogMath';
import { planRecipeRows } from '../utils/gluehweinRecipeRows';

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
      `SELECT i.id, i.name, i.unit, i.sort_order, i.active, i.plan_unit, i.liters_per_portion, i.use_recipe,
              i.recipe_amount, i.recipe_unit,
              t.sell_price, t.buy_price, t.pack_type, t.pack_size, t.buy_unit, t.buy_pack_price, t.planned_qty, t.pack_liters,
              t.purchase_qty, t.purchase_unit
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
      plan_unit: i.plan_unit || 'portion',
      liters_per_portion: i.liters_per_portion ?? null,
      use_recipe: !!i.use_recipe,
      // Recipe base amount: the recipe rows are the ingredients for recipe_amount in recipe_unit.
      recipe_amount: numOr(i.recipe_amount, 1),
      recipe_unit: i.recipe_unit || 'portion',
      purchase_qty: i.purchase_qty ?? null,
      purchase_unit: i.purchase_unit ?? null,
      pack_liters: i.pack_liters ?? null,
      sell_price: i.sell_price ?? null,
      buy_price: i.buy_price ?? null,
      pack_type: i.pack_type ?? 'none',
      pack_size: i.pack_size ?? 1,
      buy_unit: i.buy_unit ?? null,
      buy_pack_price: i.buy_pack_price ?? null,
      planned_qty: i.planned_qty ?? 0,
      // Planned quantity in selling units (null when a liter or bottle conversion value is missing).
      portions: plannedPortions({
        planned_qty: i.planned_qty ?? 0,
        plan_unit: i.plan_unit || 'portion',
        liters_per_portion: i.liters_per_portion,
        pack_size: i.pack_size ?? 1,
      }),
      recipe: recipes.get(i.id) || [],
    }));
  }, [query]);

  // item: { id?, name, unit, sort_order?, active?, plan_unit?, liters_per_portion? }. Without id a new row is created.
  // On update, omitted sort_order / active / plan_unit keep their stored value; liters_per_portion is only written
  // when the key is present (null clears it).
  const saveItem = useCallback(async (item) => {
    const name = String(item.name ?? '').trim();
    const unit = item.unit ? String(item.unit).trim() : 'Stk';
    const sortOrder = item.sort_order === undefined || item.sort_order === null ? null : Number(item.sort_order);
    const active = item.active === undefined || item.active === null ? null : (item.active ? 1 : 0);
    const planUnit = item.plan_unit ? String(item.plan_unit) : null;
    const hasLiters = item.liters_per_portion !== undefined ? 1 : 0;
    const liters = numOrNull(item.liters_per_portion);
    const useRecipe = item.use_recipe === undefined || item.use_recipe === null ? null : (item.use_recipe ? 1 : 0);
    if (item.id) {
      await run(
        `UPDATE gw_items SET name = ?, unit = ?,
                sort_order = COALESCE(?, sort_order), active = COALESCE(?, active),
                plan_unit = COALESCE(?, plan_unit),
                liters_per_portion = CASE WHEN ? = 1 THEN ? ELSE liters_per_portion END,
                use_recipe = COALESCE(?, use_recipe)
          WHERE id = ?`,
        [name, unit, sortOrder, active, planUnit, hasLiters, liters, useRecipe, item.id]
      );
      return item.id;
    }
    const id = crypto.randomUUID();
    await run(
      `INSERT INTO gw_items (id, name, kind, unit, sort_order, active, plan_unit, liters_per_portion, use_recipe)
       VALUES (?, ?, 'drink', ?, ?, ?, ?, ?, ?)`,
      [id, name, unit, sortOrder ?? 0, active ?? 1, planUnit ?? 'portion', liters, useRecipe ?? 0]
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
  // Eingekauft: purchase_qty in purchase_unit (Kasten, Flasche, Liter), entered by hand.
  // Recipe products may pass keepBuy: true to leave the stored (ignored) buy fields untouched.
  const saveTerms = useCallback(async (year, itemId, terms) => {
    await assertYearOpen(year);
    const content = numOr(terms.pack_size, 1) > 0 ? numOr(terms.pack_size, 1) : 1;
    const packPrice = numOrNull(terms.buy_pack_price);
    const buyUnit = terms.buy_unit ? String(terms.buy_unit).trim() || null : null;
    const legacyUnitPrice = packPrice == null ? null : Math.round((packPrice / content) * 1e4) / 1e4;
    const purchaseQty = numOrNull(terms.purchase_qty);
    const purchaseUnit = terms.purchase_unit ? String(terms.purchase_unit).trim() || null : null;
    if (terms.keepBuy) {
      await run(
        `INSERT INTO gw_item_terms (item_id, year, sell_price, pack_type, pack_size, planned_qty, purchase_qty, purchase_unit)
         VALUES (?, ?, ?, 'none', 1, ?, ?, ?)
         ON CONFLICT(item_id, year) DO UPDATE SET
           sell_price = excluded.sell_price, planned_qty = excluded.planned_qty,
           purchase_qty = excluded.purchase_qty, purchase_unit = excluded.purchase_unit`,
        [itemId, year, numOrNull(terms.sell_price), numOr(terms.planned_qty, 0), purchaseQty, purchaseUnit]
      );
      return;
    }
    await run(
      `INSERT INTO gw_item_terms
         (item_id, year, sell_price, buy_price, pack_type, pack_size, buy_unit, buy_pack_price, planned_qty,
          purchase_qty, purchase_unit, pack_liters)
       VALUES (?, ?, ?, ?, 'none', ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(item_id, year) DO UPDATE SET
         sell_price = excluded.sell_price, buy_price = excluded.buy_price, pack_type = excluded.pack_type,
         pack_size = excluded.pack_size, buy_unit = excluded.buy_unit, buy_pack_price = excluded.buy_pack_price,
         planned_qty = excluded.planned_qty, purchase_qty = excluded.purchase_qty, purchase_unit = excluded.purchase_unit,
         pack_liters = excluded.pack_liters`,
      [
        itemId,
        year,
        numOrNull(terms.sell_price),
        legacyUnitPrice,
        content,
        buyUnit,
        packPrice,
        numOr(terms.planned_qty, 0),
        purchaseQty,
        purchaseUnit,
        numOrNull(terms.pack_liters),
      ]
    );
  }, [run, assertYearOpen]);

  // Copies the terms of every item from one scout year to another (upsert: existing target terms are overwritten).
  // withQty: also copy planned_qty; otherwise the target keeps its planned quantities (new rows start at 0).
  const copyTerms = useCallback(async (fromYear, toYear, { withQty = false } = {}) => {
    await assertYearOpen(toYear);
    await run(
      `INSERT INTO gw_item_terms
         (item_id, year, sell_price, buy_price, pack_type, pack_size, buy_unit, buy_pack_price, planned_qty)
       SELECT item_id, ?, sell_price, buy_price, pack_type, pack_size, buy_unit, buy_pack_price, ${withQty ? 'planned_qty' : '0'}
         FROM gw_item_terms
        WHERE year = ?
       ON CONFLICT(item_id, year) DO UPDATE SET
         sell_price = excluded.sell_price, buy_price = excluded.buy_price, pack_type = excluded.pack_type,
         pack_size = excluded.pack_size, buy_unit = excluded.buy_unit, buy_pack_price = excluded.buy_pack_price,
         planned_qty = ${withQty ? 'excluded.planned_qty' : 'gw_item_terms.planned_qty'}`,
      [toYear, fromYear]
    );
  }, [run, assertYearOpen]);

  // rows: [{ name, unit, qty_per_unit }]. Names match existing ingredients (case-insensitive); unknown names are created
  // as ingredients in the same transaction, inactive matches are reactivated. Replaces the whole recipe of the product.
  // base: { amount, unit } = the recipe base amount (qty_per_unit is per this amount); omitted keeps the stored one.
  const saveRecipe = useCallback(async (productId, rows, base) => {
    const ingredients = await query('SELECT id, name, unit, active FROM gw_ingredients');
    const plan = planRecipeRows(rows, ingredients);
    const ops = [];
    for (const g of plan.create) {
      ops.push({
        sql: `INSERT INTO gw_ingredients (id, name, unit, sort_order, active)
              VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM gw_ingredients), 1)`,
        params: [g.id, g.name, g.unit],
      });
    }
    for (const id of plan.reactivate) {
      ops.push({ sql: 'UPDATE gw_ingredients SET active = 1 WHERE id = ?', params: [id] });
    }
    if (base) {
      ops.push({
        sql: 'UPDATE gw_items SET recipe_amount = ?, recipe_unit = ? WHERE id = ?',
        params: [numOr(base.amount, 1), ['portion', 'buy', 'liter'].includes(base.unit) ? base.unit : 'portion', productId],
      });
    }
    ops.push({ sql: 'DELETE FROM gw_recipe WHERE product_id = ?', params: [productId] });
    for (const r of plan.recipe) {
      ops.push({
        sql: 'INSERT INTO gw_recipe (product_id, ingredient_id, qty_per_unit) VALUES (?, ?, ?)',
        params: [productId, r.ingredient_id, r.qty_per_unit],
      });
    }
    await transaction(ops);
  }, [query, transaction]);

  return { fetchItems, saveItem, deleteItem, saveTerms, copyTerms, saveRecipe };
}
