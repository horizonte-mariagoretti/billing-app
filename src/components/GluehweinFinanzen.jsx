import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { TrendingUp, ReceiptEuro, Scale, Plus, Edit2, Trash2, Receipt, LayoutList, Lock } from 'lucide-react';
import { useSalesEntries } from '../hooks/useSalesEntries';
import { useSalesKasse } from '../hooks/useSalesKasse';
import useCurrency from '../hooks/useCurrency';
import useTableSort from '../hooks/useTableSort';
import { saldo as computeSaldo, kasseIncome } from '../utils/gluehweinFinance';
import SortableTh from './SortableTh';
import SegmentedToggle from './SegmentedToggle';
import ConfirmDialog from './ConfirmDialog';
import FinanceEntryModal from './FinanceEntryModal';
import Button from './Button';
import './DataTable.css';
import './GluehweinFinanzen.css';

/**
 * Default entry categories of a Verkaufsaktion (key stored, German label shown).
 * The keys ingredients/packaging/material/other/donation/other_income match the Lasagnen
 * categories, so FinanceEntryModal (which still uses its own list) stores compatible keys.
 */
const SALES_ENTRY_CATEGORIES = {
  expense: [
    { value: 'ingredients', label: 'Zutaten' },
    { value: 'packaging', label: 'Verpackung' },
    { value: 'material', label: 'Material' },
    { value: 'stand_fee', label: 'Standmiete' },
    { value: 'other', label: 'Sonstiges' },
  ],
  income: [
    { value: 'donation', label: 'Spende' },
    { value: 'other_income', label: 'Sonstiges' },
  ],
};

// Categories of the virtual Kasse income lines (kasseIncome) and of old booked Kasse entries.
const KASSE_LABELS = { kasse: 'Kasse', kasse_cash: 'Kasse Bargeld', kasse_card: 'Kartenzahlung' };

const categoryLabel = (kind, value) => {
  if (KASSE_LABELS[value]) return KASSE_LABELS[value];
  const c = (SALES_ENTRY_CATEGORIES[kind] || []).find((x) => x.value === value);
  return c ? c.label : (value || '');
};

const round2 = (n) => Math.round(n * 100) / 100;

const ERROR_TEXT = {
  YEAR_LOCKED: 'Dieses Jahr ist gesperrt.',
  ENTRY_READONLY: 'Der Kassen-Eintrag kann nicht bearbeitet werden.',
};
const errorText = (err, fallback) => ERROR_TEXT[err?.message] || fallback;

/**
 * "Finanzen" tab of a Verkaufsaktion (Glühwein, Baseball, ...).
 * action: SALES_ACTIONS entry (uses action.key). year: scout start year.
 * Manual Einnahmen/Ausgaben per action + year, plus the Kasse live as two read-only income lines
 * (Kasse Bargeld, Kartenzahlung; changed in the Kasse tab). Saldo = Einnahmen − Ausgaben.
 * search: filters the list (the cards stay overall).
 */
