import { useState, useEffect, useCallback } from 'react';
import useDatabase from './useDatabase';
import { useBaseballRows } from './useBaseballRows';

/** The tournament always has exactly these field numbers (baseball_fields.sort_order). */
export const FIELD_NUMBERS = [1, 2, 3, 4];

/**
 * Make sure the year has Feld 1–4 (baseball_fields, sort_order 1..4). Missing numbers are inserted with
 * id 'bf-<year>-<n>' and name 'Feld <n>'; a number that already exists (any id) is left alone, so existing
 * fields keep their ids and team links. Idempotent; writes nothing when all four exist. Refuses (YEAR_LOCKED)
 * in a locked year: call it only when the year is open.
 * @param {{query: Function, run: Function}} db From useDatabase().
 * @param {number} year Scout year.
 */
export async function ensureFields({ query, run }, year) {
  const locked = await query('SELECT locked FROM app_years WHERE year = ?', [year]);
  if (locked[0]?.locked) throw new Error('YEAR_LOCKED');
  for (const n of FIELD_NUMBERS) {
    await run(
      `INSERT OR IGNORE INTO baseball_fields (id, year, name, sort_order)
       SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM baseball_fields WHERE year = ? AND sort_order = ?)`,
      [`bf-${year}-${n}`, year, `Feld ${n}`, n, year, n]
    );
  }
}

/**
 * Fields (Feld 1–4) and teams of one Baseballturnier year, for assigning teams to fields by hand.
 * On load the four fields are created if missing (only when the year is not locked).
 * @param {number} year Scout year.
 * @param {boolean} yearLocked Year is locked (no writes, no field creation).
 * @param {(msg: string) => void} [onError]
 * @returns {{
 *   fields: Array<object>|null,   // baseball_fields rows of the year, by sort_order; null while loading
 *   teams: ReturnType<typeof useBaseballRows>, // the baseball_teams rows hook (rows/add/update/remove)
 *   setTeamField: (teamId: string, fieldId: string|null) => Promise<boolean>
 * }}
 */
export function useBaseballFields(year, yearLocked, onError) {
  const db = useDatabase();
  const { query } = db;
  const teams = useBaseballRows('baseball_teams', year, yearLocked, onError);
  const [state, setState] = useState({ year: null, rows: [] });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!yearLocked) {
          try { await ensureFields(db, year); } catch (err) { if (err?.message !== 'YEAR_LOCKED') throw err; }
        }
        const rows = await query('SELECT * FROM baseball_fields WHERE year = ? ORDER BY sort_order, rowid', [year]);
        if (!cancelled) setState({ year, rows });
      } catch {
        if (!cancelled) {
          onError?.('Felder konnten nicht geladen werden.');
          setState({ year, rows: [] });
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, yearLocked]);

  const { update } = teams;
  const setTeamField = useCallback(
    (teamId, fieldId) => update(teamId, { field_id: fieldId || null }),
    [update]
  );

  return {
    fields: state.year === year ? state.rows : null,
    teams,
    setTeamField,
  };
}

export default useBaseballFields;
