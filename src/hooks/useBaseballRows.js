import { useState, useEffect, useCallback } from 'react';
import useDatabase from './useDatabase';

// Year setting (year_settings) with the fee every team pays; the Übersicht counts paid teams × fee.
export const TEAM_FEE_KEY = 'baseball_team_fee';

// Rows of one Baseballturnier planning table (migration 48: baseball_fields, baseball_teams, baseball_sponsors,
// baseball_todos, baseball_shopping), per scout year. `table` is always one of those names from our own code.
// Writes are refused in a locked year (YEAR_LOCKED); `rows` is null while the year is loading.
export function useBaseballRows(table, year, yearLocked, onError) {
  const { query, run } = useDatabase();
  const [state, setState] = useState({ year: null, rows: [] });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    query(`SELECT * FROM ${table} WHERE year = ? ORDER BY sort_order, rowid`, [year])
      .then((rows) => { if (!cancelled) setState({ year, rows }); })
      .catch(() => {
        if (!cancelled) {
          onError?.('Daten konnten nicht geladen werden.');
          setState({ year, rows: [] });
        }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, year, reloadKey]);

  const assertYearOpen = useCallback(async () => {
    const rows = await query('SELECT locked FROM app_years WHERE year = ?', [year]);
    if (rows[0]?.locked) throw new Error('YEAR_LOCKED');
  }, [query, year]);

  // Resolves to true when the write went through (errors go to onError and resolve to false).
  const write = useCallback(async (fn, fallback) => {
    if (yearLocked) return false;
    try {
      await assertYearOpen();
      await fn();
      setReloadKey((k) => k + 1);
      return true;
    } catch (err) {
      if (err?.message === 'YEAR_LOCKED') onError?.('Das Jahr ist gesperrt.');
      else onError?.(fallback);
      return false;
    }
  }, [yearLocked, assertYearOpen, onError]);

  // fields: { column: value } of the new row.
  const add = useCallback((fields) => write(async () => {
    const order = await query(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM ${table} WHERE year = ?`, [year]);
    const cols = Object.keys(fields);
    await run(
      `INSERT INTO ${table} (id, year, sort_order, ${cols.join(', ')}) VALUES (?, ?, ?, ${cols.map(() => '?').join(', ')})`,
      [crypto.randomUUID(), year, Number(order[0]?.n) || 1, ...cols.map((c) => fields[c])]
    );
  }, 'Eintrag konnte nicht angelegt werden.'), [write, query, run, table, year]);

  // patch: { column: value } of the changed columns.
  const update = useCallback((id, patch) => write(async () => {
    const cols = Object.keys(patch);
    await run(
      `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...cols.map((c) => patch[c]), id]
    );
  }, 'Änderung konnte nicht gespeichert werden.'), [write, run, table]);

  const remove = useCallback((id) => write(
    () => run(`DELETE FROM ${table} WHERE id = ?`, [id]),
    'Löschen fehlgeschlagen.'
  ), [write, run, table]);

  return {
    rows: state.year === year ? state.rows : null,
    add,
    update,
    remove,
  };
}

export default useBaseballRows;
