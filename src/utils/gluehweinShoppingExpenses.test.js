import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shoppingExpenseLines, buildShoppingList } from './gluehweinShoppingList.js';

const products = [
  { id: 1, name: 'Bier', unit: 'Glas', purchase_qty: 2, buy_pack_price: 10, pack_size: 20 },
  { id: 2, name: 'Glühwein', unit: 'Becher', use_recipe: 1, recipe_amount: 1, recipe_unit: 'buy', purchase_qty: 3,
    recipe: [{ ingredient_id: 1, qty_per_unit: 2 }] },
  { id: 3, name: 'Nichts gekauft', unit: 'Stk' },
];
const ingredients = [{ id: 1, name: 'Zucker', unit: 'kg', buy_price: 5, pack_size: 4 }];

test('shopping list becomes expense lines: plain drinks + ingredients, recipe drinks skipped', () => {
  const lines = shoppingExpenseLines(products, ingredients);
  assert.deepEqual(lines.map((l) => [l.description, l.amount, l.kind]), [
    ['Bier', 20, 'expense'], // 2 packs x 10
    ['Zucker', 10, 'expense'], // need 3 x 2 = 6 -> 2 packs x 5
  ]);
});

test('lines add up to the shopping list total', () => {
  const lines = shoppingExpenseLines(products, ingredients);
  const total = buildShoppingList({
    products, ingredients,
    productTerms: new Map(products.map((p) => [p.id, p])),
    ingredientTerms: new Map(ingredients.map((g) => [g.id, g])),
    recipe: products.flatMap((p) => (p.recipe || []).map((r) => ({ product_id: p.id, ...r }))),
  }).total;
  assert.equal(lines.reduce((s, l) => s + l.amount, 0), total);
});
