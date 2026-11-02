// Run: node --test src/utils/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByField, groupTeams, roundRobin } from './baseballGroups.js';

const fields = [
  { id: 'f2', name: 'Feld 2', sort_order: 2 },
  { id: 'f1', name: 'Feld 1', sort_order: 1 },
];
const t = (id, field_id) => ({ id, field_id });

test('groupByField: teams per field in list order, unassigned, completeness', () => {
  const teams = [t('a', 'f1'), t('b', 'f2'), t('c', null), t('d', 'f1'), t('e', 'gone'), t('f', 'f1'), t('g', 'f1'), t('h')];
  const r = groupByField(teams, fields);
  assert.deepEqual(r.fields.map((f) => [f.number, f.name, f.teams.map((x) => x.id), f.complete]), [
    [1, 'Feld 1', ['a', 'd', 'f', 'g'], true],
    [2, 'Feld 2', ['b'], false],
  ]);
  assert.deepEqual(r.unassigned.map((x) => x.id), ['c', 'e', 'h']);
  assert.equal(r.total, 8);
  assert.equal(r.totalValid, true);
});

test('groupByField: empty input', () => {
  assert.deepEqual(groupByField(null, null), { fields: [], unassigned: [], total: 0, totalValid: false });
  const r = groupByField([t('a')], fields);
  assert.equal(r.totalValid, false);
  assert.deepEqual(r.fields.map((f) => f.teams.length), [0, 0]);
});

test('groupTeams / roundRobin unchanged', () => {
  assert.equal(groupTeams([1, 2, 3, 4, 5]).groups.length, 1);
  assert.equal(roundRobin([1, 2, 3, 4]).length, 6);
  assert.deepEqual(roundRobin([1, 2, 3]), []);
});