const GluehweinFinanzen = ({ action, year, yearLocked, search = '', onError }) => {
  const actionKey = action?.key;
  const { fetchEntries, saveEntry, deleteEntry } = useSalesEntries(actionKey);
  const { readKasse } = useSalesKasse(actionKey);
  const formatCurrency = useCurrency();
  const locale = 'de-DE';

  const [records, setRecords] = useState([]);
  const [kasse, setKasse] = useState(null);
  const [loadedKey, setLoadedKey] = useState(null);
  const loadKey = `${actionKey}:${year}`;
  const loading = loadedKey !== loadKey;
  const [modal, setModal] = useState(null); // null | { kind, entry, triggerRef }
  const [toDelete, setToDelete] = useState(null);
  const addExpenseRef = useRef(null);
  const addIncomeRef = useRef(null);
  const [kind, setKind] = useState('all'); // 'all' | 'income' | 'expense'
  // Unsorted = hook order (newest first).
  const { sort, toggleSort, sortRows } = useTableSort({ key: null, dir: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, k] = await Promise.all([fetchEntries(year), readKasse(year)]);
        if (!cancelled) {
          setRecords(list || []);
          setKasse(k || null);
        }
      } catch {
        if (!cancelled) onError?.('Einträge konnten nicht geladen werden.');
      } finally {
        if (!cancelled) setLoadedKey(loadKey);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey]);

  const reload = useCallback(async () => {
    const [list, k] = await Promise.all([fetchEntries(year), readKasse(year)]);
    setRecords(list || []);
    setKasse(k || null);
  }, [fetchEntries, readKasse, year]);

  // The Kasse counts live (Bargeld + Kartenzahlung), never as a stored entry.
  const totals = useMemo(() => computeSaldo(records, kasse), [records, kasse]);

  const entries = useMemo(() => [
    ...kasseIncome(kasse).map((x) => ({
      key: x.key,
      kind: 'income',
      description: x.category === 'kasse_card' ? 'Kartenzahlung (Kasse)' : 'Bargeld (Kasse)',
      category: categoryLabel('income', x.category),
      amount: x.amount,
      isKasse: true,
      raw: null,
    })),
    ...records.map((x) => {
      const isIncome = x.kind === 'income';
      const amount = Number(x.amount) || 0;
      return {
        key: x.id,
        kind: isIncome ? 'income' : 'expense',
        description: x.description || '',
        category: categoryLabel(isIncome ? 'income' : 'expense', x.category),
        amount: isIncome ? amount : -amount,
        isKasse: x.source_kasse_id != null,
        raw: x,
      };
    }),
  ], [records, kasse]);

  const incomeCount = entries.filter((x) => x.kind === 'income').length;
  const expenseCount = entries.length - incomeCount;

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
  }, [entries, kind, q, formatCurrency]);
  const shownTotal = round2(visible.reduce((s, x) => s + x.amount, 0));

  const sorted = useMemo(() => sortRows(visible, {
    description: (x) => x.description.toLowerCase(),
    category: (x) => x.category.toLowerCase(),
    amount: (x) => x.amount,
  }, { tieBreak: (x) => x.description, locale }), [visible, sortRows]);

  // Throws on failure so the popup shows its save error and stays open.
  const handleSave = async (entry) => {
    if (yearLocked) return;
    try {
      await saveEntry(year, entry);
    } catch (err) {
      onError?.(errorText(err, 'Änderung konnte nicht gespeichert werden.'));
      throw err;
    }
    await reload();
    setModal(null);
  };

  const confirmDelete = async () => {
    const id = toDelete.id;
    setToDelete(null);
    try {
      await deleteEntry(id);
      await reload();
    } catch (err) {
      onError?.(errorText(err, 'Änderung konnte nicht gespeichert werden.'));
    }
  };

  const sortTh = (key, label, align = 'left') => (
    <SortableTh column={key} label={label} align={align} sort={sort} onSort={toggleSort} />
  );

  return (
    <div className="gw-fin">
      <div className="gw-fin-summary">
        <div className="gw-fin-card">
          <div className="gw-fin-icon income"><TrendingUp size={20} /></div>
          <div className="gw-fin-card-body">
            <div className="gw-fin-card-label">Einnahmen</div>
            <div className="gw-fin-card-value">{formatCurrency(totals.income)}</div>
          </div>
        </div>
        <div className="gw-fin-card">
          <div className="gw-fin-icon expense"><ReceiptEuro size={20} /></div>
          <div className="gw-fin-card-body">
            <div className="gw-fin-card-label">Ausgaben</div>
            <div className="gw-fin-card-value">{formatCurrency(totals.expense)}</div>
          </div>
        </div>
        <div className="gw-fin-card">
          <div className="gw-fin-icon saldo"><Scale size={20} /></div>
          <div className="gw-fin-card-body">
            <div className="gw-fin-card-label">Saldo</div>
            <div className={`gw-fin-card-value${totals.saldo < 0 ? ' gw-fin-negative' : ''}`}>{formatCurrency(totals.saldo)}</div>
          </div>
        </div>
      </div>

      <div className="gw-fin-toolbar">
        <SegmentedToggle
          ariaLabel="Filter"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: 'Alle', icon: <LayoutList size={15} />, count: entries.length },
            { value: 'income', label: 'Einnahmen', icon: <TrendingUp size={15} />, count: incomeCount },
            { value: 'expense', label: 'Ausgaben', icon: <ReceiptEuro size={15} />, count: expenseCount },
          ]}
        />
        <div className="gw-fin-actions">
          <Button
            ref={addIncomeRef}
            variant="secondary"
            size="md"
            icon={Plus}
            disabled={yearLocked}
            title={yearLocked ? 'Jahr gesperrt' : undefined}
            onClick={() => setModal({ kind: 'income', entry: null, triggerRef: addIncomeRef })}
          >
            Einnahme hinzufügen
          </Button>
          <Button
            ref={addExpenseRef}
            variant="primary"
            size="md"
            icon={Plus}
            disabled={yearLocked}
            title={yearLocked ? 'Jahr gesperrt' : undefined}
            onClick={() => setModal({ kind: 'expense', entry: null, triggerRef: addExpenseRef })}
          >
            Ausgabe hinzufügen
          </Button>
        </div>
      </div>

      <div className="data-table-container">
        {loading || visible.length === 0 ? (
          <div className="gw-fin-empty">
            <Receipt size={36} strokeWidth={1.4} />
            <div className="gw-fin-empty-title">
              {loading
                ? 'Laden…'
                : entries.length > 0
                  ? (q ? `Keine Einträge gefunden für "${search.trim()}"` : 'Keine Einträge in dieser Ansicht')
                  : 'Noch keine Einnahmen oder Ausgaben'}
            </div>
            {!loading && q && entries.length > 0 && (
              <div className="gw-fin-empty-desc">Versuche einen anderen Suchbegriff.</div>
            )}
          </div>
        ) : (
          <table className="data-table gw-fin-table">
            <colgroup>
              <col />
              <col className="gw-fin-col-cat" />
              <col className="gw-fin-col-amount" />
              {!yearLocked && <col className="gw-fin-col-actions" />}
            </colgroup>
            <thead>
              <tr>
                {sortTh('description', 'Beschreibung')}
                {sortTh('category', 'Kategorie')}
                {sortTh('amount', 'Betrag', 'right')}
                {!yearLocked && <th aria-label="Aktionen" />}
              </tr>
            </thead>
            <tbody>
              {sorted.map((x) => (
                <tr key={x.key}>
                  <td className="gw-fin-desc-cell">{x.description}</td>
                  <td>{x.category}</td>
                  <td className={`num dt-mono ${x.kind === 'income' ? 'gw-fin-amount-in' : 'gw-fin-amount-out'}`}>{formatCurrency(x.amount)}</td>
                  {!yearLocked && (
                    <td className="gw-fin-row-actions">
                      {x.isKasse ? (
                        <span className="gw-fin-readonly" title="Aus der Kasse: im Tab Kasse ändern">
                          <Lock size={14} />
                        </span>
                      ) : (
                        <>
                          <button type="button" onClick={() => setModal({ kind: x.kind, entry: x.raw, triggerRef: null })} title="Bearbeiten" aria-label={`Bearbeiten: ${x.description}`}>
                            <Edit2 size={16} />
                          </button>
                          <button type="button" onClick={() => setToDelete({ ...x.raw, kind: x.kind })} title="Löschen" aria-label={`Löschen: ${x.description}`}>
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
                <td>Saldo</td>
                <td />
                <td className={`num dt-mono${shownTotal < 0 ? ' gw-fin-negative' : ''}`}>{formatCurrency(shownTotal)}</td>
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
          categories={SALES_ENTRY_CATEGORIES[modal.kind]}
          onSave={handleSave}
          onCancel={() => setModal(null)}
          triggerRef={modal.triggerRef}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title={toDelete.kind === 'income' ? 'Einnahme löschen?' : 'Ausgabe löschen?'}
          message={`${toDelete.description} (${formatCurrency(Number(toDelete.amount) || 0)})`}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
};

export default GluehweinFinanzen;
