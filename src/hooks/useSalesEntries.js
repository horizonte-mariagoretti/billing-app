import { useCallback } from 'react';
import useDatabase from './useDatabase';

// Manual entries (expenses and income) of a Verkaufsaktion per scout year. The Kasse is not stored here any
// more (it counts live, see useSalesKasse); source_kasse_id rows were removed by migration 38.
export function useSalesEntries(action) {
  const { query, run } = useDatabase();

  const assertYearOpen = useCallback(async (year) => {
    const rows = await query('SELECT locked FROM app_years WHERE year = ?', [year]);
    if (rows[0]?.locked) throw new Error('YEAR_LOCKED');
  }, [query]);

  const fetchEntries = useCallback(async (year) => {
    return await query(
      `SELECT id, kind, description, category, amount, source_kasse_id
         FROM sales_entries WHERE action = ? AND year = ?
         ORDER BY created_at DESC`,
      [action, year]
    );
  }, [query, action]);

  // entry: { id?, kind?, description, category, amount }. Without id a new row is created (kind defaults to
  // 'expense'); the kind of an existing row is never changed.
  const saveEntry = useCallback(async (year, entry) => {
    await assertYearOpen(year);
    const params = [
      String(entry.description ?? '').trim(),
      entry.category || null,
      Number(entry.amount) || 0,
    ];
    if (entry.id) {
      const rows = await query(
        'SELECT source_kasse_id FROM sales_entries WHERE id = ? AND action = ? AND year = ?',
        [entry.id, action, year]
      );
      if (rows[0]?.source_kasse_id) throw new Error('ENTRY_READONLY');
      await run(
        'UPDATE sales_entries SET description = ?, category = ?, amount = ? WHERE id = ? AND action = ? AND year = ?',
        [...params, entry.id, action, year]
      );
      return entry.id;
    }
    const id = crypto.randomUUID();
    await run(
      'INSERT INTO sales_entries (id, action, year, kind, description, category, amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, action, year, entry.kind === 'income' ? 'income' : 'expense', ...params]
    );
    return id;
  }, [query, run, action, assertYearOpen]);

  const deleteEntry = useCallback(async (id) => {
    const rows = await query('SELECT year FROM sales_entries WHERE id = ? AND action = ?', [id, action]);
    if (!rows.length) return;
    await assertYearOpen(rows[0].year);
    await run('DELETE FROM sales_entries WHERE id = ? AND action = ?', [id, action]);
  }, [query, run, action, assertYearOpen]);

  return { fetchEntries, saveEntry, deleteEntry };
}
