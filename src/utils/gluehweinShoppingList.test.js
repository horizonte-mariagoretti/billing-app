// Run: node --test src/utils/gluehweinShoppingList.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShoppingList, boughtInRecipeUnit } from './gluehweinShoppingList.js';

const products = [
  { id: 'rot', name: 'Glühwein rot', unit: 'Becher', use_recipe: true },
  { id: 'stella', name: 'Stella', unit: 'Fl.', use_recipe: true },
  { id: 'leffe', name: 'Leffe', unit: 'Fl.' },
];
const ingredients = [
  { id: 'wein', name: 'Rotwein', unit: 'l' },
  { id: 'gewuerz', name: 'Gewürz', unit: 'Beutel' },
  { id: 'becher', name: 'Becher', unit: 'Stk' },
];
const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));

test('recipe drink: Einkauf × content drives its lines; cost from the ingredients, price per pack = cost / packs', () => {
  const productTerms = new Map([
    ['rot', { purchase_qty: 5, pack_size: 6, buy_unit: 'Kiste' }], // 30 sold units
    ['stella', { purchase_qty: 0 }], // no Einkauf -> no row
    ['leffe', { purchase_qty: 0 }],
  ]);
  const ingredientTerms = new Map([
    ['wein', { pack_size: 6, buy_price: 4.5 }], // 30 × 0.2 = 6 l -> 1 pack
    ['gewuerz', { pack_size: 0, buy_price: null }], // pack_size 0 -> 1; null price -> cost 0
  ]);
  const recipe = [
    { product_id: 'rot', ingredient_id: 'wein', qty_per_unit: 0.2 },
    { product_id: 'rot', ingredient_id: 'gewuerz', qty_per_unit: 0.1 },
  ];
  const res = buildShoppingList({ products, ingredients, productTerms, ingredientTerms, recipe });
  assert.equal(res.drinks.length, 1);
  const d = res.drinks[0];
  assert.deepEqual([d.id, d.hasRecipe, d.need, d.packs, d.packLabel, d.cost, d.packPrice], ['rot', true, 30, 5, 'Kiste', 27, 5.4]);
  assert.deepEqual(d.lines.map((l) => [l.id, l.need, l.unit]), [['wein', 6, 'l'], ['gewuerz', 3, 'Beutel']]);
  const by = byId(res.ingredients);
  assert.deepEqual([by.wein.source, by.wein.need, by.wein.packs, by.wein.packPrice, by.wein.cost], ['ingredient', 6, 1, 27, 27]);
  assert.deepEqual([by.gewuerz.need, by.gewuerz.packs, by.gewuerz.cost], [3, 3, 0]);
  assert.equal(res.total, 27);
});

test('ingredient shared by two drinks: each drink shows its own need, the Zutaten row counts it once', () => {
  const productTerms = {
    rot: { purchase_qty: 1, pack_size: 10 }, // 10 sold units
    stella: { purchase_qty: 1, pack_size: 30 }, // 30 sold units
  };
  const ingredientTerms = { wein: { pack_size: 4, buy_price: 2 } };
  const recipe = [
    { product_id: 'stella', ingredient_id: 'wein', qty_per_unit: 1 }, // 30
    { product_id: 'rot', ingredient_id: 'wein', qty_per_unit: 1 }, // 10
  ];
  const res = buildShoppingList({ products, ingredients, productTerms, ingredientTerms, recipe });
  // Name order, not input order.
  assert.deepEqual(res.drinks.map((d) => d.id), ['rot', 'stella']);
  assert.deepEqual(res.drinks.map((d) => d.lines[0].need), [10, 30]);
  // Drink cost at the per-unit price, proportional: 10 × 2, 30 × 2.
  assert.deepEqual(res.drinks.map((d) => d.cost), [20, 60]);
  assert.equal(res.ingredients.length, 1);
  const w = res.ingredients[0];
  assert.deepEqual([w.need, w.packs, w.packPrice, w.cost], [40, 10, 8, 80]);
  assert.equal(res.total, 80);
});

