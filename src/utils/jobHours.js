// Pure helpers for Arbeiten (jobs) time math. No DB, no React.

const parseHHMM = (value) => {
  if (!value || typeof value !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
};

/**
 * Hours between two "HH:MM" times, rounded to 2 decimals.
 * An end time earlier than the start time is treated as past midnight
 * (18:30–00:40 → 6.17). Returns null for open-end jobs or missing/invalid times.
 */
export function computeHours(start, end, openEnd) {
  if (openEnd) return null;
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  if (s == null || e == null) return null;
  let diff = e - s;
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
}

/**
 * '18:30 – 00:40', 'ab 19:30' (open end), or '' when no start time.
 */
export function formatTimeRange(start, end, openEnd, openPrefix = 'ab') {
  if (!start) return '';
  if (openEnd || !end) return `${openPrefix} ${start}`;
  return `${start} – ${end}`;
}

/**
 * Age in full years from an ISO date (YYYY-MM-DD). Returns null if invalid.
 */
export function calcAge(birthDateISO, today = new Date()) {
  if (!birthDateISO) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birthDateISO));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  let age = today.getFullYear() - y;
  const curMonth = today.getMonth() + 1;
  if (curMonth < mo || (curMonth === mo && today.getDate() < d)) age -= 1;
  return age < 0 ? null : age;
}
