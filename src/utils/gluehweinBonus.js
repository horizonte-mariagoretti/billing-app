// Glühwein bonus — pure helpers (no DB).
//
// Each Hori has to work `mandatory` shifts. Extra shifts = max(0, shifts − mandatory).
// A Hori's share = their extra shifts / total extra shifts of all ACTIVE Horis (in %).
// With the bonus on, that share × factor/100 is the % by which their Lagerbeitrag is reduced (same as Lasagnen).

export { bonusReductionPct, applyBonus } from './lasagnaBonus.js';

const toCount = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const isActive = (r) => r.active === 1 || r.active === true || r.active === '1';
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * rows: [{ hori_id, shifts, mandatory, active }]
 * Returns Map hori_id -> { extra, sharePct } for active rows only (sharePct rounded to 2 decimals, 0 when no extra shifts).
 */
export function gluehweinShares(rows) {
  const active = (rows || []).filter(isActive);
  const extras = active.map((r) => [r.hori_id, Math.max(0, toCount(r.shifts) - toCount(r.mandatory))]);
  const total = extras.reduce((s, [, e]) => s + e, 0);
  return new Map(extras.map(([id, extra]) => [id, { extra, sharePct: total > 0 ? round2((100 * extra) / total) : 0 }]));
}

/** Reads bonus switch, factor (0–100, default 100) and mandatory shift count (whole number ≥ 0, default 0). */
export function gluehweinBonusFromSettings(settings) {
  const enabled = String(settings?.gluehwein_bonus_enabled ?? '0') === '1';
  const raw = String(settings?.gluehwein_bonus_factor ?? '').trim();
  const f = raw === '' ? 100 : Number(raw);
  const factor = Number.isFinite(f) ? Math.min(100, Math.max(0, f)) : 100;
  return { enabled, factor, mandatory: toCount(settings?.gluehwein_mandatory_shifts) };
}
