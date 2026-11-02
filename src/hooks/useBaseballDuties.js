import { useCallback } from 'react';
import useDatabase from './useDatabase';

// Baseballturnier Schichten (Elterndienste, migrations 47 + 51): shifts (Schicht 1, 2 ...) x duties (Theke, Burger ...).
// Each slot (duty x shift) holds its persons (baseball_duty_persons: name, phone, optional team) and the number of
// persons needed (baseball_duty_assignments.needed). Per scout year; writes are refused in a locked year.
// Every write resolves to true when it went through; errors go to onError and resolve to false.
export function useBaseballDuties(onError) {
  const { query, run } = useDatabase();

  const assertYearOpen = useCallback(async (year) => {
    const rows = await query('SELECT locked FROM app_years WHERE year = ?', [year]);
    if (rows[0]?.locked) throw new Error('YEAR_LOCKED');
  }, [query]);

  // year: the scout year, or a function resolving to it (writes that only get an id look it up first).
  const write = useCallback(async (year, fn, fallback) => {
    try {
      await assertYearOpen(typeof year === 'function' ? await year() : year);
      await fn();
      return true;
    } catch (err) {
      const msg = String(err?.message || '');
      if (msg === 'YEAR_LOCKED') onError?.('Das Jahr ist gesperrt.');
      else if (msg === 'NAME_EMPTY') onError?.('Bitte einen Namen eingeben.');
      else if (msg === 'DUPLICATE') onError?.('Diesen Dienst gibt es schon.');
      else if (/UNIQUE/i.test(msg)) onError?.('Diesen Eintrag gibt es schon.');
      else onError?.(fallback);
      return false;
    }
  }, [assertYearOpen, onError]);

  // The year of a shift / duty / person (for the lock check of writes that only get an id).
  const yearOf = useCallback(async (sql, id) => {
    const rows = await query(sql, [id]);
    return rows[0]?.year ?? null;
  }, [query]);
  const shiftYear = useCallback((id) => yearOf('SELECT year FROM baseball_duty_shifts WHERE id = ?', id), [yearOf]);
  const dutyYear = useCallback((id) => yearOf('SELECT year FROM baseball_duties WHERE id = ?', id), [yearOf]);
  const personYear = useCallback((id) => yearOf(
    'SELECT d.year FROM baseball_duty_persons p JOIN baseball_duties d ON d.id = p.duty_id WHERE p.id = ?', id
  ), [yearOf]);

  /**
   * { duties: [{id, name}], shifts: [{id, label, start_time, end_time}], teams: [{id, name}],
   *   persons: Map 'dutyId|shiftId' -> [{id, name, phone, team_id, team_name}], needed: Map 'dutyId|shiftId' -> n }
   */
  const fetchDuties = useCallback(async (year) => {
    const duties = await query(
      'SELECT id, name FROM baseball_duties WHERE year = ? ORDER BY sort_order, name',
      [year]
    );
    const shifts = await query(
      'SELECT id, label, start_time, end_time FROM baseball_duty_shifts WHERE year = ? ORDER BY sort_order, label',
      [year]
    );
    const slots = await query(
      `SELECT a.duty_id, a.shift_id, a.needed
         FROM baseball_duty_assignments a
         JOIN baseball_duties d ON d.id = a.duty_id
        WHERE d.year = ?`,
      [year]
    );
    const rows = await query(
      `SELECT p.id, p.duty_id, p.shift_id, p.name, p.phone, p.team_id, t.name AS team_name
         FROM baseball_duty_persons p
         JOIN baseball_duties d ON d.id = p.duty_id
         LEFT JOIN baseball_teams t ON t.id = p.team_id
        WHERE d.year = ?
        ORDER BY p.sort_order, p.rowid`,
      [year]
    );
    const teams = await query('SELECT id, name FROM baseball_teams WHERE year = ? ORDER BY sort_order, name', [year]);
    const needed = new Map(slots.map((s) => [`${s.duty_id}|${s.shift_id}`, Number(s.needed) || 0]));
    const persons = new Map();
    for (const p of rows) {
      const key = `${p.duty_id}|${p.shift_id}`;
      if (!persons.has(key)) persons.set(key, []);
      persons.get(key).push(p);
    }
    return { duties, shifts, teams, persons, needed };
  }, [query]);

  const addDuty = useCallback((year, name) => write(year, async () => {
    const clean = String(name ?? '').trim();
    if (!clean) throw new Error('NAME_EMPTY');
    const dup = await query('SELECT 1 FROM baseball_duties WHERE year = ? AND lower(name) = lower(?)', [year, clean]);
    if (dup.length) throw new Error('DUPLICATE');
    const order = await query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM baseball_duties WHERE year = ?', [year]);
    await run(
      'INSERT INTO baseball_duties (id, year, name, sort_order) VALUES (?, ?, ?, ?)',
      [crypto.randomUUID(), year, clean, Number(order[0]?.n) || 1]
    );
  }, 'Dienst konnte nicht angelegt werden.'), [write, query, run]);

  const deleteDuty = useCallback((year, id) => write(
    year,
    () => run('DELETE FROM baseball_duties WHERE id = ?', [id]),
    'Dienst konnte nicht gelöscht werden.'
  ), [write, run]);

  const addShift = useCallback((year, label, start, end) => write(year, async () => {
    const clean = String(label ?? '').trim();
    if (!clean) throw new Error('NAME_EMPTY');
    const order = await query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM baseball_duty_shifts WHERE year = ?', [year]);
    await run(
      'INSERT INTO baseball_duty_shifts (id, year, label, start_time, end_time, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [crypto.randomUUID(), year, clean, start || null, end || null, Number(order[0]?.n) || 1]
    );
  }, 'Schicht konnte nicht angelegt werden.'), [write, query, run]);

  // patch: { label?, start_time?, end_time? }
  const updateShift = useCallback((id, patch) => write(() => shiftYear(id), async () => {
    const cols = Object.keys(patch).filter((c) => ['label', 'start_time', 'end_time'].includes(c));
    if (!cols.length) return;
    if (cols.includes('label') && !String(patch.label ?? '').trim()) throw new Error('NAME_EMPTY');
    const value = (c) => (c === 'label' ? String(patch.label).trim() : (patch[c] || null));
    await run(
      `UPDATE baseball_duty_shifts SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...cols.map(value), id]
    );
  }, 'Schicht konnte nicht gespeichert werden.'), [write, run, shiftYear]);

  const deleteShift = useCallback((year, id) => write(
    year,
    () => run('DELETE FROM baseball_duty_shifts WHERE id = ?', [id]),
    'Schicht konnte nicht gelöscht werden.'
  ), [write, run]);

  // person: { name, phone?, team_id? }
  const addPerson = useCallback((dutyId, shiftId, person) => write(() => dutyYear(dutyId), async () => {
    const name = String(person?.name ?? '').trim();
    if (!name) throw new Error('NAME_EMPTY');
    const order = await query(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM baseball_duty_persons WHERE duty_id = ? AND shift_id = ?',
      [dutyId, shiftId]
    );
    await run(
      `INSERT INTO baseball_duty_persons (id, duty_id, shift_id, name, phone, team_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), dutyId, shiftId, name, String(person?.phone ?? '').trim(), person?.team_id || null,
        Number(order[0]?.n) || 1]
    );
  }, 'Person konnte nicht eingetragen werden.'), [write, query, run, dutyYear]);

  // patch: { name?, phone?, team_id? }
  const updatePerson = useCallback((id, patch) => write(() => personYear(id), async () => {
    const cols = Object.keys(patch).filter((c) => ['name', 'phone', 'team_id'].includes(c));
    if (!cols.length) return;
    if (cols.includes('name') && !String(patch.name ?? '').trim()) throw new Error('NAME_EMPTY');
    const value = (c) => (c === 'team_id' ? (patch.team_id || null) : String(patch[c] ?? '').trim());
    await run(
      `UPDATE baseball_duty_persons SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...cols.map(value), id]
    );
  }, 'Person konnte nicht gespeichert werden.'), [write, run, personYear]);

  const deletePerson = useCallback((id) => write(
    () => personYear(id),
    () => run('DELETE FROM baseball_duty_persons WHERE id = ?', [id]),
    'Person konnte nicht gelöscht werden.'
  ), [write, run, personYear]);

  // Number of persons needed in one slot; creates the slot row when it is missing.
  const setNeeded = useCallback((dutyId, shiftId, n) => write(() => dutyYear(dutyId), async () => {
    const value = Math.max(0, Math.round(Number(n) || 0));
    await run(
      `INSERT INTO baseball_duty_assignments (duty_id, shift_id, needed) VALUES (?, ?, ?)
       ON CONFLICT(duty_id, shift_id) DO UPDATE SET needed = excluded.needed`,
      [dutyId, shiftId, value]
    );
  }, 'Anzahl konnte nicht gespeichert werden.'), [write, run, dutyYear]);

  return {
    fetchDuties, addDuty, deleteDuty, addShift, updateShift, deleteShift,
    addPerson, updatePerson, deletePerson, setNeeded,
  };
}

export default useBaseballDuties;
