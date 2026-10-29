// Glühwein (and other Verkaufsaktionen) Kasse & Saldo: pure helpers (no DB, no React).
//
// One Kasse per event (action + year). Start cash and Wechselgeld are only used to check the counted cash;
// they never count into the Saldo. Saldo = sum of income entries − sum of expense entries.

import { isoDate, salesActionMonthKey } from './lasagnaFinance.js';

const round2 = (n) => Math.round(n * 100) / 100;
const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** Sum of qty × unit_price over the Kasse lines, rounded to 2 decimals. */
export const kasseTotal = (lines) => round2(
  (lines || []).reduce((sum, l) => sum + num(l.qty) * num(l.unit_price), 0)
);

/**
 * Counted cash − start cash − Wechselgeld − Kasse total (2 decimals). Positive = surplus.
 * null while nothing is counted yet (counted null/undefined/'').
 */
export const kasseDifference = ({ counted, start, wechselgeld, total }) => {
  if (counted === null || counted === undefined || String(counted).trim() === '') return null;
  return round2(num(counted) - num(start) - num(wechselgeld) - num(total));
};

/** entries: [{ kind, amount }] -> { income, expense, saldo } (2 decimals). */
export const saldo = (entries) => {
  let income = 0;
  let expense = 0;
  for (const e of entries || []) {
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
