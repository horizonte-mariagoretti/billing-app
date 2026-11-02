// Baseballturnier sponsors: pure helpers for the sponsor library (table `sponsors`, migration 49) and the per-year
// rows (`baseball_sponsors`). No React, no DB.

/** Kind of sponsoring (`baseball_sponsors.art`). */
export const SPONSOR_ART = [
  { value: 'Material', label: 'Material' },
  { value: 'Geld', label: 'Geld' },
  { value: 'Feld', label: 'Feld' },
];

/**
 * Status of a per-year sponsor row (`baseball_sponsors.status`). The DB values stay as they were
 * ('zugesagt' is read by the Übersicht); only the labels changed.
 */
export const SPONSOR_STATUS = [
  { value: 'offen', label: 'Offen' },
  { value: 'angefragt', label: 'Kontaktiert' },
  { value: 'zugesagt', label: 'Zugesagt' },
  { value: 'abgesagt', label: 'Abgelehnt' },
];

const STATUS_META = {
  offen: { icon: 'circle', tone: 'open' },
  angefragt: { icon: 'clock', tone: 'contacted' },
  zugesagt: { icon: 'check', tone: 'approved' },
  abgesagt: { icon: 'cross', tone: 'refused' },
};

/**
 * Display data of a status value.
 * @param {string} value DB status value.
 * @returns {{label: string, icon: 'circle'|'clock'|'check'|'cross', tone: 'open'|'contacted'|'approved'|'refused'}}
 *   Unknown values are shown as 'offen' (circle/open).
 */
export function statusMeta(value) {
  const key = STATUS_META[value] ? value : 'offen';
  const label = SPONSOR_STATUS.find((s) => s.value === key).label;
  return { label, ...STATUS_META[key] };
}

/** Comparison key of a sponsor name: trimmed, lower case. */
export function nameKey(name) {
  return String(name ?? '').trim().toLowerCase();
}

/**
 * Library row with the same name (case-insensitive, trimmed), or null.
 * @param {Array<{name: string}>} library Rows of `sponsors`.
 * @param {string} name Name to check.
 * @returns {object|null}
 */
export function findDuplicate(library, name) {
  const key = nameKey(name);
  if (!key || !Array.isArray(library)) return null;
  return library.find((row) => nameKey(row?.name) === key) ?? null;
}

/**
 * Material of a per-year row for display, e.g. "Raus: Tische · Rein: Tische"; only non-empty parts; '' if none.
 * @param {{material_out?: string, material_in?: string}} row
 * @returns {string}
 */
export function materialText(row) {
  const out = String(row?.material_out ?? '').trim();
  const back = String(row?.material_in ?? '').trim();
  return [out && `Raus: ${out}`, back && `Rein: ${back}`].filter(Boolean).join(' · ');
}
