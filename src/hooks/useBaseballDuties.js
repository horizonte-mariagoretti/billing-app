import { useCallback } from 'react';
import useDatabase from './useDatabase';

// Baseballturnier parent duties (Elterndienste, migration 47): duties are the rows (Theke, Burger, Bons, Putzen ...),
// shifts the columns (Schicht 1, Schicht 2 ...), and each cell holds the parents' names as free text. Per scout year.
export function useBaseballDuties() {
  const { query, run } = useDatabase();

  const assertYearOpen = useCallback(async (year) => {
    const rows = await query('SELECT locked FROM app_years WHERE year = ?', [year]);
    if (rows[0]?.locked) throw new Error('YEAR_LOCKED');
  }, [query]);

  // { duties: [{id, name}], shifts: [{id, label, start_time, end_time}], cells: Map 'dutyId|shiftId' -> persons }
  const fetchDuties = useCallback(async (year) => {
    const duties = await query(
      'SELECT id, name FROM baseball_duties WHERE year = ? ORDER BY sort_order, name',
      [year]
    );
    const shifts = await query(
      'SELECT id, label, start_time, end_time FROM baseball_duty_shifts WHERE year = ? ORDER BY sort_order, label',
      [year]
    );
    const assignments = await query(
      `SELECT a.duty_id, a.shift_id, a.persons
         FROM baseball_duty_assignments a
         JOIN baseball_duties d ON d.id = a.duty_id
        WHERE d.year = ?`,
      [year]
    );
    const cells = new Map(assignments.map((a) => [`${a.duty_id}|${a.shift_id}`, a.persons]));
    return { duties, shifts, cells };
  }, [query]);

  const addDuty = useCallback(async (year, name) => {
    const clean = String(name ?? '').trim();
    if (!clean) throw new Error('NAME_EMPTY');
    await assertYearOpen(year);
    const order = await query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM baseball_duties WHERE year = ?', [year]);
    await run(
      'INSERT INTO baseball_duties (id, year, name, sort_order) VALUES (?, ?, ?, ?)',
      [crypto.randomUUID(), year, clean, Number(order[0]?.n) || 1]
    );
  }, [query, run, assertYearOpen]);

  const deleteDuty = useCallback(async (year, id) => {
    await assertYearOpen(year);
    await run('DELETE FROM baseball_duties WHERE id = ?', [id]);
  }, [run, assertYearOpen]);

  const addShift = useCallback(async (year, label, start, end) => {
    const clean = String(label ?? '').trim();
    if (!clean) throw new Error('NAME_EMPTY');
    await assertYearOpen(year);
    const order = await query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM baseball_duty_shifts WHERE year = ?', [year]);
    await run(
      'INSERT INTO baseball_duty_shifts (id, year, label, start_time, end_time, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [crypto.randomUUID(), year, clean, start || null, end || null, Number(order[0]?.n) || 1]
    );
  }, [query, run, assertYearOpen]);

  const deleteShift = useCallback(async (year, id) => {
    await assertYearOpen(year);
    await run('DELETE FROM baseball_duty_shifts WHERE id = ?', [id]);
  }, [run, assertYearOpen]);

  // Saves the names of one cell; an empty text removes the cell's row.
  const saveCell = useCallback(async (year, dutyId, shiftId, persons) => {
    await assertYearOpen(year);
    const text = String(persons ?? '').trim();
    if (!text) {
      await run('DELETE FROM baseball_duty_assignments WHERE duty_id = ? AND shift_id = ?', [dutyId, shiftId]);
      return;
    }
    await run(
      `INSERT INTO baseball_duty_assignments (duty_id, shift_id, persons) VALUES (?, ?, ?)
       ON CONFLICT(duty_id, shift_id) DO UPDATE SET persons = excluded.persons`,
      [dutyId, shiftId, text]
    );
  }, [run, assertYearOpen]);

  return { fetchDuties, addDuty, deleteDuty, addShift, deleteShift, saveCell };
}

export default useBaseballDuties;
