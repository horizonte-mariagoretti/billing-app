import { useEffect, useCallback, useSyncExternalStore } from 'react';
import useDatabase from './useDatabase';
import { currentScoutYear, scoutYearLabel } from '../utils/scoutYear';

const STORAGE_KEY = 'hori-admin-year';
const AMOUNT_SETTING_KEYS = [
  'camp_base_contribution',
  'camp_min_contribution',
  'camp_reduction_per_percent',
  'lasagna_price',
  'lasagna_discount_from',
  'lasagna_discount_price',
  'lasagna_bonus_enabled',
  'lasagna_bonus_factor',
];

const readStoredYear = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const year = parseInt(raw, 10);
    return Number.isFinite(year) ? year : null;
  } catch {
    return null;
  }
};

const writeStoredYear = (year) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(year));
  } catch {
    // Storage unavailable — keep the in-memory selection only.
  }
};

const store = {
  state: { years: [], selectedYear: readStoredYear(), loaded: false },
  query: null,
};
const listeners = new Set();

const getSnapshot = () => store.state;
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const setState = (patch) => {
  store.state = { ...store.state, ...patch };
  listeners.forEach(l => l());
};

const loadYears = async () => {
  const runQuery = store.query || window.electron.db.query;
  const rows = await runQuery('SELECT year, locked FROM app_years ORDER BY year DESC');
  const list = rows.map(r => ({ year: Number(r.year), locked: Number(r.locked) === 1 }));
  setState({ years: list });
  return list;
};

const ensureLoaded = () => {
  if (store.state.loaded) return;
  setState({ loaded: true });
  loadYears().catch(err => console.error('Failed to load years', err));
};

const snapshotYearAmounts = (year) => window.electron.db.transaction(
  AMOUNT_SETTING_KEYS.map(key => ({
    sql: `INSERT OR IGNORE INTO year_settings (year, key, value)
          SELECT ?, key, value FROM settings WHERE key = ?`,
    params: [year, key],
  }))
);

// TODO: move direct window.electron.db access into the hook layer.
export const setYearLocked = async (year, locked) => {
  const result = await window.electron.db.run(
    'UPDATE app_years SET locked = ? WHERE year = ?',
    [locked ? 1 : 0, year]
  );
  await loadYears();
  return result;
};

const useYear = () => {
  const { query, transaction } = useDatabase();
  const { years, selectedYear: selected } = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    store.query = query;
    ensureLoaded();
  }, [query]);

  const fetchYears = useCallback(() => loadYears(), []);

  const currentYear = years.length > 0 ? years[0].year : currentScoutYear();
  const selectedYear = selected != null && (years.length === 0 || years.some(y => y.year === selected))
    ? selected
    : currentYear;
  const isLocked = years.some(y => y.year === selectedYear && y.locked);

  const setSelectedYear = useCallback((year) => {
    const value = parseInt(year, 10);
    if (!Number.isFinite(value)) return;
    setState({ selectedYear: value });
    writeStoredYear(value);
  }, []);

  const startNewYear = useCallback(async () => {
    const newYear = currentYear + 1;
    await snapshotYearAmounts(currentYear);
    await transaction([
      { sql: 'UPDATE app_years SET locked = 1 WHERE year = ?', params: [currentYear] },
      { sql: 'INSERT OR IGNORE INTO app_years (year, locked) VALUES (?, 0)', params: [newYear] },
      {
        sql: `INSERT OR IGNORE INTO hori_years (hori_id, year, active)
              SELECT id, ?, COALESCE(active, 1) FROM horis`,
        params: [newYear],
      },
      {
        sql: `INSERT OR IGNORE INTO year_settings (year, key, value)
              SELECT ?, key, value FROM year_settings
              WHERE year = ?
                AND (key GLOB 'lasagna_*' OR key GLOB 'camp_*')
                AND NOT key GLOB 'lasagna_stock_*'
                AND NOT key GLOB '*_action_date'`,
        params: [newYear, currentYear],
      },
    ]);
    setSelectedYear(newYear);
    await fetchYears();
    return newYear;
  }, [currentYear, transaction, setSelectedYear, fetchYears]);

  return {
    years,
    currentYear,
    selectedYear,
    setSelectedYear,
    isLocked,
    label: scoutYearLabel(selectedYear),
    startNewYear,
    refreshYears: fetchYears,
  };
};

export default useYear;
