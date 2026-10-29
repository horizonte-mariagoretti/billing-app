import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { TrendingUp, ReceiptEuro, Scale, Plus, Edit2, Trash2, Receipt, LayoutList } from 'lucide-react';
import useLasagnenExpenses from '../hooks/useLasagnenExpenses';
import useTableSort from '../hooks/useTableSort';
import { useT } from '../hooks/useUiTranslations';
import { categoriesFor, expenseTotal } from '../utils/lasagnaFinance';
import SortableTh from './SortableTh';
import SegmentedToggle from './SegmentedToggle';
import ConfirmDialog from './ConfirmDialog';
import FinanceEntryModal from './FinanceEntryModal';
import Button from './Button';
import './DataTable.css';
import './LasagnenFinance.css';

const categoryLabel = (kind, value, t) => {
  const c = categoriesFor(kind).find((x) => x.value === value);
  return c ? t(`lasagnen_cat_${c.value}`, c.label) : (value || '');
};

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Lasagnen "Finanzen" tab: overview of all Lasagnen finances.
 * income: { total } and incomeEntries (one per Hori) come from the Übersicht (read-only here).
 * Manual entries (Ausgaben, and extra Einnahmen such as donations) are entered by hand and stored per scout year.
 * search: filters the list by name/description, category or amount (the cards stay overall).
 */
