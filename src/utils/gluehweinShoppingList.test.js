// Run: node --test src/utils/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShoppingList } from './gluehweinShoppingList.js';

const products = [
  { id: 'rot', name: 'Glühwein rot', unit: 'Becher' },
  { id: 'stella', name: 'Stella', unit: 'Fl.' },
  { id: 'leffe', name: 'Leffe', unit: 'Fl.' },
];
const ingredients = [
  { id: 'wein', name: 'Rotwein', unit: 'l' },
  { id: 'gewuerz', name: 'Gewürz', unit: 'Beutel' },
  { id: 'becher', name: 'Becher', unit: 'Stk' },
];

test('recipe expansion + direct purchase, pack rounding, null price', () => {
  const productTerms = new Map([
    ['rot', { planned_qty: 30 }],
    ['stella', { planned_qty: 25, pack_size: 24, buy_price: 1.1 }], // no recipe -> bought itself, 2 packs
    ['leffe', { planned_qty: 0, pack_size: 1, buy_price: 2 }], // not planned -> no row
  ]);
  const ingredientTerms = new Map([
    ['wein', { pack_size: 6, buy_price: 4.5 }], // 30 × 0.2 = 6 l -> 1 pack
    ['gewuerz', { pack_size: 0, buy_price: null }], // pack_size 0 -> 1; null price -> cost 0
  ]);
  const recipe = [
    { product_id: 'rot', ingredient_id: 'wein', qty_per_unit: 0.2 },
    { product_id: 'rot', ingredient_id: 'gewuerz', qty_per_unit: 0.1 },
  ];
  const { rows, total } = buildShoppingList({ products, ingredients, productTerms, ingredientTerms, recipe });
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.deepEqual(rows.map((r) => r.key), ['ingredient:wein', 'ingredient:gewuerz', 'product:stella']);
  assert.deepEqual([by.wein.need, by.wein.packs, by.wein.packPrice, by.wein.cost], [6, 1, 27, 27]);
  assert.deepEqual([by.gewuerz.need, by.gewuerz.packs, by.gewuerz.cost], [3, 3, 0]);
  assert.deepEqual([by.stella.source, by.stella.need, by.stella.stock, by.stella.packs, by.stella.cost], ['product', 25, 0, 2, 52.8]);
  assert.equal(total, 79.8);
});

test('stock is subtracted (floor 0) before pack rounding', () => {
  const productTerms = { rot: { planned_qty: 120 } };
  const ingredientTerms = {
    becher: { pack_size: 50, buy_price: 0.12, stock_qty: 100 }, // 120 - 100 = 20 -> 1 pack
    wein: { pack_size: 1, buy_price: 3, stock_qty: 50 }, // need 24, stock 50 -> 0 to buy
  };
  const recipe = [
    { product_id: 'rot', ingredient_id: 'becher', qty_per_unit: 1 },
    { product_id: 'rot', ingredient_id: 'wein', qty_per_unit: 0.2 },
  ];
  const { rows, total } = buildShoppingList({ products, ingredients, productTerms, ingredientTerms, recipe });
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.deepEqual([by.becher.need, by.becher.stock, by.becher.toBuy, by.becher.packs, by.becher.cost], [120, 100, 20, 1, 6]);
  assert.deepEqual([by.wein.need, by.wein.stock, by.wein.toBuy, by.wein.packs, by.wein.cost], [24, 50, 0, 0, 0]);
  assert.equal(total, 6);
});

test('extra_qty adds to the recipe need and works without any product', () => {
  const ingredientTerms = new Map([
    ['becher', { pack_size: 50, buy_price: 0.1, extra_qty: 30 }],
    ['gewuerz', { pack_size: 10, buy_price: 0.5, extra_qty: 0 }],
  ]);
  const only = buildShoppingList({ products, ingredients, productTerms: {}, ingredientTerms, recipe: [] });
  assert.deepEqual(only.rows.map((r) => [r.id, r.need, r.packs, r.cost]), [['becher', 30, 1, 5]]);

  const withRecipe = buildShoppingList({
    products,
    ingredients,
    productTerms: { rot: { planned_qty: 40 } },
    ingredientTerms,
    recipe: [{ product_id: 'rot', ingredient_id: 'becher', qty_per_unit: 1 }],
  });
  assert.deepEqual(withRecipe.rows.map((r) => [r.id, r.need, r.packs, r.cost]), [['becher', 70, 2, 10]]);
});

test('needs of several products are grouped; inactive product and inactive extra ignored; float noise', () => {
  const prods = [...products, { id: 'old', name: 'Alt', unit: 'Stk', active: 0 }];
  const ings = [...ingredients, { id: 'retired', name: 'Weg', unit: 'Stk', active: 0 }];
  const productTerms = { rot: { planned_qty: 10 }, stella: { planned_qty: 3 }, old: { planned_qty: 99 } };
  const ingredientTerms = { wein: { pack_size: 0.3, buy_price: 1 }, retired: { extra_qty: 5 } };
  const recipe = [
    { product_id: 'rot', ingredient_id: 'wein', qty_per_unit: 0.06 },
    { product_id: 'stella', ingredient_id: 'wein', qty_per_unit: 0.1 },
    { product_id: 'old', ingredient_id: 'wein', qty_per_unit: 1 },
  ];
  const { rows } = buildShoppingList({ products: prods, ingredients: ings, productTerms, ingredientTerms, recipe });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].need, 0.9); // 0.6 + 0.3
  assert.equal(rows[0].packs, 3); // 0.9 / 0.3 = 3 exactly, no extra pack from float noise
});

test('empty input', () => {
  assert.deepEqual(buildShoppingList({}), { rows: [], total: 0 });
});

test('products: pack cost = buy_pack_price, content-based packs, buy_unit label, legacy fallback', () => {
  const prods = [
    { id: 'baileys', name: 'Baileys', unit: 'Shot' },
    { id: 'stella', name: 'Stella', unit: 'Flasche' },
    { id: 'leffe', name: 'Leffe', unit: 'Flasche' },
  ];
  const productTerms = {
    baileys: { planned_qty: 160, buy_unit: 'Flasche', buy_pack_price: 14, pack_size: 20 }, // 160 / 20 = 8 Flaschen
    stella: { planned_qty: 50, buy_unit: 'Kasten', buy_pack_price: 14.4, pack_size: 24, buy_price: 99 }, // 3 Kästen
    leffe: { planned_qty: 13, pack_size: 12, buy_price: 1.5 }, // legacy: no pack price -> 12 × 1.5 = 18 per pack
  };
  const { rows, total } = buildShoppingList({ products: prods, ingredients: [], productTerms, ingredientTerms: {}, recipe: [] });
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.deepEqual([by.baileys.packs, by.baileys.packPrice, by.baileys.cost, by.baileys.packLabel], [8, 14, 112, 'Flasche']);
  assert.deepEqual([by.stella.packs, by.stella.packPrice, by.stella.cost, by.stella.packLabel], [3, 14.4, 43.2, 'Kasten']);
  assert.deepEqual([by.leffe.packs, by.leffe.packPrice, by.leffe.cost, by.leffe.packLabel], [2, 18, 36, null]);
  assert.equal(total, 191.2);
});
