import { useCallback } from 'react';
import useDatabase from './useDatabase';
import useSettings from './useSettings';
import useHoris from './useHoris';
import useSalesActions, { hasSaldoSource } from './useSalesActions';
import { calcTotalsFromSubtotal } from '../utils/documentCalc';
import { SALES_ACTIONS, salesActionMonthKey, isoDate } from '../utils/lasagnaFinance';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const localIso = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// 'YYYY-MM' keys of a scout year, September first.
export const scoutMonthKeys = (year) => Array.from({ length: 12 }, (_, i) => {
  const month = ((8 + i) % 12) + 1;
  return `${month >= 9 ? year : year + 1}-${String(month).padStart(2, '0')}`;
});

// Everything Dashboard 2.0 shows for one scout year (start year), in one load.
const useDashboard2 = () => {
  const { query } = useDatabase();
  const { loadYearSettings } = useSettings();
  const { fetchHoriStats } = useHoris();
  const { fetchActionSaldo } = useSalesActions();

  // Money of every Verkaufsaktion with a saldo source (Lasagnen, Glühwein) for one scout year, keyed by action.
  // Lasagnen errors propagate as before; a Glühwein failure (e.g. older DB) only drops its numbers.
  const loadActionSaldi = useCallback(async (year, settings) => {
    const entries = await Promise.all(SALES_ACTIONS.filter(hasSaldoSource).map(async (a) => {
      try {
        return [a.key, await fetchActionSaldo(a, year, settings)];
      } catch (err) {
        if (a.key === 'lasagnen') throw err;
        console.warn(`Saldo ${a.key} ${year} übersprungen:`, err);
        return [a.key, null];
      }
    }));
    return Object.fromEntries(entries);
  }, [fetchActionSaldo]);

  // Paid Rechnungen and Verkaufsaktionen Saldo per month of one scout year (used for the Vorjahr comparison).
  const loadRevenueByMonth = useCallback(async (year) => {
    const [invoiceRows, settings] = await Promise.all([
      query(`
        SELECT
          d.date, d.tax_rate, d.discount_value, d.discount_type, d.payment_mode,
          COALESCE(SUM(di.qty * di.rate * COALESCE(di.duration, 1)), 0) AS items_subtotal
        FROM documents d
        LEFT JOIN document_items di ON di.document_id = d.id
        WHERE d.type = 'invoice' AND d.status = 'paid' AND d.date BETWEEN ? AND ?
        GROUP BY d.id
      `, [`${year}-09-01`, `${year + 1}-08-31`]),
      loadYearSettings(year),
    ]);
    const saldi = await loadActionSaldi(year, settings);
    const paidByMonth = {};
    for (const inv of invoiceRows) {
      const { total } = calcTotalsFromSubtotal(inv, inv.items_subtotal);
      if (inv.date) paidByMonth[inv.date.slice(0, 7)] = (paidByMonth[inv.date.slice(0, 7)] || 0) + total;
    }
    const actionSaldi = SALES_ACTIONS
      .filter((a) => saldi[a.key])
      .map((a) => ({ monthKey: saldi[a.key].monthKey, saldo: saldi[a.key].saldo }));
    return { paidByMonth, actionSaldi };
  }, [query, loadYearSettings, loadActionSaldi]);

  const loadDashboard = useCallback(async (year) => {
    const from = `${year}-09-01`;
    const to = `${year + 1}-08-31`;
    const today = localIso();

    const [invoiceRows, quoteRows, jobRows, settings, horiStats, prev] = await Promise.all([
      query(`
        SELECT
          d.id, d.status, d.date, d.due_date, d.tax_rate, d.discount_value, d.discount_type, d.payment_mode,
          COALESCE(SUM(di.qty * di.rate * COALESCE(di.duration, 1)), 0) AS items_subtotal
        FROM documents d
        LEFT JOIN document_items di ON di.document_id = d.id
        WHERE d.type = 'invoice' AND d.date BETWEEN ? AND ?
        GROUP BY d.id
      `, [from, to]),
      query(`SELECT COUNT(*) AS n FROM documents WHERE type = 'quote' AND status IN ('draft','sent') AND date BETWEEN ? AND ?`, [from, to]),
      query(`
        SELECT
          j.id, j.title, j.date, j.start_time, j.status, j.invoice_id, c.name AS client_name,
          (SELECT COUNT(*) FROM job_assignments a WHERE a.job_id = j.id) AS people_count,
          (SELECT COALESCE(SUM(a.planned_hours), 0) FROM job_assignments a WHERE a.job_id = j.id) AS planned_hours_total,
          (SELECT COALESCE(SUM(a.actual_hours), 0) FROM job_assignments a WHERE a.job_id = j.id) AS actual_hours_total
        FROM jobs j
        LEFT JOIN clients c ON c.id = j.client_id
        WHERE j.date BETWEEN ? AND ?
        ORDER BY j.date ASC, j.start_time ASC
      `, [from, to]),
      loadYearSettings(year),
      fetchHoriStats(year),
      loadRevenueByMonth(year - 1),
    ]);

    // Rechnungen: paid revenue per month, open and overdue amounts.
    const paidByMonth = {};
    let paid = 0;
    let paidCount = 0;
    let open = 0;
    let openCount = 0;
    let overdue = 0;
    let overdueCount = 0;
    for (const inv of invoiceRows) {
      const { total } = calcTotalsFromSubtotal(inv, inv.items_subtotal);
      if (inv.status === 'paid' && inv.date) {
        paidByMonth[inv.date.slice(0, 7)] = (paidByMonth[inv.date.slice(0, 7)] || 0) + total;
        paid += total;
        paidCount += 1;
      } else if (inv.status === 'sent') {
        open += total;
        openCount += 1;
        if (inv.due_date && inv.due_date < today) {
          overdue += total;
          overdueCount += 1;
        }
      }
    }

    // Verkaufsaktionen: Lasagnen and Glühwein track money; the others just carry their date.
    const saldi = await loadActionSaldi(year, settings);
    const actions = SALES_ACTIONS.map((a) => ({
      key: a.key,
      label: a.label,
      date: isoDate(settings[a.dateKey]),
      monthKey: saldi[a.key]?.monthKey ?? salesActionMonthKey(a, year, settings[a.dateKey]),
      summary: saldi[a.key]?.summary ?? null,
    }));

    // Arbeiten.
    const upcoming = jobRows.filter((j) => j.date >= today && j.status !== 'done').slice(0, 5);
    const jobs = {
      total: jobRows.length,
      done: jobRows.filter((j) => j.status === 'done').length,
      plannedHours: round2(jobRows.reduce((n, j) => n + (Number(j.planned_hours_total) || 0), 0)),
      actualHours: round2(jobRows.reduce((n, j) => n + (Number(j.actual_hours_total) || 0), 0)),
      withoutInvoice: jobRows.filter((j) => j.date < today && !j.invoice_id).length,
      upcoming,
      dates: jobRows.map((j) => ({ date: j.date, done: j.status === 'done' })),
    };

    // Horis.
    const isOn = (r) => r.active === 1 || r.active === true;
    const activeHoris = horiStats.filter(isOn);
    const horis = {
      active: activeHoris.length,
      top: [...activeHoris]
        .filter((r) => (Number(r.total_actual_hours) || 0) > 0)
        .sort((a, b) => b.total_actual_hours - a.total_actual_hours)
        .slice(0, 5),
    };

    return {
      year,
      from,
      to,
      today,
      invoices: { paid: round2(paid), paidCount, paidByMonth, open: round2(open), openCount, overdue: round2(overdue), overdueCount },
      prev,
      quotesOpen: quoteRows[0]?.n || 0,
      actions,
      jobs,
      horis,
    };
  }, [query, loadYearSettings, fetchHoriStats, loadRevenueByMonth, loadActionSaldi]);

  return { loadDashboard };
};

export default useDashboard2;
