// Run: node --test src/utils/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kasseTotal, kasseDifference, saldo, saldoMonthKey } from './gluehweinFinance.js';
import { SALES_ACTIONS } from './lasagnaFinance.js';

const gluehwein = SALES_ACTIONS.find((a) => a.key === 'gluehwein');
const baseball = SALES_ACTIONS.find((a) => a.key === 'baseball');

test('kasseTotal sums qty × price and rounds to 2 decimals', () => {
  assert.equal(kasseTotal([{ qty: 3, unit_price: 0.1 }]), 0.3);
  assert.equal(kasseTotal([{ qty: 3, unit_price: 3.5 }, { qty: 2, unit_price: '2,25' }]), 15);
  assert.equal(kasseTotal([{ qty: 1, unit_price: 1.005 }, { qty: 1, unit_price: 1.001 }]), 2.01);
  assert.equal(kasseTotal([]), 0);
  assert.equal(kasseTotal(null), 0);
});

test('kasseDifference is null while nothing is counted', () => {
  assert.equal(kasseDifference({ counted: null, start: 100, wechselgeld: 0, total: 50 }), null);
  assert.equal(kasseDifference({ counted: '', start: 100, wechselgeld: 0, total: 50 }), null);
  assert.equal(kasseDifference({ counted: undefined, start: 100, wechselgeld: 0, total: 50 }), null);
});

test('kasseDifference = counted − start − wechselgeld − total', () => {
  assert.equal(kasseDifference({ counted: 260.3, start: 100, wechselgeld: 10, total: 150.1 }), 0.2);
  assert.equal(kasseDifference({ counted: 0, start: 0, wechselgeld: 0, total: 5 }), -5);
});

test('saldo sums entries only; start cash is never part of it', () => {
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
