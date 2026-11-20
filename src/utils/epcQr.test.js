import { test } from 'node:test';
import assert from 'node:assert/strict';
import { epcPayload, qrMatrix, paymentReference, invoiceQr } from './epcQr.js';

test('epcPayload builds the BCD v002 lines', () => {
  const p = epcPayload({ name: 'Scouts', iban: 'be68 5390 0754 7034', bic: 'npbabebb', amount: 12.5, reference: 'INV-1' });
  assert.equal(p, 'BCD\n002\n1\nSCT\nNPBABEBB\nScouts\nBE68539007547034\nEUR12.50\n\n\nINV-1');
});

test('epcPayload returns null without IBAN or amount', () => {
  assert.equal(epcPayload({ name: 'X', iban: '', amount: 5 }), null);
  assert.equal(epcPayload({ name: 'X', iban: 'BE68539007547034', amount: 0 }), null);
});

test('paymentReference prefers the title, falls back to the number', () => {
  assert.equal(paymentReference({ title: ' Glühwein 2026 ', number: 'R-1' }), 'Glühwein 2026');
  assert.equal(paymentReference({ title: '', number: 'R-1' }), 'R-1');
});

test('invoiceQr only for open EUR invoices with an IBAN', () => {
  const sender = { company_name: 'Scouts', company_iban: 'BE68539007547034' };
  const inv = { type: 'invoice', number: 'R-1', status: 'sent', currency: 'EUR' };
  assert.ok(invoiceQr(inv, sender, 10));
  assert.ok(invoiceQr({ ...inv, status: 'draft' }, sender, 10));
  assert.equal(invoiceQr({ ...inv, type: 'quote' }, sender, 10), null);
  assert.equal(invoiceQr({ ...inv, currency: 'USD' }, sender, 10), null);
  assert.equal(invoiceQr(inv, { company_name: 'Scouts' }, 10), null);
  assert.equal(invoiceQr({ ...inv, status: 'paid' }, sender, 10), null);
  assert.equal(invoiceQr({ ...inv, status: 'cancelled' }, sender, 10), null);
});

test('qrMatrix is square', () => {
  const m = qrMatrix('hello');
  assert.ok(m.length >= 21 && m.every((r) => r.length === m.length));
});