const LasagnenFinance = ({ year, yearLocked, income, incomeEntries, formatCurrency, locale, search = '', onError }) => {
  const t = useT();
  const { fetchExpenses, saveExpense, deleteExpense } = useLasagnenExpenses();
  const [records, setRecords] = useState([]); // manual entries: kind 'expense' | 'income'
  const [loadedYear, setLoadedYear] = useState(null);
  const loading = loadedYear !== year;
  const [modal, setModal] = useState(null); // null | { kind, entry: row | null, triggerRef } (add / edit popup)
  const [toDelete, setToDelete] = useState(null);
  const addExpenseRef = useRef(null);
  const addIncomeRef = useRef(null);
  const [kind, setKind] = useState('all'); // 'all' | 'income' | 'expense'
  // Unsorted = Einnahmen first (Übersicht order), then manual entries (newest first).
  const { sort, toggleSort, sortRows } = useTableSort({ key: null, dir: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchExpenses(year);
        if (!cancelled) setRecords(list || []);
      } catch {
        if (!cancelled) onError(t('lasagnen_exp_load_error', 'Einträge konnten nicht geladen werden.'));
      } finally {
        if (!cancelled) setLoadedYear(year);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const reload = useCallback(async () => {
    setRecords((await fetchExpenses(year)) || []);
  }, [fetchExpenses, year]);

  const expenses = useMemo(() => records.filter((r) => r.kind !== 'income'), [records]);
  const manualIncome = useMemo(() => records.filter((r) => r.kind === 'income'), [records]);
  const incomeTotal = round2(income.total + expenseTotal(manualIncome));
  const spent = expenseTotal(expenses);
  const saldo = round2(incomeTotal - spent);

  // One list for everything: Einnahmen from the Übersicht (read-only), manual Einnahmen and Ausgaben (editable).
  // Amounts are signed.
  const entries = useMemo(() => [
    ...incomeEntries.map((e) => ({
      key: e.id,
      kind: 'income',
      description: e.name,
      category: t('lasagnen_income_cat', 'Verkauf'),
      amount: e.amount,
    })),
    ...records.map((x) => {
      const isIncome = x.kind === 'income';
      const amount = Number(x.amount) || 0;
      return {
        key: x.id,
        kind: isIncome ? 'income' : 'expense',
        description: x.description || '',
        category: categoryLabel(isIncome ? 'income' : 'expense', x.category, t),
        amount: isIncome ? amount : -amount,
        raw: x,
      };
    }),
  ], [incomeEntries, records, t]);

  const q = search.trim().toLowerCase();
  const visible = useMemo(() => {
    const qDot = q.replace(',', '.');
    return entries.filter((x) => {
      if (kind !== 'all' && x.kind !== kind) return false;
      if (!q) return true;
      const abs = Math.abs(x.amount);
      const haystack = [
        x.description,
        x.category,
        formatCurrency(x.amount),
        String(abs),
        abs.toLocaleString(locale, { minimumFractionDigits: 2 }),
      ].join(' ').toLowerCase();
      return haystack.includes(q) || haystack.includes(qDot);
    });
  }, [entries, kind, q, locale, formatCurrency]);
  const shownTotal = round2(visible.reduce((s, x) => s + x.amount, 0));

  const sorted = useMemo(() => sortRows(visible, {
    description: (x) => x.description.toLowerCase(),
    category: (x) => x.category.toLowerCase(),
    amount: (x) => x.amount,
  }, { tieBreak: (x) => x.description, locale }), [visible, sortRows, locale]);

  const incomeCount = incomeEntries.length + manualIncome.length;

  // Throws on failure so the popup can show its save error and stay open.
  const handleSave = async (entry) => {
    if (yearLocked) return;
    await saveExpense(year, entry);
    await reload();
    setModal(null);
  };

  const confirmDelete = async () => {
    const id = toDelete.id;
    setToDelete(null);
    try {
      await deleteExpense(year, id);
      await reload();
    } catch {
      onError(t('lasagnen_save_error', 'Änderung konnte nicht gespeichert werden.'));
    }
  };

  const sortTh = (key, label, align = 'left') => (
    <SortableTh column={key} label={label} align={align} sort={sort} onSort={toggleSort} />
  );

  return (
    <div className="lasagnen-finance">
      <div className="lasagnen-summary">
        <div className="lasagnen-summary-card">
          <div className="lasagnen-summary-icon income"><TrendingUp size={20} /></div>
          <div className="lasagnen-summary-body">
            <div className="lasagnen-summary-label">{t('lasagnen_income', 'Einnahmen')}</div>
            <div className="lasagnen-summary-value">{formatCurrency(incomeTotal)}</div>
          </div>
        </div>
        <div className="lasagnen-summary-card">
          <div className="lasagnen-summary-icon expense"><ReceiptEuro size={20} /></div>
          <div className="lasagnen-summary-body">
            <div className="lasagnen-summary-label">{t('lasagnen_expenses', 'Ausgaben')}</div>
            <div className="lasagnen-summary-value">{formatCurrency(spent)}</div>
          </div>
        </div>
        <div className="lasagnen-summary-card">
          <div className="lasagnen-summary-icon saldo"><Scale size={20} /></div>
          <div className="lasagnen-summary-body">
            <div className="lasagnen-summary-label">{t('lasagnen_saldo', 'Saldo')}</div>
            <div className={`lasagnen-summary-value${saldo < 0 ? ' lasagnen-negative' : ''}`}>{formatCurrency(saldo)}</div>
          </div>
        </div>
      </div>

      <div className="lasagnen-finance-toolbar">
        <SegmentedToggle
          ariaLabel={t('lasagnen_finance_filter', 'Filter')}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: t('lasagnen_filter_all', 'Alle'), icon: <LayoutList size={15} />, count: incomeCount + expenses.length },
            { value: 'income', label: t('lasagnen_income', 'Einnahmen'), icon: <TrendingUp size={15} />, count: incomeCount },
            { value: 'expense', label: t('lasagnen_expenses', 'Ausgaben'), icon: <ReceiptEuro size={15} />, count: expenses.length },
          ]}
        />
        {!yearLocked && (
          <div className="lasagnen-finance-actions">
            <Button
              ref={addIncomeRef}
              variant="secondary"
              size="md"
              icon={Plus}
              onClick={() => setModal({ kind: 'income', entry: null, triggerRef: addIncomeRef })}
            >
              {t('lasagnen_inc_add', 'Einnahme hinzufügen')}
            </Button>
            <Button
              ref={addExpenseRef}
              variant="primary"
              size="md"
              icon={Plus}
              onClick={() => setModal({ kind: 'expense', entry: null, triggerRef: addExpenseRef })}
            >
              {t('lasagnen_exp_add', 'Ausgabe hinzufügen')}
            </Button>
          </div>
        )}
      </div>

      <div className="data-table-container">
        {loading || visible.length === 0 ? (
          <div className="lasagnen-empty">
            <Receipt size={36} strokeWidth={1.4} />
            <div className="lasagnen-empty-title">
              {loading
                ? t('loading', 'Laden…')
                : entries.length > 0
                  ? (q
                    ? `${t('lasagnen_exp_no_match', 'Keine Einträge gefunden für')} "${search.trim()}"`
                    : t('lasagnen_exp_empty_kind', 'Keine Einträge in dieser Ansicht'))
                  : t('lasagnen_exp_empty', 'Noch keine Einnahmen oder Ausgaben')}
            </div>
            {!loading && q && entries.length > 0 && (
              <div className="lasagnen-empty-desc">{t('try_different_search', 'Versuche einen anderen Suchbegriff.')}</div>
            )}
          </div>
        ) : (
          <table className="data-table lasagnen-exp-table">
            <colgroup>
              <col />
              <col className="lasagnen-col-cat" />
              <col className="lasagnen-col-amount" />
              {!yearLocked && <col className="lasagnen-col-actions" />}
            </colgroup>
            <thead>
              <tr>
                {sortTh('description', t('lasagnen_exp_col_desc_name', 'Beschreibung / Hori'))}
                {sortTh('category', t('lasagnen_exp_col_cat', 'Kategorie'))}
                {sortTh('amount', t('lasagnen_exp_col_amount', 'Betrag'), 'right')}
                {!yearLocked && <th aria-label={t('actions', 'Aktionen')} />}
              </tr>
            </thead>
            <tbody>
              {sorted.map((x) => (
                <tr key={x.key}>
                  <td className="lasagnen-exp-desc-cell">{x.description}</td>
                  <td>{x.category}</td>
                  <td className={`num dt-mono ${x.kind === 'income' ? 'lasagnen-amount-in' : 'lasagnen-amount-out'}`}>{formatCurrency(x.amount)}</td>
                  {!yearLocked && (
                    <td className="lasagnen-exp-row-actions">
                      {x.raw && (
                        <>
                          <button type="button" onClick={() => setModal({ kind: x.kind, entry: x.raw, triggerRef: null })} title={t('btn_edit', 'Bearbeiten')} aria-label={`${t('btn_edit', 'Bearbeiten')}: ${x.description}`}>
                            <Edit2 size={16} />
                          </button>
                          <button type="button" onClick={() => setToDelete({ ...x.raw, kind: x.kind })} title={t('btn_delete', 'Löschen')} aria-label={`${t('btn_delete', 'Löschen')}: ${x.description}`}>
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{t('lasagnen_saldo', 'Saldo')}</td>
                <td />
                <td className={`num dt-mono${shownTotal < 0 ? ' lasagnen-negative' : ''}`}>{formatCurrency(shownTotal)}</td>
                {!yearLocked && <td />}
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {modal && !yearLocked && (
        <FinanceEntryModal
          kind={modal.kind}
          entry={modal.entry}
          onSave={handleSave}
          onCancel={() => setModal(null)}
          triggerRef={modal.triggerRef}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title={toDelete.kind === 'income' ? t('lasagnen_inc_delete_title', 'Einnahme löschen?') : t('lasagnen_exp_delete_title', 'Ausgabe löschen?')}
          message={`${toDelete.description} (${formatCurrency(Number(toDelete.amount) || 0)})`}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
};

export default LasagnenFinance;
