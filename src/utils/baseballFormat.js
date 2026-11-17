// Small pure helpers shared by the Baseball tables.

export const money = (value, locale = 'de-DE') => Number(value || 0).toLocaleString(locale, { style: 'currency', currency: 'EUR' });

/** Number of teams per field id (teams without a field are not counted). */
export const countTeamsPerField = (teams) => {
  const counts = new Map();
  for (const t of teams || []) {
    if (t?.field_id != null) counts.set(t.field_id, (counts.get(t.field_id) || 0) + 1);
  }
  return counts;
};

/** "09:00–14:30 Uhr", "ab 16:30 Uhr" (open end) or '' (no time). */
export const shiftTimeLabel = (s) => {
  if (s?.start_time && s?.end_time) return `${s.start_time}–${s.end_time} Uhr`;
  if (s?.start_time) return `ab ${s.start_time} Uhr`;
  return '';
};