test('stock is subtracted (floor 0) before pack rounding; the drink cost ignores stock', () => {
  const productTerms = { rot: { purchase_qty: 2, pack_size: 60 } }; // 120 sold units
  const ingredientTerms = {
    becher: { pack_size: 50, buy_price: 0.12, stock_qty: 100 }, // 120 - 100 = 20 -> 1 pack
    wein: { pack_size: 1, buy_price: 3, stock_qty: 50 }, // need 24, stock 50 -> 0 to buy
  };
  const recipe = [
    { product_id: 'rot', ingredient_id: 'becher', qty_per_unit: 1 },
    { product_id: 'rot', ingredient_id: 'wein', qty_per_unit: 0.2 },
  ];
  const res = buildShoppingList({ products, ingredients, productTerms, ingredientTerms, recipe });
  const by = byId(res.ingredients);
  assert.deepEqual([by.becher.need, by.becher.stock, by.becher.toBuy, by.becher.packs, by.becher.cost], [120, 100, 20, 1, 6]);
  assert.deepEqual([by.wein.need, by.wein.stock, by.wein.toBuy, by.wein.packs, by.wein.cost], [24, 50, 0, 0, 0]);
  assert.equal(res.drinks[0].cost, 86.4); // 120 × 0.12 + 24 × 3
  assert.equal(res.total, 6);
});

test('Zusatzbedarf alone gives a Zutaten row; with a recipe it adds to the total need, not to the drink', () => {
  const ingredientTerms = new Map([
    ['becher', { pack_size: 50, buy_price: 0.1, extra_qty: 30 }],
    ['gewuerz', { pack_size: 10, buy_price: 0.5, extra_qty: 0 }],
  ]);
  const only = buildShoppingList({ products, ingredients, productTerms: {}, ingredientTerms, recipe: [] });
  assert.deepEqual(only.drinks, []);
  assert.deepEqual(only.ingredients.map((r) => [r.id, r.need, r.packs, r.cost]), [['becher', 30, 1, 5]]);
  assert.equal(only.total, 5);

  const withRecipe = buildShoppingList({
    products,
    ingredients,
    productTerms: { rot: { purchase_qty: 1, pack_size: 40 } },
    ingredientTerms,
    recipe: [{ product_id: 'rot', ingredient_id: 'becher', qty_per_unit: 1 }],
  });
  // need 40 from the recipe + 30 Zusatzbedarf = 70 -> 2 packs
  assert.equal(withRecipe.drinks[0].lines[0].need, 40);
  assert.deepEqual(withRecipe.ingredients.map((r) => [r.id, r.need, r.packs]), [['becher', 70, 2]]);
  assert.equal(withRecipe.total, 10);
});

test('inactive product and inactive ingredient are ignored; float noise adds no pack', () => {
  const prods = [...products, { id: 'old', name: 'Alt', unit: 'Stk', active: 0 }];
  const ings = [...ingredients, { id: 'retired', name: 'Weg', unit: 'Stk', active: 0 }];
  const productTerms = { rot: { purchase_qty: 1, pack_size: 15 }, stella: { purchase_qty: 1, pack_size: 5 }, old: { purchase_qty: 99, pack_size: 1 } };
  const ingredientTerms = { wein: { pack_size: 0.3, buy_price: 1 }, retired: { extra_qty: 5 } };
  const recipe = [
    { product_id: 'rot', ingredient_id: 'wein', qty_per_unit: 0.06 }, // 15 × 0.06 = 0.9
    { product_id: 'stella', ingredient_id: 'wein', qty_per_unit: 0.1 }, // 5 × 0.1 = 0.5
    { product_id: 'old', ingredient_id: 'wein', qty_per_unit: 1 },
  ];
  const res = buildShoppingList({ products: prods, ingredients: ings, productTerms, ingredientTerms, recipe });
  assert.deepEqual(res.drinks.map((d) => d.id), ['rot', 'stella']);
  assert.equal(res.ingredients.length, 1);
  assert.equal(res.ingredients[0].need, 1.4); // 0.9 + 0.5
  assert.equal(res.ingredients[0].packs, 5); // 1.4 / 0.3 = 4.67 -> 5
});

test('product without recipe is a Getränke row (packs = Einkauf); Einkauf 0 or missing gives no row', () => {
  const productTerms = {
    baileys: { planned_qty: 160, buy_unit: 'Flasche', buy_pack_price: 14, pack_size: 20, purchase_qty: 8 },
    stella: { planned_qty: 50, buy_unit: 'Kasten', buy_pack_price: 14.4, pack_size: 24, buy_price: 99, purchase_qty: 3 },
    leffe: { planned_qty: 13, pack_size: 12, buy_price: 1.5, purchase_qty: 2 }, // legacy: no pack price -> 12 × 1.5 = 18 per pack
    rot: { planned_qty: 10, pack_size: 1 }, // no Einkauf -> no row
  };
  const prods = [
    { id: 'baileys', name: 'Baileys', unit: 'Shot' },
    { id: 'stella', name: 'Stella', unit: 'Flasche' },
    { id: 'leffe', name: 'Leffe', unit: 'Flasche' },
    { id: 'rot', name: 'Rot', unit: 'Becher', use_recipe: true },
  ];
  const recipe = [{ product_id: 'rot', ingredient_id: 'wein', qty_per_unit: 0.2 }];
  const res = buildShoppingList({ products: prods, ingredients, productTerms, ingredientTerms: {}, recipe });
  assert.deepEqual(res.ingredients, []);
  assert.deepEqual(res.drinks.map((d) => d.id), ['baileys', 'leffe', 'stella']);
  assert.ok(res.drinks.every((d) => !d.hasRecipe && d.lines.length === 0));
  const by = byId(res.drinks);
  assert.deepEqual([by.baileys.need, by.baileys.packs, by.baileys.packPrice, by.baileys.cost, by.baileys.packLabel], [160, 8, 14, 112, 'Flasche']);
  assert.deepEqual([by.stella.packs, by.stella.packPrice, by.stella.cost, by.stella.packLabel], [3, 14.4, 43.2, 'Kasten']);
  assert.deepEqual([by.leffe.packs, by.leffe.packPrice, by.leffe.cost, by.leffe.packLabel], [2, 18, 36, null]);
  assert.equal(res.total, 191.2);
});

