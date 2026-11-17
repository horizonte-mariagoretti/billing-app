// Local-calendar date helpers. `date.toISOString()` converts to UTC first, which
// returns yesterday's date shortly after local midnight east of UTC (e.g. Germany).

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' of a Date in the local time zone. */
export const toLocalISODate = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Local-midnight Date of a 'YYYY-MM-DD' string, or null if it is not one. */
export const parseLocalDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
};
