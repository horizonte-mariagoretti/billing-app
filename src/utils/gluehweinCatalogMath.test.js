// Run: node --test src/utils/gluehweinCatalogMath.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemEconomics, recipeCostPerUnit } from './gluehweinCatalogMath.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('bought product: cost per unit, margin, packs, revenue, profit', () => {
  const e = itemEconomics({ sell_price: 1, buy_pack_price: 14, pack_size: 20, planned_qty: 160 });
  close(e.cost, 0.7);
  close(e.margin, 0.3);
  close(e.marginPct, 0.3);
  assert.equal(e.packsToBuy, 8);
  assert.equal(e.revenue, 160);
  close(e.profit, 48);
});

test('content 0 / missing price -> null cost, margin, profit', () => {
  const zero = itemEconomics({ sell_price: 2, buy_pack_price: 10, pack_size: 0, planned_qty: 5 });
  assert.deepEqual([zero.cost, zero.margin, zero.marginPct, zero.packsToBuy, zero.profit], [null, null, null, null, null]);
  assert.equal(zero.revenue, 10);
  const noPrice = itemEconomics({ sell_price: 2, buy_pack_price: null, pack_size: 24, planned_qty: 30 });
  assert.deepEqual([noPrice.cost, noPrice.margin, noPrice.profit], [null, null, null]);
  assert.equal(noPrice.packsToBuy, 2);
  const noSell = itemEconomics({ sell_price: '', buy_pack_price: 12, pack_size: 24, planned_qty: 30 });
  assert.deepEqual([noSell.margin, noSell.revenue, noSell.profit], [null, null, null]);
  close(noSell.cost, 0.5);
});

test('ceil packs ignores float noise', () => {
  assert.equal(itemEconomics({ pack_size: 0.1, planned_qty: 0.3, buy_pack_price: 1 }).packsToBuy, 3);
  assert.equal(itemEconomics({ pack_size: 24, planned_qty: 25, buy_pack_price: 1 }).packsToBuy, 2);
  assert.equal(itemEconomics({ pack_size: 24, planned_qty: 0, buy_pack_price: 1 }).packsToBuy, 0);
});

test('negative margin and sell 0', () => {
  const neg = itemEconomics({ sell_price: 0.5, buy_pack_price: 24, pack_size: 24, planned_qty: 10 });
  close(neg.margin, -0.5);
  close(neg.marginPct, -1);
  close(neg.profit, -5);
  const free = itemEconomics({ sell_price: 0, buy_pack_price: 24, pack_size: 24, planned_qty: 10 });
  assert.equal(free.marginPct, null);
  close(free.margin, -1);
});

test('recipe product: recipe cost, no packs', () => {
  const e = itemEconomics({ sell_price: 3.5, buy_pack_price: 99, pack_size: 1, planned_qty: 100, recipeCost: 1.2 });
  close(e.cost, 1.2);
  close(e.margin, 2.3);
  assert.equal(e.packsToBuy, null);
  close(e.profit, 230);
});

test('recipeCostPerUnit sums qty × ingredient price (Map, object, array; missing price = 0)', () => {
  const recipe = [
    { ingredient_id: 'wein', qty_per_unit: 0.2 },
    { ingredient_id: 'becher', qty_per_unit: 1 },
    { ingredient_id: 'gewuerz', qty_per_unit: 0.1 },
  ];
  const terms = { wein: { buy_price: 4.5 }, becher: { buy_price: 0.12 }, gewuerz: { buy_price: null } };
  assert.equal(recipeCostPerUnit(recipe, terms), 1.02);
  assert.equal(recipeCostPerUnit(recipe, new Map(Object.entries(terms))), 1.02);
  assert.equal(recipeCostPerUnit(recipe, Object.entries(terms).map(([id, t]) => ({ id, ...t }))), 1.02);
  assert.equal(recipeCostPerUnit([], terms), null);
  assert.equal(recipeCostPerUnit(null, terms), null);
});
