import { useCallback } from 'react';
import useDatabase from './useDatabase';

const toCount = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Lasagnen: one order row per Hori (Bolo/Veggie portion counts + paid flag).
const useLasagnen = () => {
  const { query, run } = useDatabase();

  // All Horis with their order (0/0/unpaid when none saved yet).
  const fetchOrders = useCallback(async (year) => {
    return await query(`
      SELECT
        h.id AS hori_id, h.first_name, h.last_name, h.active,
        COALESCE(o.bolo, 0) AS bolo,
        COALESCE(o.veggie, 0) AS veggie,
        COALESCE(o.paid, 0) AS paid,
        o.final_amount
      FROM horis h
      LEFT JOIN lasagna_orders o ON o.hori_id = h.id AND o.year = ?
      ORDER BY h.last_name COLLATE NOCASE ASC, h.first_name COLLATE NOCASE ASC
    `, [year]);
  }, [query]);

  // final_amount: number, or null when not entered yet. Callers validate it against the minimum.
  const saveOrder = useCallback(async (year, { hori_id, bolo, veggie, paid, final_amount }) => {
    const lockRows = await query('SELECT locked FROM app_years WHERE year = ?', [year]);
    if (lockRows[0]?.locked) throw new Error('YEAR_LOCKED');
    const finalAmount = final_amount === null || final_amount === undefined || final_amount === ''
      ? null
      : Number(final_amount);
    await run(
      `INSERT INTO lasagna_orders (id, hori_id, year, bolo, veggie, paid, final_amount) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(hori_id, year) DO UPDATE SET
         bolo = excluded.bolo, veggie = excluded.veggie, paid = excluded.paid,
         final_amount = excluded.final_amount`,
      [crypto.randomUUID(), hori_id, year, toCount(bolo), toCount(veggie), paid ? 1 : 0,
        Number.isFinite(finalAmount) ? finalAmount : null]
    );
  }, [query, run]);

  return { fetchOrders, saveOrder };
};

export default useLasagnen;
