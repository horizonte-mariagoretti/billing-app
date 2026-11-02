import { useCallback } from 'react';
import useDatabase from './useDatabase';

// Shared Glühwein units (table gw_units, migration 43): kind 'sell' = Verkaufseinheit, 'buy' = Einkaufseinheit.
// Not year-bound and not in Settings; new units are added from the dropdown of the item popup.
export function useGluehweinUnits() {
  const { query, run } = useDatabase();

  // Names of one kind, alphabetical.
  const fetchUnits = useCallback(async (kind) => {
    const rows = await query(
      'SELECT name FROM gw_units WHERE kind = ? ORDER BY name COLLATE NOCASE',
      [kind]
    );
    return rows.map((r) => r.name);
  }, [query]);

  // Adds a unit (no-op when it exists). Returns the trimmed name.
  const addUnit = useCallback(async (kind, name) => {
    const clean = String(name ?? '').trim();
    if (!clean) throw new Error('UNIT_EMPTY');
    await run(
      'INSERT OR IGNORE INTO gw_units (id, kind, name) VALUES (?, ?, ?)',
      [crypto.randomUUID(), kind, clean]
    );
    return clean;
  }, [run]);

  // Removes a unit from the shared list. Items keep the unit text they already store.
  const deleteUnit = useCallback(async (kind, name) => {
    await run('DELETE FROM gw_units WHERE kind = ? AND name = ?', [kind, name]);
  }, [run]);

  // "Geplant in" modes offered in the item popup (table gw_plan_modes, migration 46).
  const fetchPlanModes = useCallback(async () => {
    const rows = await query('SELECT key FROM gw_plan_modes');
    return rows.map((r) => r.key);
  }, [query]);

  // Removes a mode from the list. Refuses the last one so at least one mode always remains.
  const deletePlanMode = useCallback(async (key) => {
    const rows = await query('SELECT COUNT(*) AS n FROM gw_plan_modes');
    if (Number(rows[0]?.n) <= 1) throw new Error('PLAN_MODE_LAST');
    await run('DELETE FROM gw_plan_modes WHERE key = ?', [key]);
  }, [query, run]);

  return { fetchUnits, addUnit, deleteUnit, fetchPlanModes, deletePlanMode };
}

export default useGluehweinUnits;
