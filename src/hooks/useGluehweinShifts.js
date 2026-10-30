import { useCallback } from 'react';
import useDatabase from './useDatabase';
import { fmtMinutes, shiftTimeError, toMinutes } from '../utils/shiftLayout';

const sameTime = (a, b) => String(a ?? '').slice(0, 5) === String(b ?? '').slice(0, 5);

// Checks hand-entered times ("HH:MM"); end before start = next day, max 12 h. Returns [start, end].
// Throws BAD_SLOT_TIME / SLOT_TOO_LONG.
const checkTimes = (start, end) => {
  const err = shiftTimeError(start, end);
  if (err) throw new Error(err);
  return [fmtMinutes(toMinutes(start)), fmtMinutes(toMinutes(end))];
};

const TEMPLATE_RE = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/;

// Parses "HH:MM-HH:MM" into [start, end]; throws BAD_TEMPLATE otherwise.
const parseTemplate = (key) => {
  const m = TEMPLATE_RE.exec(String(key ?? '').trim());
  if (!m) throw new Error('BAD_TEMPLATE');
  return [`${m[1]}:${m[2]}`, `${m[3]}:${m[4]}`];
};

// Shift slots per sales day of a Verkaufsaktion and the Horis assigned to them.
export function useGluehweinShifts(action) {
  const { query, run, transaction } = useDatabase();

  const assertYearOpen = useCallback(async (year) => {
    const rows = await query('SELECT locked FROM app_years WHERE year = ?', [year]);
    if (rows[0]?.locked) throw new Error('YEAR_LOCKED');
  }, [query]);

  // Year of the day a shift belongs to; null if the shift does not exist (for this action).
  const shiftYear = useCallback(async (shiftId) => {
    const rows = await query(
      `SELECT d.year FROM gw_shifts s JOIN sales_days d ON d.id = s.day_id
        WHERE s.id = ? AND d.action = ?`,
      [shiftId, action]
    );
    return rows.length ? rows[0].year : null;
  }, [query, action]);

  const fetchShifts = useCallback(async (year) => {
    const shifts = await query(
      `SELECT s.id, s.day_id, d.date, s.start_time, s.end_time
         FROM gw_shifts s JOIN sales_days d ON d.id = s.day_id
        WHERE d.action = ? AND d.year = ?
        ORDER BY d.date ASC, s.start_time ASC`,
      [action, year]
    );
    const assignments = await query(
      `SELECT a.shift_id, a.hori_id
         FROM gw_shift_assignments a
         JOIN gw_shifts s ON s.id = a.shift_id
         JOIN sales_days d ON d.id = s.day_id
        WHERE d.action = ? AND d.year = ?`,
      [action, year]
    );
    const byShift = new Map();
    for (const a of assignments) {
      if (!byShift.has(a.shift_id)) byShift.set(a.shift_id, []);
      byShift.get(a.shift_id).push(a.hori_id);
    }
    return shifts.map((s) => ({ ...s, horis: byShift.get(s.id) || [] }));
  }, [query, action]);

  // Adds one slot per template key ("HH:MM-HH:MM") to a day; slots whose start_time already exists are skipped.
  const addSlots = useCallback(async (dayId, templateKeys) => {
    const parsed = (templateKeys || []).map(parseTemplate);
    const days = await query('SELECT year FROM sales_days WHERE id = ? AND action = ?', [dayId, action]);
    if (!days.length) return;
    await assertYearOpen(days[0].year);
    const existing = await query('SELECT start_time FROM gw_shifts WHERE day_id = ?', [dayId]);
    const seen = new Set(existing.map((r) => r.start_time));
    const ops = [];
    for (const [start, end] of parsed) {
      if (seen.has(start)) continue;
      seen.add(start);
      ops.push({
        sql: 'INSERT OR IGNORE INTO gw_shifts (id, day_id, start_time, end_time) VALUES (?, ?, ?, ?)',
        params: [crypto.randomUUID(), dayId, start, end],
      });
    }
    if (ops.length) await transaction(ops);
  }, [query, transaction, action, assertYearOpen]);

  // Adds one shift with free times to a day; throws SLOT_EXISTS when the day already has a shift with that start.
  const addSlot = useCallback(async (dayId, start, end) => {
    const [s, e] = checkTimes(start, end);
    const days = await query('SELECT year FROM sales_days WHERE id = ? AND action = ?', [dayId, action]);
    if (!days.length) return;
    await assertYearOpen(days[0].year);
    const existing = await query('SELECT start_time FROM gw_shifts WHERE day_id = ?', [dayId]);
    if (existing.some((r) => sameTime(r.start_time, s))) throw new Error('SLOT_EXISTS');
    await run(
      'INSERT INTO gw_shifts (id, day_id, start_time, end_time) VALUES (?, ?, ?, ?)',
      [crypto.randomUUID(), dayId, s, e]
    );
  }, [query, run, action, assertYearOpen]);

  // Changes the times of a shift; its Horis stay assigned (keyed by shift id).
  const updateSlot = useCallback(async (id, start, end) => {
    const [s, e] = checkTimes(start, end);
    const rows = await query(
      `SELECT s.day_id, d.year FROM gw_shifts s JOIN sales_days d ON d.id = s.day_id
        WHERE s.id = ? AND d.action = ?`,
      [id, action]
    );
    if (!rows.length) return;
    await assertYearOpen(rows[0].year);
    const others = await query('SELECT start_time FROM gw_shifts WHERE day_id = ? AND id <> ?', [rows[0].day_id, id]);
    if (others.some((r) => sameTime(r.start_time, s))) throw new Error('SLOT_EXISTS');
    await run('UPDATE gw_shifts SET start_time = ?, end_time = ? WHERE id = ?', [s, e, id]);
  }, [query, run, action, assertYearOpen]);

  // Copies the shift times (not the Horis) of one day to another; starts that already exist are skipped.
  // Returns the number of copied shifts.
  const copySlots = useCallback(async (fromDayId, toDayId) => {
    if (fromDayId === toDayId) return 0;
    const days = await query('SELECT year FROM sales_days WHERE id = ? AND action = ?', [toDayId, action]);
    if (!days.length) return 0;
    await assertYearOpen(days[0].year);
    const source = await query(
      `SELECT s.start_time, s.end_time FROM gw_shifts s JOIN sales_days d ON d.id = s.day_id
        WHERE s.day_id = ? AND d.action = ? ORDER BY s.start_time ASC`,
      [fromDayId, action]
    );
    const existing = await query('SELECT start_time FROM gw_shifts WHERE day_id = ?', [toDayId]);
    const seen = new Set(existing.map((r) => String(r.start_time).slice(0, 5)));
    const ops = [];
    for (const r of source) {
      const start = String(r.start_time).slice(0, 5);
      if (seen.has(start)) continue;
      seen.add(start);
      ops.push({
        sql: 'INSERT OR IGNORE INTO gw_shifts (id, day_id, start_time, end_time) VALUES (?, ?, ?, ?)',
        params: [crypto.randomUUID(), toDayId, start, r.end_time ? String(r.end_time).slice(0, 5) : r.end_time],
      });
    }
    if (ops.length) await transaction(ops);
    return ops.length;
  }, [query, transaction, action, assertYearOpen]);

  const removeSlot = useCallback(async (id) => {
    const year = await shiftYear(id);
    if (year == null) return;
    await assertYearOpen(year);
    await run('DELETE FROM gw_shifts WHERE id = ?', [id]);
  }, [run, shiftYear, assertYearOpen]);

  const assign = useCallback(async (shiftId, horiId) => {
    const year = await shiftYear(shiftId);
    if (year == null) return;
    await assertYearOpen(year);
    await run(
      'INSERT OR IGNORE INTO gw_shift_assignments (shift_id, hori_id) VALUES (?, ?)',
      [shiftId, horiId]
    );
  }, [run, shiftYear, assertYearOpen]);

  const unassign = useCallback(async (shiftId, horiId) => {
    const year = await shiftYear(shiftId);
    if (year == null) return;
    await assertYearOpen(year);
    await run('DELETE FROM gw_shift_assignments WHERE shift_id = ? AND hori_id = ?', [shiftId, horiId]);
  }, [run, shiftYear, assertYearOpen]);

  return { fetchShifts, addSlots, addSlot, updateSlot, copySlots, removeSlot, assign, unassign };
}
