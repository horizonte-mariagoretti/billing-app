// Run: node --test src/utils/documentCalc.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcDocTotals, getItemLineTotal, roundCents } from './documentCalc.js';

test('roundCents rounds half up on binary fractions', () => {
  assert.equal(roundCents(49.995), 50);
  assert.equal(roundCents(1.005), 1.01);
});

test('lines, discount, tax and total add up to the cent', () => {
  const doc = {
    items: [{ qty: 1.5, rate: 33.33 }, { qty: 3, rate: 0.1, duration: 1 }, { qty: 1, rate: 10.005 }],
    discount_type: '%', discount_value: 10, tax_rate: 19,
  };
  const t = calcDocTotals(doc);
  const lines = doc.items.map(getItemLineTotal);
  assert.equal(t.subtotal, roundCents(lines.reduce((a, b) => a + b, 0)));
  assert.equal(t.total, roundCents(t.subtotal - t.discountAmt + t.tax));
});

test('cash payment has no tax; fixed discount is used as is', () => {
  const t = calcDocTotals({ items: [{ qty: 2, rate: 50 }], discount_type: 'EUR', discount_value: 5, tax_rate: 21, payment_mode: 'cash' });
  assert.deepEqual([t.subtotal, t.discountAmt, t.tax, t.total], [100, 5, 0, 95]);
});
