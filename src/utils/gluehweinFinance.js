// Glühwein (and other Verkaufsaktionen) Kasse & Saldo: pure helpers (no DB, no React).
//
// One Kasse per event (action + year): card payments + a cash count per denomination at the start and at
// the end. It counts live in the Saldo as two virtual income lines (Kasse Bargeld, Kartenzahlung).
// Saldo = sum of income (entries + Kasse lines) − sum of expense entries.

import { isoDate, salesActionMonthKey } from './lasagnaFinance.js';

const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** Cash denominations of the Bargeldkasse in cents (0,10 € … 200 €). */
export const DENOMS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

const qtyOf = (map, cents) => {
  const n = Math.trunc(Number(map?.[cents]));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Cash in the Kasse: per denomination Ende − Start (may be negative), plus the legacy amount (counted_cash of
 * older Kassen). start/end: { [cents]: qty }. Computed in integer cents.
 * -> { perDenom: [{ cents, start, end, diff, amount }], legacy, total, hasNegative }
 */
export const kasseCash = ({ start, end, legacy } = {}) => {
  let totalCents = 0;
  let hasNegative = false;
  const perDenom = DENOMS.map((cents) => {
    const s = qtyOf(start, cents);
    const e = qtyOf(end, cents);
    const diff = e - s;
    if (diff < 0) hasNegative = true;
    totalCents += diff * cents;
    return { cents, start: s, end: e, diff, amount: (diff * cents) / 100 };
  });
  const legacyCents = Math.round(num(legacy) * 100);
  totalCents += legacyCents;
  return { perDenom, legacy: legacyCents / 100, total: totalCents / 100, hasNegative };
};

/**
 * Virtual income lines of a Kasse: { start, end, counted_cash, card_amount } (fetchKasse shape) or null.
 * -> [{ key, kind: 'income', category: 'kasse_cash' | 'kasse_card', amount }], zero amounts left out.
 */
export const kasseIncome = (kasse) => {
  if (!kasse) return [];
  const out = [];
  const cash = kasseCash({ start: kasse.start, end: kasse.end, legacy: kasse.counted_cash }).total;
  if (cash !== 0) out.push({ key: 'kasse-cash', kind: 'income', category: 'kasse_cash', amount: cash });
  const card = round2(num(kasse.card_amount));
  if (card !== 0) out.push({ key: 'kasse-card', kind: 'income', category: 'kasse_card', amount: card });
  return out;
};

/** entries: [{ kind, amount }], kasse (optional): adds its income lines -> { income, expense, saldo } (2 decimals). */
export const saldo = (entries, kasse = null) => {
  let income = 0;
  let expense = 0;
  for (const e of [...(entries || []), ...kasseIncome(kasse)]) {
    if (e.kind === 'income') income += num(e.amount);
    else expense += num(e.amount);
  }
  return { income: round2(income), expense: round2(expense), saldo: round2(income - expense) };
};

/**
 * 'YYYY-MM' the Saldo counts in: month of the earliest sales day, else the action's default month
 * (salesActionMonthKey without a date). action = SALES_ACTIONS entry; year = scout start year.
 */
export const saldoMonthKey = (days, action, year) => {
  const dates = (days || []).map((d) => isoDate(d?.date)).filter(Boolean).sort();
  if (dates.length) return dates[0].slice(0, 7);
  return salesActionMonthKey(action, year, undefined);
};
