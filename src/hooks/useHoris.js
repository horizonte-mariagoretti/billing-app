import { useCallback } from 'react';
import useDatabase from './useDatabase';
import { SCOUT_YEAR_SQL } from '../utils/scoutYear';

const newId = () => crypto.randomUUID();
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const useHoris = () => {
  const { query, run, transaction } = useDatabase();

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
    await transaction([
      {
        sql: `INSERT INTO horis (id, first_name, last_name, birth_date, active) VALUES (?, ?, ?, ?, ?)`,
        params: [id, hori.first_name, hori.last_name, birth, active],
      },
      {
        sql: `INSERT OR IGNORE INTO hori_years (hori_id, year, active)
              SELECT ?, year, ? FROM app_years ORDER BY year DESC LIMIT 1`,
        params: [id, active],
      },
    ]);
    return id;
  }, [run, transaction]);

  // Insert many Horis atomically (all or nothing). Returns the number inserted.
  const saveHorisBulk = useCallback(async (list) => {
    if (!list?.length) return 0;
    await transaction(list.flatMap((x) => {
      const id = newId();
      return [
        {
          sql: 'INSERT INTO horis (id, first_name, last_name, birth_date, active) VALUES (?, ?, ?, ?, 1)',
          params: [id, x.first_name, x.last_name, x.birth_date || null],
        },
        {
          sql: `INSERT OR IGNORE INTO hori_years (hori_id, year, active)
                SELECT ?, year, 1 FROM app_years ORDER BY year DESC LIMIT 1`,
          params: [id],
        },
      ];
    }));
    return list.length;
  }, [transaction]);

  const deleteHori = useCallback(async (id) => {
    const rows = await query('SELECT COUNT(*) AS n FROM job_assignments WHERE hori_id = ?', [id]);
    if ((rows?.[0]?.n ?? 0) > 0) throw new Error('HORI_HAS_ASSIGNMENTS');
    const orders = await query('SELECT COUNT(*) AS n FROM lasagna_orders WHERE hori_id = ?', [id]);
    if ((orders?.[0]?.n ?? 0) > 0) {
      throw new Error('HORI_HAS_LASAGNA_ORDERS: Hori has lasagna orders — set the Hori inactive instead of deleting.');
    }
    await run('DELETE FROM horis WHERE id = ?', [id]);
  }, [query, run]);

  const fetchHoriStats = useCallback(async (year) => {
    const rows = await query(`
      SELECT
        h.id, h.first_name, h.last_name, h.birth_date, hy.active AS active,
        COUNT(j.id) AS job_count,
        COALESCE(SUM(CASE WHEN j.id IS NOT NULL THEN a.actual_hours END), 0) AS total_actual_hours,
        COALESCE(SUM(CASE WHEN j.status = 'planned' AND a.actual_hours IS NULL
                          THEN a.planned_hours ELSE 0 END), 0) AS planned_hours_upcoming
      FROM horis h
      INNER JOIN hori_years hy ON hy.hori_id = h.id AND hy.year = ?
      LEFT JOIN job_assignments a ON a.hori_id = h.id
      LEFT JOIN jobs j ON j.id = a.job_id AND ${SCOUT_YEAR_SQL('j.date')} = ?
      GROUP BY h.id
      ORDER BY h.last_name COLLATE NOCASE ASC, h.first_name COLLATE NOCASE ASC
    `, [year, year]);
    // Inactive Horis don't count: their hours stay on their row but are left out of
    // the total, so everyone else's share is computed over active Horis only.
    const isOn = (r) => r.active === 1 || r.active === true;
    const sum = rows.reduce((acc, r) => acc + (isOn(r) ? (Number(r.total_actual_hours) || 0) : 0), 0);
    return rows.map((r) => ({
      ...r,
      total_actual_hours: round2(r.total_actual_hours),
      planned_hours_upcoming: round2(r.planned_hours_upcoming),
      share_pct: isOn(r) && sum > 0 ? round2((100 * (Number(r.total_actual_hours) || 0)) / sum) : 0,
    }));
  }, [query]);

  const fetchHoriJobs = useCallback(async (horiId, year) => {
    return await query(`
      SELECT
        j.id AS job_id, j.title, j.date, j.start_time, j.end_time, j.open_end, j.status,
        a.planned_hours, a.actual_hours
      FROM job_assignments a
      JOIN jobs j ON j.id = a.job_id AND ${SCOUT_YEAR_SQL('j.date')} = ?
      WHERE a.hori_id = ?
      ORDER BY j.date DESC, j.start_time DESC
    `, [year, horiId]);
  }, [query]);

  const fetchMatrix = useCallback(async (year) => {
    const [jobs, horis, assignments] = await Promise.all([
      query(`SELECT * FROM jobs WHERE ${SCOUT_YEAR_SQL('date')} = ? ORDER BY date ASC, start_time ASC`, [year]),
      query(`SELECT h.*, hy.active AS active FROM horis h
             INNER JOIN hori_years hy ON hy.hori_id = h.id AND hy.year = ?
             WHERE hy.active = 1
             ORDER BY h.last_name COLLATE NOCASE ASC, h.first_name COLLATE NOCASE ASC`, [year]),
      query(`SELECT a.job_id, a.hori_id, a.planned_hours, a.actual_hours FROM job_assignments a
             JOIN jobs j ON j.id = a.job_id AND ${SCOUT_YEAR_SQL('j.date')} = ?`, [year]),
    ]);
    return { jobs, horis, assignments };
  }, [query]);

  return {
    fetchHoris,
    saveHori,
    saveHorisBulk,
    deleteHori,
    fetchHoriStats,
    fetchHoriJobs,
    fetchMatrix,
  };
};

export default useHoris;
