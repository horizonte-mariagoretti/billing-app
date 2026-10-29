import { useCallback } from 'react';
import useDatabase from './useDatabase';
import useLasagnen from './useLasagnen';
import useSettings from './useSettings';
import { SALES_ACTIONS, lasagnaSaldo, salesActionMonthKey } from '../utils/lasagnaFinance';

// Saldo of every Verkaufsaktion per scout year, for the Dashboard Umsatz.
// Returns [{ action, year, monthKey, saldo }] (zero saldos left out).
const useSalesActions = () => {
  const { query } = useDatabase();
  const { fetchOrders } = useLasagnen();
  const { loadYearSettings } = useSettings();

  const fetchSalesActionSaldi = useCallback(async () => {
    const years = await query('SELECT year FROM app_years ORDER BY year');
    const out = [];
    for (const { year } of years) {
      const y = Number(year);
      const [settings, orders, manual] = await Promise.all([
        loadYearSettings(y),
        fetchOrders(y),
        query('SELECT kind, amount FROM lasagna_expenses WHERE year = ?', [y]),
      ]);
      const lasagnen = SALES_ACTIONS.find((a) => a.key === 'lasagnen');
      const saldo = lasagnaSaldo({ orders, settings, manual });
      if (saldo !== 0) {
        out.push({ action: lasagnen.key, year: y, monthKey: salesActionMonthKey(lasagnen, y, settings[lasagnen.dateKey]), saldo });
      }
    }
    return out;
  }, [query, fetchOrders, loadYearSettings]);

  return { fetchSalesActionSaldi };
};

export default useSalesActions;
