import { useCallback } from 'react';
import useDatabase from './useDatabase';
import { DENOMS } from '../utils/gluehweinFinance';

// One Kasse per Verkaufsaktion (action = SALES_ACTIONS key) and scout year: card payments (card_amount) and a
// cash count per denomination (sales_kasse_counts, phase 'start' | 'end', cents). It counts live in the Saldo
// (kasseIncome in utils/gluehweinFinance.js). "Kasse übernehmen" only locks it (locked = 1) against changes;
// unlocking is allowed as long as the scout year is open.

const PHASES = ['start', 'end'];

const emptyKasse = () => ({ id: null, card_amount: null, locked: 0, counted_cash: null, start: {}, end: {} });

/**
 * Reads the Kasse of action + year without creating it (shared by the Kasse tab, Finanzen, Übersicht and the
 * Dashboard Saldo). query = useDatabase().query.
 * -> { id, card_amount, locked, counted_cash, start: { [cents]: qty }, end: { [cents]: qty } } | null
 */
export async function loadKasse(query, action, year) {
  const rows = await query(
    'SELECT id, card_amount, locked, counted_cash FROM sales_kasse WHERE action = ? AND year = ?',
    [action, year]
  );
  const row = rows[0];
  if (!row) return null;
  const counts = await query(
    'SELECT phase, denom_cents, qty FROM sales_kasse_counts WHERE kasse_id = ?',
    [row.id]
  );
  const kasse = { ...row, locked: row.locked ? 1 : 0, start: {}, end: {} };
  for (const c of counts) {
    if (PHASES.includes(c.phase)) kasse[c.phase][Number(c.denom_cents)] = Number(c.qty) || 0;
  }
  return kasse;
}

export function useSalesKasse(action) {
  const { query, run } = useDatabase();

  const isYearLocked = useCallback(async (year) => {
    const rows = await query('SELECT locked FROM app_years WHERE year = ?', [year]);
    return !!rows[0]?.locked;
  }, [query]);

  // -> Kasse (see loadKasse); creates the row if missing. A locked year without a row gets an empty
  // read-only Kasse (id null).
  const fetchKasse = useCallback(async (year) => {
    const kasse = await loadKasse(query, action, year);
    if (kasse) return kasse;
    if (await isYearLocked(year)) return emptyKasse();
    await run(
      'INSERT OR IGNORE INTO sales_kasse (id, action, year) VALUES (?, ?, ?)',
      [crypto.randomUUID(), action, year]
    );
    return (await loadKasse(query, action, year)) || emptyKasse();
  }, [query, isYearLocked, run, action]);

  // Kasse for a write: throws YEAR_LOCKED / KASSE_LOCKED.
  const writableKasse = useCallback(async (year) => {
    if (await isYearLocked(year)) throw new Error('YEAR_LOCKED');
    const kasse = await fetchKasse(year);
    if (!kasse?.id) throw new Error('YEAR_LOCKED');
    if (kasse.locked) throw new Error('KASSE_LOCKED');
    return kasse;
  }, [isYearLocked, fetchKasse]);

  // amount: blank -> NULL, else a number >= 0 rounded to 2 decimals.
  const saveCard = useCallback(async (year, amount) => {
    let card = null;
    if (amount !== null && amount !== undefined && String(amount).trim() !== '') {
      const n = Number(String(amount).replace(',', '.'));
      if (!Number.isFinite(n) || n < 0) throw new Error('INVALID_AMOUNT');
      card = Math.round(n * 100) / 100;
    }
    const kasse = await writableKasse(year);
    // Guard on locked = 0 so a concurrent lock is not bypassed.
    const res = await run('UPDATE sales_kasse SET card_amount = ? WHERE id = ? AND locked = 0', [card, kasse.id]);
    if (res && res.changes === 0) throw new Error('KASSE_LOCKED');
  }, [writableKasse, run]);

  // Count of one denomination: qty 0 deletes the row, else upsert (whole number >= 0).
  const saveCount = useCallback(async (year, phase, cents, qty) => {
    if (!PHASES.includes(phase) || !DENOMS.includes(Number(cents))) throw new Error('INVALID_COUNT');
    const n = Number(qty || 0);
    if (!Number.isInteger(n) || n < 0) throw new Error('INVALID_COUNT');
    const kasse = await writableKasse(year);
    if (n === 0) {
      await run(
        `DELETE FROM sales_kasse_counts WHERE kasse_id = ? AND phase = ? AND denom_cents = ?
           AND EXISTS (SELECT 1 FROM sales_kasse WHERE id = ? AND locked = 0)`,
        [kasse.id, phase, Number(cents), kasse.id]
      );
      return;
    }
    const res = await run(
      `INSERT INTO sales_kasse_counts (kasse_id, phase, denom_cents, qty)
         SELECT id, ?, ?, ? FROM sales_kasse WHERE id = ? AND locked = 0
         ON CONFLICT (kasse_id, phase, denom_cents) DO UPDATE SET qty = excluded.qty`,
      [phase, Number(cents), n, kasse.id]
    );
    if (res && res.changes === 0) throw new Error('KASSE_LOCKED');
  }, [writableKasse, run]);

  const setLocked = useCallback(async (year, locked) => {
    if (await isYearLocked(year)) throw new Error('YEAR_LOCKED');
    const kasse = await fetchKasse(year);
    if (!kasse?.id) throw new Error('YEAR_LOCKED');
    await run('UPDATE sales_kasse SET locked = ? WHERE id = ?', [locked ? 1 : 0, kasse.id]);
  }, [isYearLocked, fetchKasse, run]);

  const lockKasse = useCallback((year) => setLocked(year, true), [setLocked]);
  const unlockKasse = useCallback((year) => setLocked(year, false), [setLocked]);

  // Read-only Kasse (no row created), e.g. for the Saldo.
  const readKasse = useCallback((year) => loadKasse(query, action, year), [query, action]);

  return { fetchKasse, readKasse, saveCard, saveCount, lockKasse, unlockKasse };
}
