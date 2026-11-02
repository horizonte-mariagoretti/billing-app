import { useState, useEffect, useCallback } from 'react';
import useDatabase from './useDatabase';
import { findDuplicate } from '../utils/baseballSponsors';

/** Columns of a per-year row (baseball_sponsors) that addYearRow / updateYearRow may write. */
export const YEAR_ROW_COLUMNS = [
  'sponsor_id', 'name', 'contact_name', 'art', 'status', 'amount', 'level_amount', 'special',
  'invoiced', 'paid', 'material_out', 'material_in', 'sort_order',
];

/** Identity/billing columns of a library entry (sponsors) that createLibrary / updateLibrary may write. */
export const LIBRARY_COLUMNS = [
  'name', 'contact_name', 'phone', 'email', 'address_street', 'address_zip', 'address_city',
  'address_country', 'vat_number', 'iban', 'notes',
];

/** Error message shown when a library name is already taken (case-insensitive). */
export const NAME_TAKEN_MESSAGE = 'Dieser Name gibt es schon in der Bibliothek.';

const pick = (obj, allowed) => Object.fromEntries(
  Object.entries(obj || {}).filter(([k, v]) => allowed.includes(k) && v !== undefined)
);

const isUniqueError = (err) => /UNIQUE/i.test(String(err?.message ?? err));

/**
 * Baseballturnier sponsors of one scout year plus the global sponsor library (migration 49).
 *
 * - `rows`: per-year rows of baseball_sponsors joined with their library entry. Display columns:
 *   sp_name (library name, else the row's snapshot name), sp_contact, phone, email, address_*, vat_number, iban,
 *   library_id (null for an old row not linked yet). null while loading.
 * - `library`: all rows of `sponsors`, by name (case-insensitive). null while loading.
 *
 * Every write resolves without throwing; errors go to onError. Writes are refused in a locked year
 * ('Das Jahr ist gesperrt.'). The library is global, but library writes follow the same rule: they are refused
 * while the CURRENT year is locked, so a locked year never changes anything from its page.
 * Renaming a library entry also updates the name snapshot of its linked rows in all unlocked years.
 *
 * @param {number} year Scout year.
 * @param {boolean} yearLocked Year is locked.
 * @param {(msg: string) => void} [onError]
 */
