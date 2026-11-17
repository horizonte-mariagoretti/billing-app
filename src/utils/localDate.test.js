// Run: node --test src/utils/localDate.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toLocalISODate, parseLocalDate } from './localDate.js';

test('toLocalISODate uses local calendar parts, not UTC', () => {
  assert.equal(toLocalISODate(new Date(2026, 0, 1, 0, 30)), '2026-01-01');
  assert.equal(toLocalISODate(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
});

test('parseLocalDate returns local midnight or null', () => {
  const d = parseLocalDate('2026-03-05');
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 2, 5, 0]);
  assert.equal(parseLocalDate(''), null);
  assert.equal(parseLocalDate('nope'), null);
});
