// Run: node --test src/utils/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saldo, saldoMonthKey } from './gluehweinFinance.js';
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
