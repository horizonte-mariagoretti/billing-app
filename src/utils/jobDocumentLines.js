// Pure helpers that turn a job (Arbeit) into offer/invoice line items.
// No DB, no React — shared by JobDocumentDialog (Arbeiten) and
// JobLinesDialog ("Aus Arbeit laden…" in the document editor).
import { computeHours } from './jobHours.js';
import { HORI_HOURS_PRODUCT } from '../constants.js';

/** Default line name when the wage is entered manually / no product is picked. */
export const DEFAULT_JOB_LINE_NAME = 'Arbeitsstunden Horizonte';

const round2 = (n) => Math.round(n * 100) / 100;

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const pad2 = (n) => String(n).padStart(2, '0');

const parseClock = (value) => {
  if (!value || typeof value !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
};

const fmtClock = (minutes) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
};

const withSuffix = (text, suffix) => (suffix ? `${text} ${suffix}` : text);

/**
 * Hours that count for one Hori on a document of `type`:
 * offer ('quote') = planned_hours; invoice = actual_hours, or planned_hours
 * when actual is empty/null. Returns null when nothing usable is set.
 */
export function horiDocumentHours(assignment, type) {
  if (type === 'invoice') {
    const actual = toNum(assignment?.actual_hours);
    if (actual !== null) return actual;
  }
  return toNum(assignment?.planned_hours);
}

/**
 * Group a job's Horis by hours → [{ hours, count }], sorted by hours desc.
 * Hours are rounded to 2 decimals first (7 and 7.0 group together);
 * Horis without usable hours (null / <= 0) are left out.
 */
export function groupHoriHours(assignments, type) {
  const counts = new Map();
  (assignments || []).forEach((a) => {
    const h = horiDocumentHours(a, type);
    if (h === null) return;
    const hours = round2(h);
    if (!(hours > 0)) return;
    counts.set(hours, (counts.get(hours) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([hours, count]) => ({ hours, count }))
    .sort((a, b) => b.hours - a.hours);
}

/**
 * "HH:MM - HH:MM <suffix>" from a start time plus a number of hours
 * (24 h clock, wraps past midnight: 18:00 + 8 h = "18:00 - 02:00 Uhr").
 * '' when the start time is missing/invalid or hours aren't a number.
 */
export function formatClockRange(start, hours, suffix = 'Uhr') {
  const s = parseClock(start);
  const h = Number(hours);
  if (s === null || hours === null || hours === '' || !Number.isFinite(h)) return '';
  return withSuffix(`${fmtClock(s)} - ${fmtClock(s + h * 60)}`, suffix);
}

/**
 * Line items for a document created from `job`:
 * one line per distinct hours value — qty = number of Horis, duration =
 * hours, rate = hourly wage, description (Bemerkung) = start time + hours.
 * Without any Hori hours: a single line, qty 1, duration = the job's span
 * (start → end) or 1, Bemerkung = the job's own time range.
 */
export function buildJobItems({ job, type, name, rate, clockSuffix = 'Uhr', openPrefix = 'ab' }) {
  const lineName = String(name ?? '').trim() || DEFAULT_JOB_LINE_NAME;
  const rateNum = toNum(rate);
  const wage = rateNum !== null && rateNum > 0 ? round2(rateNum) : 0;
  const groups = groupHoriHours(job?.assignments, type);

  if (groups.length) {
    return groups.map((g) => ({
      id: crypto.randomUUID(),
      name: lineName,
      description: formatClockRange(job?.start_time, g.hours, clockSuffix),
      qty: g.count,
      duration: g.hours,
      rate: wage,
    }));
  }

  const span = computeHours(job?.start_time, job?.end_time, !!job?.open_end);
  const duration = span !== null && span > 0 ? span : 1;
  const start = parseClock(job?.start_time);
  let description = '';
  if (start !== null) {
    const end = parseClock(job?.end_time);
    description = !job?.open_end && end !== null
      ? withSuffix(`${fmtClock(start)} - ${fmtClock(end)}`, clockSuffix)
      : withSuffix(`${openPrefix} ${fmtClock(start)}`, clockSuffix);
  }
  return [{
    id: crypto.randomUUID(),
    name: lineName,
    description,
    qty: 1,
    duration,
    rate: wage,
  }];
}

/** Net sum of line items (qty × duration × rate), rounded to cents. */
export function jobItemsTotal(items) {
  return round2((items || []).reduce(
    (s, it) => s + (Number(it.qty) || 0) * (Number(it.duration ?? 1) || 0) * (Number(it.rate) || 0),
    0
  ));
}

// ── Product helpers (rate source "Aus Produkt") ──────────────────────────────

/** Display name of a product (app is DE/FR; plain `name` is legacy). */
export const productLabel = (p) => (p ? (p.name_de || p.name_fr || p.name || '') : '');

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Product to preselect: the one named like HORI_HOURS_PRODUCT (any of
 * name/name_de/name_fr, case/space-insensitive), else the first with unit
 * 'hour', else null.
 */
export function pickDefaultProduct(products) {
  const list = products || [];
  const target = norm(HORI_HOURS_PRODUCT);
  return list.find((p) => [p.name, p.name_de, p.name_fr].some((n) => norm(n) === target))
    || list.find((p) => p.unit === 'hour')
    || null;
}
