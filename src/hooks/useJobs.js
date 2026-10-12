import { useCallback } from 'react';
import useDatabase from './useDatabase';

const newId = () => crypto.randomUUID();
const nullIfEmpty = (v) => (v === undefined || v === null || v === '' ? null : v);
const numOrNull = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const useJobs = () => {
  const { query, transaction } = useDatabase();

  const fetchJobs = useCallback(async () => {
    return await query(`
      SELECT
        j.*,
        c.name   AS client_name,
        q.number AS quote_number,
        i.number AS invoice_number,
        (SELECT COUNT(*) FROM job_assignments a WHERE a.job_id = j.id) AS people_count,
        (SELECT COALESCE(SUM(a.planned_hours), 0) FROM job_assignments a WHERE a.job_id = j.id) AS planned_hours_total,
        (SELECT COALESCE(SUM(a.actual_hours), 0) FROM job_assignments a WHERE a.job_id = j.id) AS actual_hours_total
      FROM jobs j
      LEFT JOIN clients c   ON c.id = j.client_id
      LEFT JOIN documents q ON q.id = j.quote_id
      LEFT JOIN documents i ON i.id = j.invoice_id
      ORDER BY j.date DESC, j.start_time DESC
    `);
  }, [query]);

  const fetchJob = useCallback(async (id) => {
    const rows = await query('SELECT * FROM jobs WHERE id = ?', [id]);
    if (!rows?.length) return null;
    const assignments = await query(`
      SELECT a.hori_id, h.first_name, h.last_name, a.planned_hours, a.actual_hours
      FROM job_assignments a
      JOIN horis h ON h.id = a.hori_id
      WHERE a.job_id = ?
      ORDER BY h.last_name COLLATE NOCASE ASC, h.first_name COLLATE NOCASE ASC
    `, [id]);
    return { ...rows[0], assignments };
  }, [query]);

  const saveJob = useCallback(async (job) => {
    const isUpdate = !!job.id;
    const id = job.id || newId();
    const fields = [
      job.title,
      job.date,
      nullIfEmpty(job.start_time),
      nullIfEmpty(job.end_time),
      job.open_end ? 1 : 0,
      nullIfEmpty(job.client_id),
      nullIfEmpty(job.quote_id),
      nullIfEmpty(job.invoice_id),
      nullIfEmpty(job.notes),
      job.status || 'planned',
    ];
    const operations = [];
    if (isUpdate) {
      operations.push({
        sql: `UPDATE jobs SET
          title = ?, date = ?, start_time = ?, end_time = ?, open_end = ?,
          client_id = ?, quote_id = ?, invoice_id = ?, notes = ?, status = ?
          WHERE id = ?`,
        params: [...fields, id],
      });
      operations.push({ sql: 'DELETE FROM job_assignments WHERE job_id = ?', params: [id] });
    } else {
      operations.push({
        sql: `INSERT INTO jobs (
          id, title, date, start_time, end_time, open_end,
          client_id, quote_id, invoice_id, notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [id, ...fields],
      });
    }
    // Dedupe by hori_id so UNIQUE(job_id, hori_id) can't abort the transaction.
    const seen = new Set();
    (job.assignments || []).forEach((a) => {
      if (!a?.hori_id || seen.has(a.hori_id)) return;
      seen.add(a.hori_id);
      operations.push({
        sql: `INSERT INTO job_assignments (id, job_id, hori_id, planned_hours, actual_hours)
              VALUES (?, ?, ?, ?, ?)`,
        params: [newId(), id, a.hori_id, numOrNull(a.planned_hours), numOrNull(a.actual_hours)],
      });
    });
    await transaction(operations);
    return id;
  }, [transaction]);

  const deleteJob = useCallback(async (id) => {
    await transaction([
      { sql: 'DELETE FROM job_assignments WHERE job_id = ?', params: [id] },
      { sql: 'DELETE FROM jobs WHERE id = ?', params: [id] },
    ]);
  }, [transaction]);

  const fetchDocumentOptions = useCallback(async () => {
    const rows = await query(`
      SELECT id, type, number, title, client_id
      FROM documents
      WHERE type IN ('quote', 'invoice')
      ORDER BY date DESC, number DESC
    `);
    const strip = ({ id, number, title, client_id }) => ({ id, number, title, client_id });
    return {
      quotes: rows.filter((r) => r.type === 'quote').map(strip),
      invoices: rows.filter((r) => r.type === 'invoice').map(strip),
    };
  }, [query]);

  return {
    fetchJobs,
    fetchJob,
    saveJob,
    deleteJob,
    fetchDocumentOptions,
  };
};

export default useJobs;
