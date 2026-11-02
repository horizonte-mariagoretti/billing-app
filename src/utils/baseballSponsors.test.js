// Run: node --test src/utils/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPONSOR_ART, SPONSOR_STATUS, statusMeta, findDuplicate, materialText } from './baseballSponsors.js';

test('constants keep the DB values', () => {
  assert.deepEqual(SPONSOR_ART.map((a) => a.value), ['Material', 'Geld', 'Feld']);
  assert.deepEqual(SPONSOR_STATUS.map((s) => s.value), ['offen', 'angefragt', 'zugesagt', 'abgesagt']);
});

test('statusMeta', () => {
  assert.deepEqual(statusMeta('offen'), { label: 'Offen', icon: 'circle', tone: 'open' });
  assert.deepEqual(statusMeta('angefragt'), { label: 'Kontaktiert', icon: 'clock', tone: 'contacted' });
  assert.deepEqual(statusMeta('zugesagt'), { label: 'Zugesagt', icon: 'check', tone: 'approved' });
  assert.deepEqual(statusMeta('abgesagt'), { label: 'Abgelehnt', icon: 'cross', tone: 'refused' });
  assert.deepEqual(statusMeta('xyz'), { label: 'Offen', icon: 'circle', tone: 'open' });
  assert.deepEqual(statusMeta(undefined), { label: 'Offen', icon: 'circle', tone: 'open' });
});

test('findDuplicate: trimmed, case-insensitive', () => {
  const lib = [{ id: 1, name: 'Bäckerei Max' }, { id: 2, name: 'Bank' }];
  assert.equal(findDuplicate(lib, '  bank ').id, 2);
  assert.equal(findDuplicate(lib, 'BÄCKEREI MAX').id, 1);
  assert.equal(findDuplicate(lib, 'Banken'), null);
  assert.equal(findDuplicate(lib, '   '), null);
  assert.equal(findDuplicate(null, 'Bank'), null);
});

test('materialText', () => {
  assert.equal(materialText({ material_out: 'Tische', material_in: 'Bänke' }), 'Raus: Tische · Rein: Bänke');
  assert.equal(materialText({ material_out: '', material_in: 'Bänke' }), 'Rein: Bänke');
  assert.equal(materialText({ material_out: ' Zelt ' }), 'Raus: Zelt');
  assert.equal(materialText({}), '');
  assert.equal(materialText(null), '');
});
