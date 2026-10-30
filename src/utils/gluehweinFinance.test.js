// Run: node --test src/utils/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saldo, saldoMonthKey, DENOMS, kasseCash, kasseIncome } from './gluehweinFinance.js';
import { SALES_ACTIONS } from './lasagnaFinance.js';

const gluehwein = SALES_ACTIONS.find((a) => a.key === 'gluehwein');
const baseball = SALES_ACTIONS.find((a) => a.key === 'baseball');

test('saldo sums income minus expense entries', () => {
  const r = saldo([
    { kind: 'income', amount: 300.1 },
    { kind: 'income', amount: 0.2 },
    { kind: 'expense', amount: 120 },
  ]);
  assert.deepEqual(r, { income: 300.3, expense: 120, saldo: 180.3 });
  assert.deepEqual(saldo([]), { income: 0, expense: 0, saldo: 0 });
});

test('saldoMonthKey uses the earliest sales day', () => {
  const days = [{ date: '2026-12-12' }, { date: '2026-11-28' }, { date: '2027-01-02' }];
  assert.equal(saldoMonthKey(days, gluehwein, 2026), '2026-11');
});

test('saldoMonthKey without days falls back to the half-year default', () => {
  assert.equal(saldoMonthKey([], gluehwein, 2026), '2026-12');
  assert.equal(saldoMonthKey([], baseball, 2026), '2027-06');
  assert.equal(saldoMonthKey([{ date: 'bad' }], gluehwein, 2026), '2026-12');
});

test('DENOMS lists the 11 cash denominations in cents', () => {
  assert.equal(DENOMS.length, 11);
  assert.deepEqual(DENOMS, [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]);
});

test('kasseCash: Ende minus Start per denomination', () => {
  const r = kasseCash({ start: { 50: 10 }, end: { 50: 14, 20000: 2 } });
  assert.equal(r.total, 402);
  const half = r.perDenom.find((d) => d.cents === 50);
  assert.deepEqual(half, { cents: 50, start: 10, end: 14, diff: 4, amount: 2 });
  assert.equal(r.perDenom.find((d) => d.cents === 20000).amount, 400);
  assert.equal(r.hasNegative, false);
});

test('kasseCash is float safe (0,10 + 0,20)', () => {
  assert.equal(kasseCash({ end: { 10: 1, 20: 1 } }).total, 0.3);
  assert.equal(kasseCash({ end: { 10: 3 } }).total, 0.3);
});

test('kasseCash allows a negative difference and flags it', () => {
  const r = kasseCash({ start: { 100: 5 }, end: { 100: 2, 500: 1 } });
  assert.equal(r.total, 2);
  assert.equal(r.perDenom.find((d) => d.cents === 100).diff, -3);
  assert.equal(r.hasNegative, true);
});

test('kasseCash with missing denominations and legacy amount', () => {
  assert.equal(kasseCash().total, 0);
  assert.equal(kasseCash({ start: {}, end: { 1000: 'x' } }).total, 0);
  assert.equal(kasseCash({ end: { 1000: 2 }, legacy: 1840.5 }).total, 1860.5);
  assert.equal(kasseCash({ legacy: null }).legacy, 0);
});

test('kasseIncome skips zero lines', () => {
  assert.deepEqual(kasseIncome(null), []);
  assert.deepEqual(kasseIncome({ start: {}, end: {}, counted_cash: null, card_amount: null }), []);
  assert.deepEqual(kasseIncome({ start: {}, end: { 500: 2 }, card_amount: 0 }), [
    { key: 'kasse-cash', kind: 'income', category: 'kasse_cash', amount: 10 },
  ]);
  assert.deepEqual(kasseIncome({ card_amount: 612.4 }), [
    { key: 'kasse-card', kind: 'income', category: 'kasse_card', amount: 612.4 },
  ]);
});

test('saldo adds the Kasse lines', () => {
  const kasse = { start: { 1000: 1 }, end: { 1000: 11 }, card_amount: 50.1 };
  assert.deepEqual(
    saldo([{ kind: 'income', amount: 20 }, { kind: 'expense', amount: 70.2 }], kasse),
    { income: 170.1, expense: 70.2, saldo: 99.9 }
  );
});
