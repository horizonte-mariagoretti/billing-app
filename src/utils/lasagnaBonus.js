// Lasagnen bonus — pure helpers (no DB).
//
// A Hori's lasagne share = their Bolo + Veggie count / total Bolo + Veggie of all ACTIVE Horis (in %).
// With the bonus on, that share × factor/100 is the % by which their Lagerbeitrag is reduced.
// Example: Beitrag 70 €, share 10 %, factor 100 → reduction 10 % → 63 €. Factor 50 → 5 % → 66,50 €.

const toCount = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const isActive = (r) => r.active === 1 || r.active === true || r.active === '1';
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * rows: [{ hori_id, bolo, veggie, active }]
 * Returns Map hori_id -> { count, sharePct } for active rows only (sharePct rounded to 2 decimals).
 */
export function lasagnaShares(rows) {
  const active = (rows || []).filter(isActive);
  const counts = active.map((r) => [r.hori_id, toCount(r.bolo) + toCount(r.veggie)]);
  const total = counts.reduce((s, [, c]) => s + c, 0);
  return new Map(counts.map(([id, count]) => [id, { count, sharePct: total > 0 ? round2((100 * count) / total) : 0 }]));
}

/** Reduction in % of the Lagerbeitrag: sharePct × factor / 100 when enabled, else 0. */
export function bonusReductionPct({ sharePct, enabled, factor }) {
  if (!enabled) return 0;
  const f = Number(factor);
  // Capped at 100 % so the Lagerbeitrag can never go negative.
  return Math.min(100, (Number(sharePct) || 0) * (Number.isFinite(f) ? f : 100) / 100);
}

/** Contribution reduced by reductionPct %, rounded to cents. */
export function applyBonus(contribution, reductionPct) {
  return Math.round((Number(contribution) || 0) * (1 - (Number(reductionPct) || 0) / 100) * 100) / 100;
}

/** Reads the bonus switch + factor from a settings object (missing keys: off, factor 100). */
export function lasagnaBonusFromSettings(settings) {
  const enabled = String(settings?.lasagna_bonus_enabled ?? '0') === '1';
  const raw = String(settings?.lasagna_bonus_factor ?? '').trim();
  const f = raw === '' ? 100 : Number(raw);
  return { enabled, factor: Number.isFinite(f) && f >= 0 ? Math.min(f, 100) : 100 };
}