export function useBaseballSponsors(year, yearLocked, onError) {
  const { query, run, transaction } = useDatabase();
  const [state, setState] = useState({ year: null, rows: [], library: [] });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      query(
        `SELECT b.*, COALESCE(s.name, b.name) AS sp_name, COALESCE(s.contact_name, b.contact_name) AS sp_contact,
                s.phone, s.email, s.address_street, s.address_zip, s.address_city, s.address_country,
                s.vat_number, s.iban, s.id AS library_id
         FROM baseball_sponsors b LEFT JOIN sponsors s ON s.id = b.sponsor_id
         WHERE b.year = ? ORDER BY b.sort_order, b.rowid`,
        [year]
      ),
      query('SELECT * FROM sponsors ORDER BY lower(name)'),
    ])
      .then(([rows, library]) => { if (!cancelled) setState({ year, rows, library }); })
      .catch(() => {
        if (!cancelled) {
          onError?.('Sponsoren konnten nicht geladen werden.');
          setState({ year, rows: [], library: [] });
        }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, reloadKey]);

  const assertYearOpen = useCallback(async () => {
    const rows = await query('SELECT locked FROM app_years WHERE year = ?', [year]);
    if (rows[0]?.locked) throw new Error('YEAR_LOCKED');
  }, [query, year]);

  // Runs fn after the lock check and reloads. Resolves to fn's result (or true when it returns undefined);
  // resolves to null on error (reported via onError; NAME_TAKEN / unique errors get NAME_TAKEN_MESSAGE).
  const attempt = useCallback(async (fn, fallback) => {
    if (yearLocked) return null;
    try {
      await assertYearOpen();
      const result = await fn();
      setReloadKey((k) => k + 1);
      return result === undefined ? true : result;
    } catch (err) {
      if (err?.message === 'YEAR_LOCKED') onError?.('Das Jahr ist gesperrt.');
      else if (err?.message === 'NAME_TAKEN' || isUniqueError(err)) onError?.(NAME_TAKEN_MESSAGE);
      else onError?.(fallback);
      return null;
    }
  }, [yearLocked, assertYearOpen, onError]);

  // Same contract as useBaseballRows: resolves to true when the write went through, else false.
  const write = useCallback(
    async (fn, fallback) => (await attempt(fn, fallback)) !== null,
    [attempt]
  );

  /**
   * Add a per-year row for a library entry. The library name is copied into `name` (snapshot, NOT NULL).
   * @param {string} libraryId sponsors.id
   * @param {{art?, status?, amount?, invoiced?, paid?, special?, material_out?, material_in?}} [fields]
   * @returns {Promise<boolean>}
   */
  const addYearRow = useCallback((libraryId, fields = {}) => write(async () => {
    const lib = await query('SELECT name FROM sponsors WHERE id = ?', [libraryId]);
    if (!lib[0]) throw new Error('NOT_FOUND');
    const order = await query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM baseball_sponsors WHERE year = ?', [year]);
    const values = {
      contact_name: '', art: '', status: 'offen', amount: 0, invoiced: 0, paid: 0, special: '',
      material_out: '', material_in: '',
      ...pick(fields, ['art', 'status', 'amount', 'invoiced', 'paid', 'special', 'material_out', 'material_in']),
      sponsor_id: libraryId,
      name: lib[0].name,
    };
    const cols = Object.keys(values);
    await run(
      `INSERT INTO baseball_sponsors (id, year, sort_order, ${cols.join(', ')}) VALUES (?, ?, ?, ${cols.map(() => '?').join(', ')})`,
      [crypto.randomUUID(), year, Number(order[0]?.n) || 1, ...cols.map((c) => values[c])]
    );
  }, 'Sponsor konnte nicht hinzugefügt werden.'), [write, query, run, year]);

  /**
   * Change columns of a per-year row (only YEAR_ROW_COLUMNS; others are ignored). Setting sponsor_id links an
   * old row to a library entry.
   * @returns {Promise<boolean>}
   */
  const updateYearRow = useCallback((id, patch) => write(async () => {
    const clean = pick(patch, YEAR_ROW_COLUMNS);
    const cols = Object.keys(clean);
    if (!cols.length) return;
    await run(
      `UPDATE baseball_sponsors SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...cols.map((c) => clean[c]), id]
    );
  }, 'Änderung konnte nicht gespeichert werden.'), [write, run]);

  /** Remove a per-year row only (the library entry stays). @returns {Promise<boolean>} */
  const removeYearRow = useCallback((id) => write(
    () => run('DELETE FROM baseball_sponsors WHERE id = ?', [id]),
    'Löschen fehlgeschlagen.'
  ), [write, run]);

  /**
   * Create a library entry. The duplicate check (trimmed, case-insensitive) runs again inside the write.
   * @param {{name: string, contact_name?, phone?, email?, address_*?, vat_number?, iban?, notes?}} data
   * @returns {Promise<{id: string}|{duplicate: object}|null>} null on error (reported via onError); nothing is
   *   written for a duplicate.
   */
  const createLibrary = useCallback((data) => attempt(async () => {
    const clean = pick(data, LIBRARY_COLUMNS);
    clean.name = String(clean.name ?? '').trim();
    if (!clean.name) throw new Error('NAME_REQUIRED');
    const library = await query('SELECT * FROM sponsors');
    const duplicate = findDuplicate(library, clean.name);
    if (duplicate) return { duplicate };
    const id = crypto.randomUUID();
    const cols = Object.keys(clean);
    await run(
      `INSERT INTO sponsors (id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`,
      [id, ...cols.map((c) => clean[c])]
    );
    return { id };
  }, 'Sponsor konnte nicht angelegt werden.'), [attempt, query, run]);

  /**
   * Change identity/billing data of a library entry (only LIBRARY_COLUMNS). A name already used by another
   * entry (case-insensitive) is refused with NAME_TAKEN_MESSAGE. A new name is also copied into the snapshot of
   * the linked per-year rows of all unlocked years.
   * @returns {Promise<boolean>}
   */
  const updateLibrary = useCallback((id, patch) => write(async () => {
    const clean = pick(patch, LIBRARY_COLUMNS);
    if ('name' in clean) {
      clean.name = String(clean.name ?? '').trim();
      if (!clean.name) throw new Error('NAME_REQUIRED');
      const others = await query('SELECT id, name FROM sponsors WHERE id <> ?', [id]);
      if (findDuplicate(others, clean.name)) throw new Error('NAME_TAKEN');
    }
    const cols = Object.keys(clean);
    if (!cols.length) return;
    const ops = [{
      sql: `UPDATE sponsors SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      params: [...cols.map((c) => clean[c]), id],
    }];
    if ('name' in clean) {
      ops.push({
        sql: `UPDATE baseball_sponsors SET name = ? WHERE sponsor_id = ?
              AND year NOT IN (SELECT year FROM app_years WHERE locked = 1)`,
        params: [clean.name, id],
      });
    }
    await transaction(ops);
  }, 'Änderung konnte nicht gespeichert werden.'), [write, query, transaction]);

  /**
   * Link an old per-year row (sponsor_id NULL) to the library: uses the library entry with the same name
   * (case-insensitive) or creates one from `data` (default: the row's name and contact), then sets sponsor_id.
   * @param {string} rowId baseball_sponsors.id
   * @param {object} [data] Library data for a new entry; data.name defaults to the row's name.
   * @returns {Promise<{id: string, created: boolean}|null>} the library id, or null on error.
   */
  const linkOrCreate = useCallback((rowId, data = {}) => attempt(async () => {
    const row = (await query('SELECT name, contact_name FROM baseball_sponsors WHERE id = ?', [rowId]))[0];
    if (!row) throw new Error('NOT_FOUND');
    const clean = { contact_name: row.contact_name || '', ...pick(data, LIBRARY_COLUMNS) };
    clean.name = String(clean.name ?? row.name ?? '').trim();
    if (!clean.name) throw new Error('NAME_REQUIRED');
    const existing = findDuplicate(await query('SELECT id, name FROM sponsors'), clean.name);
    const id = existing ? existing.id : crypto.randomUUID();
    const ops = [];
    if (!existing) {
      const cols = Object.keys(clean);
      ops.push({
        sql: `INSERT INTO sponsors (id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`,
        params: [id, ...cols.map((c) => clean[c])],
      });
    }
    ops.push({ sql: 'UPDATE baseball_sponsors SET sponsor_id = ? WHERE id = ?', params: [id, rowId] });
    await transaction(ops);
    return { id, created: !existing };
  }, 'Sponsor konnte nicht verknüpft werden.'), [attempt, query, transaction]);

  const loaded = state.year === year;
  return {
    rows: loaded ? state.rows : null,
    library: loaded ? state.library : null,
    addYearRow,
    updateYearRow,
    removeYearRow,
    createLibrary,
    updateLibrary,
    linkOrCreate,
    /** Reload rows and library (e.g. after BaseballSponsorModal saved through its own hook instance). */
    reload: () => setReloadKey((k) => k + 1),
  };
}

export default useBaseballSponsors;
