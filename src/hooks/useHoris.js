import { useCallback } from 'react';
import useDatabase from './useDatabase';

const newId = () => crypto.randomUUID();
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const useHoris = () => {
  const { query, run } = useDatabase();

  const fetchHoris = useCallback(async () => {
    return await query(
      'SELECT * FROM horis ORDER BY last_name COLLATE NOCASE ASC, first_name COLLATE NOCASE ASC'
    );
  }, [query]);

  const saveHori = useCallback(async (hori) => {
    const active = hori.active === undefined || hori.active === null ? 1 : (hori.active ? 1 : 0);
    const birth = hori.birth_date || null;
    if (hori.id) {
      await run(
        `UPDATE horis SET first_name = ?, last_name = ?, birth_date = ?, active = ? WHERE id = ?`,
        [hori.first_name, hori.last_name, birth, active, hori.id]
      );
      return hori.id;
    }
    const id = newId();
    await run(
      `INSERT INTO horis (id, first_name, last_name, birth_date, active) VALUES (?, ?, ?, ?, ?)`,
      [id, hori.first_name, hori.last_name, birth, active]
    );
    return id;
  }, [run]);

  const deleteHori = useCallback(async (id) => {
    const rows = await query('SELECT COUNT(*) AS n FROM job_assignments WHERE hori_id = ?', [id]);
    if ((rows?.[0]?.n ?? 0) > 0) throw new Error('HORI_HAS_ASSIGNMENTS');
    await run('DELETE FROM horis WHERE id = ?', [id]);
  }, [query, run]);

  const fetchHoriStats = useCallback(async () => {
    const rows = await query(`
      SELECT
        h.id, h.first_name, h.last_name, h.birth_date, h.active,
        COUNT(a.id) AS job_count,
        COALESCE(SUM(a.actual_hours), 0) AS total_actual_hours,
        COALESCE(SUM(CASE WHEN j.status = 'planned' AND a.actual_hours IS NULL
                          THEN a.planned_hours ELSE 0 END), 0) AS planned_hours_upcoming
      FROM horis h
      LEFT JOIN job_assignments a ON a.hori_id = h.id
      LEFT JOIN jobs j ON j.id = a.job_id
      GROUP BY h.id
      ORDER BY h.last_name COLLATE NOCASE ASC, h.first_name COLLATE NOCASE ASC
    `);
    const sum = rows.reduce((acc, r) => acc + (Number(r.total_actual_hours) || 0), 0);
    return rows.map((r) => ({
      ...r,
      total_actual_hours: round2(r.total_actual_hours),
      planned_hours_upcoming: round2(r.planned_hours_upcoming),
      share_pct: sum > 0 ? round2((100 * (Number(r.total_actual_hours) || 0)) / sum) : 0,
    }));
  }, [query]);

  const fetchHoriJobs = useCallback(async (horiId) => {
    return await query(`
      SELECT
        j.id AS job_id, j.title, j.date, j.start_time, j.end_time, j.open_end, j.status,
        a.planned_hours, a.actual_hours
      FROM job_assignments a
      JOIN jobs j ON j.id = a.job_id
      WHERE a.hori_id = ?
      ORDER BY j.date DESC, j.start_time DESC
    `, [horiId]);
  }, [query]);

  const fetchMatrix = useCallback(async () => {
    const [jobs, horis, assignments] = await Promise.all([
      query('SELECT * FROM jobs ORDER BY date ASC, start_time ASC'),
      query('SELECT * FROM horis WHERE active = 1 ORDER BY last_name COLLATE NOCASE ASC, first_name COLLATE NOCASE ASC'),
      query('SELECT job_id, hori_id, planned_hours, actual_hours FROM job_assignments'),
    ]);
    return { jobs, horis, assignments };
  }, [query]);

  return {
    fetchHoris,
    saveHori,
    deleteHori,
    fetchHoriStats,
    fetchHoriJobs,
    fetchMatrix,
  };
};

export default useHoris;
