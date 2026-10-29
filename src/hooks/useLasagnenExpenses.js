import { useCallback } from 'react';
import useDatabase from './useDatabase';

// Lasagnen manual entries per scout year: expenses (kind 'expense') and extra income (kind 'income', e.g. donations).
// The per-Hori income is derived from the Übersicht, not stored here.
const useLasagnenExpenses = () => {
  const { query, run } = useDatabase();

  const fetchExpenses = useCallback(async (year) => {
    return await query(
      'SELECT id, kind, description, category, amount FROM lasagna_expenses WHERE year = ? ORDER BY created_at DESC',
      [year]
    );
  }, [query]);

  const assertYearOpen = useCallback(async (year) => {
    const rows = await query('SELECT locked FROM app_years WHERE year = ?', [year]);
    if (rows[0]?.locked) throw new Error('YEAR_LOCKED');
  }, [query]);

  // expense: { id?, kind?, description, category, amount }. Without id a new row is created (kind defaults to 'expense';
  // the kind of an existing row is never changed).
  const saveExpense = useCallback(async (year, expense) => {
    await assertYearOpen(year);
    const params = [
      String(expense.description).trim(),
      expense.category || null,
      Number(expense.amount),
    ];
    if (expense.id) {
      await run(
        'UPDATE lasagna_expenses SET description = ?, category = ?, amount = ? WHERE id = ? AND year = ?',
        [...params, expense.id, year]
      );
      return expense.id;
    }
    const id = crypto.randomUUID();
    await run(
      'INSERT INTO lasagna_expenses (id, year, kind, description, category, amount) VALUES (?, ?, ?, ?, ?, ?)',
      [id, year, expense.kind === 'income' ? 'income' : 'expense', ...params]
    );
    return id;
  }, [run, assertYearOpen]);

  const deleteExpense = useCallback(async (year, id) => {
    await assertYearOpen(year);
    await run('DELETE FROM lasagna_expenses WHERE id = ? AND year = ?', [id, year]);
  }, [run, assertYearOpen]);

  return { fetchExpenses, saveExpense, deleteExpense };
};

export default useLasagnenExpenses;
