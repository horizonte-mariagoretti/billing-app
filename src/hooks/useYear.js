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
  'gluehwein_mandatory_shifts',
  'gluehwein_bonus_enabled',
  'gluehwein_bonus_factor',
  'gluehwein_shift_templates',
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

const useYear = () => {
  const { query, run, transaction } = useDatabase();
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

  const snapshotYearAmounts = useCallback((year) => transaction(
    AMOUNT_SETTING_KEYS.map(key => ({
      sql: `INSERT OR IGNORE INTO year_settings (year, key, value)
            SELECT ?, key, value FROM settings WHERE key = ?`,
      params: [year, key],
    }))
  ), [transaction]);

  const setYearLocked = useCallback(async (year, locked) => {
    const result = await run(
      'UPDATE app_years SET locked = ? WHERE year = ?',
      [locked ? 1 : 0, year]
    );
    await fetchYears();
    return result;
  }, [run, fetchYears]);

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
                AND (key GLOB 'lasagna_*' OR key GLOB 'camp_*' OR key GLOB 'gluehwein_*')
                AND NOT key GLOB 'lasagna_stock_*'
                AND NOT key GLOB '*_action_date'`,
        params: [newYear, currentYear],
      },
      {
        // Glühwein catalog prices and packs carry over; planned quantities start at 0.
        // Days, shifts, Kasse and entries belong to their year and are not copied.
        sql: `INSERT OR IGNORE INTO gw_item_terms (item_id, year, sell_price, buy_price, pack_type, pack_size, planned_qty)
              SELECT item_id, ?, sell_price, buy_price, pack_type, pack_size, 0 FROM gw_item_terms
              WHERE year = ?`,
        params: [newYear, currentYear],
      },
    ]);
    setSelectedYear(newYear);
    await fetchYears();
    return newYear;
  }, [currentYear, transaction, snapshotYearAmounts, setSelectedYear, fetchYears]);

  return {
    years,
    currentYear,
    selectedYear,
    setSelectedYear,
    isLocked,
    label: scoutYearLabel(selectedYear),
    startNewYear,
    setYearLocked,
    refreshYears: fetchYears,
  };
};

export default useYear;
