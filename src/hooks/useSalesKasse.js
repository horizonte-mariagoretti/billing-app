import { useCallback } from 'react';
import useDatabase from './useDatabase';

// One Kasse per Verkaufsaktion (action = SALES_ACTIONS key) and scout year: one counted cash total (Bargeld).
// Once taken over (entry_id set) it is read-only; deleting the income entry unlocks it (ON DELETE SET NULL).
export function useSalesKasse(action) {
  const { query, run, transaction } = useDatabase();

  const isYearLocked = useCallback(async (year) => {
    const rows = await query('SELECT locked FROM app_years WHERE year = ?', [year]);
    return !!rows[0]?.locked;
  }, [query]);

  const loadRow = useCallback(async (year) => {
    const rows = await query(
      'SELECT id, counted_cash, entry_id FROM sales_kasse WHERE action = ? AND year = ?',
      [action, year]
    );
    return rows[0] || null;
  }, [query, action]);

  // -> { id, counted_cash, entry_id }; creates the row if missing (null in a locked year when missing).
  const fetchKasse = useCallback(async (year) => {
    const kasse = await loadRow(year);
    if (kasse) return kasse;
    if (await isYearLocked(year)) return null;
    await run(
      'INSERT OR IGNORE INTO sales_kasse (id, action, year) VALUES (?, ?, ?)',
      [crypto.randomUUID(), action, year]
    );
    return await loadRow(year);
  }, [loadRow, isYearLocked, run, action]);

  // countedCash: blank -> NULL, else a number >= 0 rounded to 2 decimals.
  const saveKasse = useCallback(async (year, countedCash) => {
    let counted = null;
    if (countedCash !== null && countedCash !== undefined && String(countedCash).trim() !== '') {
      const n = Number(String(countedCash).replace(',', '.'));
      if (!Number.isFinite(n) || n < 0) throw new Error('INVALID_AMOUNT');
      counted = Math.round(n * 100) / 100;
    }
    if (await isYearLocked(year)) throw new Error('YEAR_LOCKED');
    const kasse = await fetchKasse(year);
    if (!kasse) throw new Error('YEAR_LOCKED');
    if (kasse.entry_id) throw new Error('KASSE_TAKEN');
    // Guard on entry_id IS NULL so a concurrent take-over is not overwritten.
    const res = await run(
      'UPDATE sales_kasse SET counted_cash = ? WHERE id = ? AND entry_id IS NULL',
      [counted, kasse.id]
    );
    if (res && res.changes === 0) throw new Error('KASSE_TAKEN');
  }, [isYearLocked, fetchKasse, run]);

  // Books the counted cash as one income entry and links it. Returns the new entry id.
  const takeOverKasse = useCallback(async (year) => {
    if (await isYearLocked(year)) throw new Error('YEAR_LOCKED');
    const kasse = await loadRow(year);
    if (!kasse) throw new Error('KASSE_EMPTY');
    if (kasse.entry_id) throw new Error('ALREADY_TAKEN');
    if (!(Number(kasse.counted_cash) > 0)) throw new Error('KASSE_EMPTY');
    const entryId = crypto.randomUUID();
    let results;
    try {
      results = await transaction([
        {
          // Inserts only while the Kasse is still untaken and counted > 0; amount is read in the same statement.
          // The unique index on source_kasse_id backs this up.
          sql: `INSERT INTO sales_entries (id, action, year, kind, description, category, amount, source_kasse_id)
                SELECT ?, ?, ?, 'income', 'Kasse', 'kasse', counted_cash, id
                FROM sales_kasse WHERE id = ? AND entry_id IS NULL AND counted_cash > 0`,
          params: [entryId, action, year, kasse.id],
        },
        {
          sql: `UPDATE sales_kasse SET entry_id = ?
                WHERE id = ? AND entry_id IS NULL AND EXISTS (SELECT 1 FROM sales_entries WHERE id = ?)`,
          params: [entryId, kasse.id, entryId],
        },
      ]);
    } catch (err) {
      if (/UNIQUE/i.test(String(err?.message))) throw new Error('ALREADY_TAKEN', { cause: err });
      throw err;
    }
    if (!results?.[0]?.changes) throw new Error('ALREADY_TAKEN');
    return entryId;
  }, [isYearLocked, loadRow, transaction, action]);

  return { fetchKasse, saveKasse, takeOverKasse };
}
