import { useCallback } from 'react';
import useDatabase from './useDatabase';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// True for a real calendar date in 'YYYY-MM-DD' form (rejects 2026-02-30 etc.).
const isValidDate = (value) => {
  const m = DATE_RE.exec(String(value ?? ''));
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
};

// Sale days of a Verkaufsaktion (action = SALES_ACTIONS key) per scout year.
export function useSalesDays(action) {
  const { query, run } = useDatabase();

  const assertYearOpen = useCallback(async (year) => {
    const rows = await query('SELECT locked FROM app_years WHERE year = ?', [year]);
    if (rows[0]?.locked) throw new Error('YEAR_LOCKED');
  }, [query]);

  const fetchDays = useCallback(async (year) => {
    return await query(
      'SELECT id, date FROM sales_days WHERE action = ? AND year = ? ORDER BY date ASC',
      [action, year]
    );
  }, [query, action]);

  const addDay = useCallback(async (year, date) => {
    if (!isValidDate(date)) throw new Error('INVALID_DATE');
    await assertYearOpen(year);
    const existing = await query(
      'SELECT id FROM sales_days WHERE action = ? AND year = ? AND date = ?',
      [action, year, date]
    );
    if (existing.length) throw new Error('DAY_EXISTS');
    const id = crypto.randomUUID();
    try {
      await run(
        'INSERT INTO sales_days (id, action, year, date) VALUES (?, ?, ?, ?)',
        [id, action, year, date]
      );
    } catch (err) {
      if (/UNIQUE/i.test(String(err?.message))) throw new Error('DAY_EXISTS');
      throw err;
    }
    return id;
  }, [query, run, action, assertYearOpen]);

  // Shifts and their assignments go with the day (ON DELETE CASCADE).
  const deleteDay = useCallback(async (id) => {
    const rows = await query('SELECT year FROM sales_days WHERE id = ? AND action = ?', [id, action]);
    if (!rows.length) return;
    await assertYearOpen(rows[0].year);
    await run('DELETE FROM sales_days WHERE id = ? AND action = ?', [id, action]);
  }, [query, run, action, assertYearOpen]);

  return { fetchDays, addDay, deleteDay };
}
