import { useCallback } from 'react';
import useDatabase from './useDatabase';
import useLasagnen from './useLasagnen';
import useSettings from './useSettings';
import { SALES_ACTIONS, lasagnaSummary, salesActionMonthKey } from '../utils/lasagnaFinance';
import { saldo as entriesSaldo, saldoMonthKey } from '../utils/gluehweinFinance';
import { loadKasse } from './useSalesKasse';

// Where the money of a Verkaufsaktion comes from. Actions missing here (Baseball) track no money yet.
//   lasagna: Übersicht orders + lasagna_expenses (lasagnaSummary)
//   entries: sales_entries income − expense + the Kasse live (Bargeld + Kartenzahlung, kasseIncome)
const SALDO_SOURCE = { lasagnen: 'lasagna', gluehwein: 'entries' };

export const hasSaldoSource = (action) => Boolean(SALDO_SOURCE[action?.key]);

// Saldo of every Verkaufsaktion per scout year, for the Dashboard Umsatz.
const useSalesActions = () => {
  const { query } = useDatabase();
  const { fetchOrders } = useLasagnen();
  const { loadYearSettings } = useSettings();

  // Money of one action in one scout year: { saldo, monthKey, summary } or null (no saldo source).
  // settings = year settings of that year (for the action date and the Lasagnen prices).
  // summary: lasagnen -> lasagnaSummary(...); entries -> { saldo, income, expenses, days }.
  const fetchActionSaldo = useCallback(async (action, year, settings) => {
    const source = SALDO_SOURCE[action.key];
    if (source === 'lasagna') {
      const [orders, manual] = await Promise.all([
        fetchOrders(year),
        query('SELECT kind, amount FROM lasagna_expenses WHERE year = ?', [year]),
      ]);
      const summary = lasagnaSummary({ orders, settings, manual });
      return { saldo: summary.saldo, monthKey: salesActionMonthKey(action, year, settings[action.dateKey]), summary };
    }
    if (source === 'entries') {
      const [entries, days, kasse] = await Promise.all([
        query('SELECT kind, amount FROM sales_entries WHERE action = ? AND year = ?', [action.key, year]),
        query('SELECT date FROM sales_days WHERE action = ? AND year = ? ORDER BY date ASC', [action.key, year]),
        loadKasse(query, action.key, year),
      ]);
      const s = entriesSaldo(entries, kasse);
      // Month of the first sales day; without days the action date set next to the year switcher, else the default month.
      const dateKey = settings?.[action.dateKey];
      const monthDays = days.length ? days : (dateKey ? [{ date: dateKey }] : []);
      return {
        saldo: s.saldo,
        monthKey: saldoMonthKey(monthDays, action, year),
        summary: { saldo: s.saldo, income: s.income, expenses: s.expense, days: days.length },
      };
    }
    return null;
  }, [query, fetchOrders]);

  // Returns [{ action, year, monthKey, saldo }] (zero saldos left out).
  const fetchSalesActionSaldi = useCallback(async () => {
    const years = await query('SELECT year FROM app_years ORDER BY year');
    const out = [];
    for (const { year } of years) {
      const y = Number(year);
      const settings = await loadYearSettings(y);
      const results = await Promise.all(SALES_ACTIONS.filter(hasSaldoSource).map(async (a) => {
        try {
          return [a, await fetchActionSaldo(a, y, settings)];
        } catch (err) {
          // An older DB without the Glühwein tables must not hide the Lasagnen Saldo.
          if (a.key === 'lasagnen') throw err;
          console.warn(`Saldo ${a.key} ${y} übersprungen:`, err);
          return [a, null];
        }
      }));
      for (const [a, r] of results) {
        if (r && r.saldo !== 0) out.push({ action: a.key, year: y, monthKey: r.monthKey, saldo: r.saldo });
      }
    }
    return out;
  }, [query, loadYearSettings, fetchActionSaldo]);

  return { fetchSalesActionSaldi, fetchActionSaldo };
};

export default useSalesActions;
