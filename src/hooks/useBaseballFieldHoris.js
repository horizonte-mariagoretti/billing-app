import { useState, useEffect, useCallback } from 'react';
import useDatabase from './useDatabase';

/** Display name of a Hori, as on the Horis page. */
export const horiName = (h) => `${h?.first_name || ''} ${h?.last_name || ''}`.trim();

/**
 * Horis as referees (Schiedsrichter) of the Baseballturnier fields of one scout year (migration 50:
 * baseball_field_horis). The year comes from the field; Horis count only when active in that year
 * (hori_years.active = 1, like the Horis page without "Inaktive anzeigen"), so links of inactive Horis are hidden.
 * Writes are refused in a locked year (YEAR_LOCKED); errors go to onError and resolve to false.
 * @param {number} year Scout year.
 * @param {boolean} yearLocked Year is locked (no writes).
 * @param {(msg: string) => void} [onError]
 * @returns {{
 *   links: Array<{field_id: string, hori_id: string, first_name: string, last_name: string}>|null, // null while loading
 *   horis: Array<{id: string, first_name: string, last_name: string}>|null, // active Horis of the year, by name
 *   addLink: (fieldId: string, horiId: string) => Promise<boolean>,
 *   removeLink: (fieldId: string, horiId: string) => Promise<boolean>
 * }}
 */
export function useBaseballFieldHoris(year, yearLocked, onError) {
  const { query, run } = useDatabase();
  const [state, setState] = useState({ year: null, links: [], horis: [] });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      query(
        `SELECT l.field_id, l.hori_id, h.first_name, h.last_name
           FROM baseball_field_horis l
           JOIN baseball_fields f ON f.id = l.field_id AND f.year = ?
           JOIN horis h ON h.id = l.hori_id
           JOIN hori_years hy ON hy.hori_id = h.id AND hy.year = ? AND hy.active = 1
          ORDER BY h.last_name COLLATE NOCASE, h.first_name COLLATE NOCASE`,
        [year, year]
      ),
      query(
        `SELECT h.id, h.first_name, h.last_name FROM horis h
           JOIN hori_years hy ON hy.hori_id = h.id AND hy.year = ? AND hy.active = 1
          ORDER BY h.last_name COLLATE NOCASE, h.first_name COLLATE NOCASE`,
        [year]
      ),
    ])
      .then(([links, horis]) => { if (!cancelled) setState({ year, links, horis }); })
      .catch(() => {
        if (!cancelled) {
          onError?.('Schiedsrichter konnten nicht geladen werden.');
          setState({ year, links: [], horis: [] });
        }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, reloadKey]);

  const write = useCallback(async (fn, fallback) => {
    if (yearLocked) return false;
    try {
      const rows = await query('SELECT locked FROM app_years WHERE year = ?', [year]);
      if (rows[0]?.locked) throw new Error('YEAR_LOCKED');
      await fn();
      setReloadKey((k) => k + 1);
      return true;
    } catch (err) {
      onError?.(err?.message === 'YEAR_LOCKED' ? 'Das Jahr ist gesperrt.' : fallback);
      return false;
    }
  }, [yearLocked, query, year, onError]);

  const addLink = useCallback((fieldId, horiId) => write(
    () => run('INSERT OR IGNORE INTO baseball_field_horis (field_id, hori_id) VALUES (?, ?)', [fieldId, horiId]),
    'Schiedsrichter konnte nicht hinzugefügt werden.'
  ), [write, run]);

  const removeLink = useCallback((fieldId, horiId) => write(
    () => run('DELETE FROM baseball_field_horis WHERE field_id = ? AND hori_id = ?', [fieldId, horiId]),
    'Schiedsrichter konnte nicht entfernt werden.'
  ), [write, run]);

  const ready = state.year === year;
  return {
    links: ready ? state.links : null,
    horis: ready ? state.horis : null,
    addLink,
    removeLink,
  };
}

export default useBaseballFieldHoris;