test('footer total = Zutaten cost + drinks without recipe; recipe drinks are not added twice', () => {
  const productTerms = {
    rot: { purchase_qty: 2, pack_size: 10 }, // 20 sold units, recipe
    leffe: { purchase_qty: 3, buy_pack_price: 5, pack_size: 1 }, // 15
  };
  const ingredientTerms = { wein: { pack_size: 1, buy_price: 2 } }; // 20 × 0.5 = 10 l -> 20
  const recipe = [{ product_id: 'rot', ingredient_id: 'wein', qty_per_unit: 0.5 }];
  const res = buildShoppingList({ products, ingredients, productTerms, ingredientTerms, recipe });
  const by = byId(res.drinks);
  assert.deepEqual([by.rot.hasRecipe, by.rot.cost], [true, 20]);
  assert.deepEqual([by.leffe.hasRecipe, by.leffe.cost], [false, 15]);
  assert.equal(res.ingredients[0].cost, 20);
  assert.equal(res.total, 35); // not 55
});

test('boughtInRecipeUnit: buy = Einkauf, portion = × content, liter = × liters per buy unit; missing value -> null', () => {
  const terms = { purchase_qty: 8, pack_size: 24, pack_liters: 6 };
  assert.equal(boughtInRecipeUnit(terms, 'buy'), 8);
  assert.equal(boughtInRecipeUnit(terms, 'portion'), 192);
  assert.equal(boughtInRecipeUnit(terms, 'liter'), 48);
  assert.equal(boughtInRecipeUnit({ purchase_qty: 8, pack_size: 24 }, 'liter'), null);
  assert.equal(boughtInRecipeUnit({ purchase_qty: 8, pack_size: 0 }, 'portion'), null);
  assert.equal(boughtInRecipeUnit({ purchase_qty: 8 }, 'buy'), 8);
});

test('default base (1, portion) equals qty per sold unit; recipe_amount 2 halves the batches', () => {
  const productTerms = { rot: { purchase_qty: 5, pack_size: 6 } }; // 30 sold units
  const ingredientTerms = { wein: { pack_size: 1, buy_price: 1 } };
  const recipe = [{ product_id: 'rot', ingredient_id: 'wein', qty_per_unit: 0.2 }];
  const implicit = buildShoppingList({ products, ingredients, productTerms, ingredientTerms, recipe });
  const explicit = buildShoppingList({
    products: products.map((p) => (p.id === 'rot' ? { ...p, recipe_amount: 1, recipe_unit: 'portion' } : p)),
    ingredients, productTerms, ingredientTerms, recipe,
  });
  assert.deepEqual(explicit, implicit);
  assert.equal(implicit.drinks[0].lines[0].need, 6); // 30 × 0.2
  assert.equal(implicit.drinks[0].recipeIssue, null);
  const two = buildShoppingList({
    products: products.map((p) => (p.id === 'rot' ? { ...p, recipe_amount: 2 } : p)),
    ingredients, productTerms, ingredientTerms, recipe,
  });
  assert.equal(two.drinks[0].lines[0].need, 3); // 15 batches × 0.2
});

