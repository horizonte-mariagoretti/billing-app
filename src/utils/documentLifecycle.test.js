// Run: TZ=Europe/Berlin node --test src/utils/documentLifecycle.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOverdue } from './documentLifecycle.js';

const inv = (due_date) => ({ type: 'invoice', status: 'sent', due_date });

test('due today is not overdue until the day is over', () => {
  assert.equal(isOverdue(inv('2026-03-10'), new Date(2026, 2, 10, 23, 0)), false);
  assert.equal(isOverdue(inv('2026-03-10'), new Date(2026, 2, 11, 0, 5)), true);
});

test('only sent invoices with a due date can be overdue', () => {
  assert.equal(isOverdue({ type: 'invoice', status: 'paid', due_date: '2020-01-01' }), false);
  assert.equal(isOverdue({ type: 'quote', status: 'sent', due_date: '2020-01-01' }), false);
  assert.equal(isOverdue(inv(null)), false);
});
