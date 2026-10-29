// Run: node --test src/utils/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShoppingList } from './gluehweinShoppingList.js';

const items = [
  { id: 'rot', name: 'Glühwein rot', kind: 'drink' },
  { id: 'wein', name: 'Rotwein', kind: 'ingredient' },
  { id: 'gewuerz', name: 'Gewürz', kind: 'ingredient' },
  { id: 'stella', name: 'Stella', kind: 'beer' },
  { id: 'leffe', name: 'Leffe', kind: 'beer_special' },
];

test('recipe expansion, pack rounding, null price', () => {
  const terms = new Map([
    ['rot', { planned_qty: 30 }],
    ['wein', { pack_size: 6, buy_price: 4.5 }], // 30 × 0.2 = 6 l -> 1 pack
    ['gewuerz', { pack_size: 0, buy_price: null }], // pack_size 0 -> 1; null price -> cost 0
    ['stella', { planned_qty: 25, pack_size: 24, buy_price: 1.1 }], // no recipe -> 2 packs
    ['leffe', { planned_qty: 0, pack_size: 1, buy_price: 2 }], // not planned -> no row
  ]);
  const recipe = [
    { product_id: 'rot', ingredient_id: 'wein', qty_per_unit: 0.2 },
    { product_id: 'rot', ingredient_id: 'gewuerz', qty_per_unit: 0.1 },
  ];
  const { rows, total } = buildShoppingList({ items, terms, recipe });
  const by = Object.fromEntries(rows.map((r) => [r.item.id, r]));
  assert.deepEqual(Object.keys(by), ['wein', 'gewuerz', 'stella']);
  assert.deepEqual([by.wein.need, by.wein.packs, by.wein.cost], [6, 1, 27]);
  assert.deepEqual([by.gewuerz.need, by.gewuerz.packs, by.gewuerz.cost], [3, 3, 0]);
  assert.deepEqual([by.stella.need, by.stella.packs, by.stella.cost], [25, 2, 52.8]);
  assert.equal(total, 79.8);
});

test('ingredient needs of several products are grouped; terms as plain object', () => {
  const terms = {
    rot: { planned_qty: 10 },
    stella: { planned_qty: 5 },
    wein: { pack_size: 1, buy_price: 3 },
  };
  const recipe = [
    { product_id: 'rot', ingredient_id: 'wein', qty_per_unit: 0.25 },
    { product_id: 'stella', ingredient_id: 'wein', qty_per_unit: 0.1 },
  ];
  const { rows, total } = buildShoppingList({ items, terms, recipe });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].need, 3);
  assert.equal(rows[0].packs, 3);
  assert.equal(total, 9);
});

test('empty input', () => {
  assert.deepEqual(buildShoppingList({ items: [], terms: {}, recipe: [] }), { rows: [], total: 0 });
});