test('liter product: Pack of 6 l, recipe per 1 l -> batches = 6 × Pack; shown in liters', () => {
  const prods = [{ id: 'gin', name: 'Glühgin', unit: 'Becher', plan_unit: 'liter', use_recipe: true, recipe_amount: 1, recipe_unit: 'liter' }];
  const ings = [{ id: 'gin', name: 'Gin', unit: 'l' }, { id: 'saft', name: 'Saft', unit: 'l' }];
  const productTerms = { gin: { purchase_qty: 8, pack_size: 1, pack_liters: 6, buy_unit: 'Pack' } };
  const ingredientTerms = { gin: { pack_size: 1, buy_price: 10 }, saft: { pack_size: 1, buy_price: 1 } };
  const recipe = [
    { product_id: 'gin', ingredient_id: 'gin', qty_per_unit: 0.1 },
    { product_id: 'gin', ingredient_id: 'saft', qty_per_unit: 0.9 },
  ];
  const res = buildShoppingList({ products: prods, ingredients: ings, productTerms, ingredientTerms, recipe });
  const d = res.drinks[0];
  assert.deepEqual([d.need, d.unit, d.packs, d.packLabel, d.packSize], [48, 'l', 8, 'Pack', 6]);
  assert.deepEqual(d.lines.map((l) => [l.id, l.need]), [['gin', 4.8], ['saft', 43.2]]); // 48 batches
  assert.equal(d.cost, 91.2); // 4.8 × 10 + 43.2 × 1

  // Recipe per 2 l: half the batches.
  const half = buildShoppingList({
    products: [{ ...prods[0], recipe_amount: 2 }], ingredients: ings, productTerms, ingredientTerms, recipe,
  });
  assert.deepEqual(half.drinks[0].lines.map((l) => l.need), [2.4, 21.6]);
});

test('recipe_unit buy with recipe_amount 2: batches = Einkauf / 2', () => {
  const prods = [{ id: 'rot', name: 'Rot', unit: 'Becher', use_recipe: true, recipe_amount: 2, recipe_unit: 'buy' }];
  const productTerms = { rot: { purchase_qty: 10, pack_size: 24 } };
  const recipe = [{ product_id: 'rot', ingredient_id: 'wein', qty_per_unit: 3 }];
  const res = buildShoppingList({ products: prods, ingredients, productTerms, ingredientTerms: {}, recipe });
  assert.equal(res.drinks[0].lines[0].need, 15); // 5 batches × 3
  assert.equal(res.ingredients[0].need, 15);
});

test('missing conversion: no ingredient need, recipeIssue set, no cost', () => {
  const prods = [
    { id: 'gin', name: 'Glühgin', unit: 'Becher', plan_unit: 'liter', use_recipe: true, recipe_amount: 1, recipe_unit: 'liter' },
    { id: 'rot', name: 'Rot', unit: 'Becher', use_recipe: true, recipe_amount: 0 },
  ];
  const productTerms = { gin: { purchase_qty: 8, pack_size: 1, pack_liters: null }, rot: { purchase_qty: 2, pack_size: 10 } };
  const recipe = [
    { product_id: 'gin', ingredient_id: 'wein', qty_per_unit: 1 },
    { product_id: 'rot', ingredient_id: 'wein', qty_per_unit: 1 },
  ];
  const res = buildShoppingList({ products: prods, ingredients, productTerms, ingredientTerms: {}, recipe });
  const by = byId(res.drinks);
  assert.deepEqual([by.gin.hasRecipe, by.gin.recipeIssue, by.gin.lines, by.gin.cost, by.gin.packPrice], [true, 'pack_liters', [], null, null]);
  assert.equal(by.gin.packs, 8);
  assert.equal(by.rot.recipeIssue, 'recipe_amount');
  assert.deepEqual(res.ingredients, []);
  assert.equal(res.total, 0);
});

test('shared ingredient across drinks with different bases is counted once in Zutaten', () => {
  const prods = [
    { id: 'gin', name: 'Glühgin', unit: 'Becher', plan_unit: 'liter', use_recipe: true, recipe_amount: 1, recipe_unit: 'liter' },
    { id: 'rot', name: 'Rot', unit: 'Becher', use_recipe: true }, // default 1 portion
  ];
  const productTerms = { gin: { purchase_qty: 2, pack_liters: 6 }, rot: { purchase_qty: 1, pack_size: 20 } };
  const ingredientTerms = { becher: { pack_size: 50, buy_price: 0.1 } };
  const recipe = [
    { product_id: 'gin', ingredient_id: 'becher', qty_per_unit: 5 }, // 12 l × 5 = 60
    { product_id: 'rot', ingredient_id: 'becher', qty_per_unit: 1 }, // 20
  ];
  const res = buildShoppingList({ products: prods, ingredients, productTerms, ingredientTerms, recipe });
  assert.deepEqual(res.drinks.map((d) => d.lines[0].need), [60, 20]);
  assert.equal(res.ingredients.length, 1);
  assert.deepEqual([res.ingredients[0].need, res.ingredients[0].packs, res.ingredients[0].cost], [80, 2, 10]);
});

test('empty input', () => {
  assert.deepEqual(buildShoppingList({}), { drinks: [], ingredients: [], total: 0 });
});
