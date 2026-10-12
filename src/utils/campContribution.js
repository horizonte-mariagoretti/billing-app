/**
 * Lagerbeitrag (camp contribution) for one Hori.
 *
 * base        max contribution in euros (no work done)
 * minimum     floor in euros — contribution never drops below this
 * perPercent  euros deducted per 1% share of total worked hours.
 *             0/empty = proportional mode: base × share%.
 * sharePct    Hori's share of all worked hours, 0–100
 */
export function calcContribution({ base, minimum = 0, perPercent = 0, sharePct = 0 }) {
  const b = Math.max(0, Number(base) || 0);
  const min = Math.min(b, Math.max(0, Number(minimum) || 0));
  const share = Math.max(0, Math.min(100, Number(sharePct) || 0));
  const step = Number(perPercent) || 0;
  const reduction = step > 0 ? step * share : (b * share) / 100;
  return Math.round(Math.max(min, b - reduction) * 100) / 100;
}

export function campRulesFromSettings(settings) {
  return {
    base: settings?.camp_base_contribution,
    minimum: settings?.camp_min_contribution,
    perPercent: settings?.camp_reduction_per_percent,
  };
}
