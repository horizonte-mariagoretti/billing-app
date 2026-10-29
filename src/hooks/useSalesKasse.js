import { useCallback } from 'react';
import useDatabase from './useDatabase';
import { kasseTotal } from '../utils/gluehweinFinance.js';

// One Kasse per Verkaufsaktion (action = SALES_ACTIONS key) and scout year.
// Once taken over (entry_id set) it is read-only; deleting the income entry unlocks it (ON DELETE SET NULL).
export function useSalesKasse(action) {
  const { query, run, transaction } = useDatabase();

  const isYearLocked = useCallback(async (year) => {
    const rows = await query('SELECT locked FROM app_years WHERE year = ?', [year]);
    return !!rows[0]?.locked;
  }, [query]);

  const loadRow = useCallback(async (year) => {
    const rows = await query(
      'SELECT id, start_cash, counted_cash, wechselgeld, entry_id FROM sales_kasse WHERE action = ? AND year = ?',
      [action, year]
    );
    return rows[0] || null;
  }, [query, action]);

  const loadLines = useCallback(async (kasseId) => {
    return await query(
      'SELECT item_id, item_name, qty, unit_price FROM sales_kasse_lines WHERE kasse_id = ? ORDER BY item_name',
      [kasseId]
    );
  }, [query]);

  const fetchKasse = useCallback(async (year) => {
    let kasse = await loadRow(year);
    if (!kasse) {
      if (await isYearLocked(year)) return null;
      await run(
        'INSERT OR IGNORE INTO sales_kasse (id, action, year) VALUES (?, ?, ?)',
        [crypto.randomUUID(), action, year]
      );
      kasse = await loadRow(year);
      if (!kasse) return null;
    }
    return { ...kasse, lines: await loadLines(kasse.id) };
  }, [loadRow, loadLines, isYearLocked, run, action]);

  // data: { start_cash, counted_cash, wechselgeld, lines:[{item_id,item_name,qty,unit_price}] }
  const saveKasse = useCallback(async (year, data) => {
    if (await isYearLocked(year)) throw new Error('YEAR_LOCKED');
    let kasse = await loadRow(year);
    if (!kasse) {
      kasse = await fetchKasse(year);
      if (!kasse) throw new Error('YEAR_LOCKED');
    }
    if (kasse.entry_id) throw new Error('KASSE_TAKEN');
    const counted = data.counted_cash === '' || data.counted_cash == null ? null : Number(data.counted_cash);
    const ops = [
      {
        // Guard on entry_id IS NULL so a concurrent take-over is not overwritten.
        sql: 'UPDATE sales_kasse SET start_cash = ?, counted_cash = ?, wechselgeld = ? WHERE id = ? AND entry_id IS NULL',
        params: [Number(data.start_cash) || 0, counted, Number(data.wechselgeld) || 0, kasse.id],
      },
      { sql: 'DELETE FROM sales_kasse_lines WHERE kasse_id = ?', params: [kasse.id] },
      ...(data.lines || []).map((l) => ({
        sql: 'INSERT INTO sales_kasse_lines (kasse_id, item_id, item_name, qty, unit_price) VALUES (?, ?, ?, ?, ?)',
        params: [kasse.id, l.item_id, l.item_name, Math.trunc(Number(l.qty) || 0), Number(l.unit_price) || 0],
      })),
    ];
    await transaction(ops);
  }, [isYearLocked, loadRow, fetchKasse, transaction]);

  // Books the Kasse total as one income entry and links it. Returns the new entry id.
  const takeOverKasse = useCallback(async (year) => {
    if (await isYearLocked(year)) throw new Error('YEAR_LOCKED');
    const kasse = await loadRow(year);
    if (!kasse) throw new Error('KASSE_EMPTY');
    if (kasse.entry_id) throw new Error('ALREADY_TAKEN');
    const total = kasseTotal(await loadLines(kasse.id));
    if (!(total > 0)) throw new Error('KASSE_EMPTY');
    const entryId = crypto.randomUUID();
    let results;
    try {
      results = await transaction([
        {
          // Inserts only while the Kasse is still untaken; the unique index on source_kasse_id backs this up.
          sql: `INSERT INTO sales_entries (id, action, year, kind, description, category, amount, source_kasse_id)
                SELECT ?, ?, ?, 'income', 'Kasse', 'kasse', ?, id
                FROM sales_kasse WHERE id = ? AND entry_id IS NULL`,
          params: [entryId, action, year, total, kasse.id],
        },
        {
          sql: `UPDATE sales_kasse SET entry_id = ?
                WHERE id = ? AND entry_id IS NULL AND EXISTS (SELECT 1 FROM sales_entries WHERE id = ?)`,
          params: [entryId, kasse.id, entryId],
        },
      ]);
    } catch (err) {
      if (/UNIQUE/i.test(String(err?.message))) throw new Error('ALREADY_TAKEN');
      throw err;
    }
    if (!results?.[0]?.changes) throw new Error('ALREADY_TAKEN');
    return entryId;
  }, [isYearLocked, loadRow, loadLines, transaction, action]);

  return { fetchKasse, saveKasse, takeOverKasse };
}
