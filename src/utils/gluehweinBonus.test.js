// Run: node --test src/utils/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gluehweinShares, gluehweinBonusFromSettings, bonusReductionPct, applyBonus } from './gluehweinBonus.js';

test('shares: extra floored at 0, inactive rows left out', () => {
  const m = gluehweinShares([
    { hori_id: 1, shifts: 5, mandatory: 2, active: 1 }, // extra 3
    { hori_id: 2, shifts: 1, mandatory: 2, active: 1 }, // extra 0 (not −1)
    { hori_id: 3, shifts: 3, mandatory: 2, active: true }, // extra 1
    { hori_id: 4, shifts: 9, mandatory: 0, active: 0 }, // inactive
  ]);
  assert.equal(m.size, 3);
  assert.deepEqual(m.get(1), { extra: 3, sharePct: 75 });
  assert.deepEqual(m.get(2), { extra: 0, sharePct: 0 });
  assert.deepEqual(m.get(3), { extra: 1, sharePct: 25 });
  assert.equal(m.has(4), false);
});

test('shares: zero total gives 0 % each', () => {
  const m = gluehweinShares([
    { hori_id: 1, shifts: 2, mandatory: 2, active: 1 },
    { hori_id: 2, shifts: 0, mandatory: 2, active: 1 },
  ]);
  assert.deepEqual(m.get(1), { extra: 0, sharePct: 0 });
  assert.deepEqual(m.get(2), { extra: 0, sharePct: 0 });
  assert.equal(gluehweinShares([]).size, 0);
});

test('shares are rounded to 2 decimals', () => {
  const m = gluehweinShares([
    { hori_id: 1, shifts: 1, mandatory: 0, active: 1 },
    { hori_id: 2, shifts: 2, mandatory: 0, active: 1 },
  ]);
  assert.equal(m.get(1).sharePct, 33.33);
  assert.equal(m.get(2).sharePct, 66.67);
});

test('settings: defaults and factor clamp 0–100', () => {
  assert.deepEqual(gluehweinBonusFromSettings({}), { enabled: false, factor: 100, mandatory: 0 });
  assert.deepEqual(gluehweinBonusFromSettings(null), { enabled: false, factor: 100, mandatory: 0 });
  assert.equal(gluehweinBonusFromSettings({ gluehwein_bonus_factor: '150' }).factor, 100);
  assert.equal(gluehweinBonusFromSettings({ gluehwein_bonus_factor: '-5' }).factor, 0);
  assert.equal(gluehweinBonusFromSettings({ gluehwein_bonus_factor: 'abc' }).factor, 100);
  assert.equal(gluehweinBonusFromSettings({ gluehwein_bonus_factor: '50' }).factor, 50);
  const s = gluehweinBonusFromSettings({ gluehwein_bonus_enabled: '1', gluehwein_mandatory_shifts: '3' });
  assert.equal(s.enabled, true);
  assert.equal(s.mandatory, 3);
  assert.equal(gluehweinBonusFromSettings({ gluehwein_mandatory_shifts: '-2' }).mandatory, 0);
});

test('re-exported bonus helpers', () => {
  assert.equal(bonusReductionPct({ sharePct: 20, enabled: true, factor: 50 }), 10);
  assert.equal(applyBonus(70, 10), 63);
});
