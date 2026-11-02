import { useState, useEffect, useRef } from 'react';
import { ListChecks, Users, Scale } from 'lucide-react';
import { useBaseballRows } from '../hooks/useBaseballRows';
import { useSalesEntries } from '../hooks/useSalesEntries';
import { useSalesKasse } from '../hooks/useSalesKasse';
import useCurrency from '../hooks/useCurrency';
import { saldo as computeSaldo } from '../utils/gluehweinFinance';
import ConfirmDialog from './ConfirmDialog';
import DatePicker from './DatePicker';
import { TextCell, CheckCell, DeleteButton } from './BaseballCells';
import './GluehweinFinanzen.css'; // shared summary card look (gw-fin-summary, gw-fin-card, gw-fin-icon)
import './DataTable.css';
import './BaseballPlanning.css';

const EMPTY_DRAFT = { task: '', owner: '', due_date: '' };

/** Today as YYYY-MM-DD in local time (to spot overdue tasks). */
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Baseballturnier Übersicht: three stat cards (To-Do's, Teams, Saldo) and the to-do table
 * (Erledigt, Was, Wer, Bis wann, delete). Open tasks first, then done ones, each in sort order.
 * Open tasks past their due date show the date in red. Tasks are added in the empty last row, like the
 * Teams table: saved once Was is filled and the user presses Enter or leaves the row.
 * Saldo = the action's Finanzen Saldo (sales_entries income − expense + Kasse live), same formula as the
 * Finanzen tab and the Dashboard's "entries" Saldo source.
 */
const BaseballOverview = ({ action, year, yearLocked, onError }) => {
  const actionKey = action?.key || 'baseball';
  const todos = useBaseballRows('baseball_todos', year, yearLocked, onError);
  const teams = useBaseballRows('baseball_teams', year, yearLocked, onError);
  const { fetchEntries } = useSalesEntries(actionKey);
  const { readKasse } = useSalesKasse(actionKey);
  const formatCurrency = useCurrency();
  const [totals, setTotals] = useState(null);
  const [draft, setDraftState] = useState(EMPTY_DRAFT);
  const draftRef = useRef(EMPTY_DRAFT); // read synchronously when the row is left right after a date change
  const [pending, setPending] = useState(null);
  const addRowRef = useRef(null);
  const taskInputRef = useRef(null);
  const addingRef = useRef(false);
  const refocusRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchEntries(year), readKasse(year)])
      .then(([list, kasse]) => { if (!cancelled) setTotals(computeSaldo(list || [], kasse || null)); })
      .catch(() => { if (!cancelled) setTotals({ income: 0, expense: 0, saldo: 0 }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionKey, year]);

  if (!todos.rows || !teams.rows) {
    return <div className="baseball-planning-loading">Lade Übersicht…</div>;
  }

  const disabled = !!yearLocked;
  // Open tasks in the order they are due (undated last; ties keep their sort order), done tasks below them.
  const byDue = (a, b) => (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31');
  const orderedTodos = [
    ...todos.rows.filter((t) => !t.done).sort(byDue),
    ...todos.rows.filter((t) => t.done),
  ];
  const today = todayKey();
  const openTodos = todos.rows.filter((t) => !t.done).length;

  const setDraft = (patch) => {
    draftRef.current = { ...draftRef.current, ...patch };
    setDraftState(draftRef.current);
  };

  const saveDraft = async ({ refocus }) => {
    const d = draftRef.current;
    const task = d.task.trim();
    const wantFocus = refocus || refocusRef.current;
    refocusRef.current = false;
    if (!task || disabled || addingRef.current) return;
    addingRef.current = true;
    const ok = await todos.add({ task, owner: d.owner.trim(), place: '', due_date: d.due_date || null });
    addingRef.current = false;
    if (ok) {
      draftRef.current = EMPTY_DRAFT;
      setDraftState(EMPTY_DRAFT);
      if (wantFocus) taskInputRef.current?.focus();
    }
  };

  const handleAddKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveDraft({ refocus: true });
    }
  };

  // Moving between the fields of the empty row does not save yet; leaving the row does.
  const handleAddBlur = (e) => {
    if (addRowRef.current?.contains(e.relatedTarget)) return;
    saveDraft({ refocus: false });
  };

  // Enter in the date field: blur it first so the DatePicker parses the typed date, then the row blur saves.
  const handleDateKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    refocusRef.current = true;
    if (e.target instanceof HTMLElement && e.target.tagName === 'INPUT') e.target.blur();
    else saveDraft({ refocus: true });
  };

  const addInput = (key, label, props = {}) => (
    <input
      type="text"
      className="input-field baseball-cell"
      value={draft[key]}
      placeholder={label}
      aria-label={`Neue Aufgabe: ${label}`}
      disabled={disabled}
      onChange={(e) => setDraft({ [key]: e.target.value })}
      onKeyDown={handleAddKeyDown}
      onBlur={handleAddBlur}
      {...props}
    />
  );

  const cards = [
    { key: 'todos', label: "To-Do's", value: openTodos, icon: ListChecks, tone: 'income' },
    { key: 'teams', label: 'Teams', value: teams.rows.length, icon: Users, tone: 'expense' },
    {
      key: 'saldo',
      label: 'Saldo',
      value: totals ? formatCurrency(totals.saldo) : '—',
      negative: !!totals && totals.saldo < 0,
      icon: Scale,
      tone: 'saldo',
    },
  ];

  return (
    <div className="baseball-planning">
      <div className="gw-fin-summary">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.key} className="gw-fin-card">
              <div className={`gw-fin-icon ${c.tone}`}><Icon size={20} /></div>
              <div className="gw-fin-card-body">
                <div className="gw-fin-card-label">{c.label}</div>
                <div className={`gw-fin-card-value${c.negative ? ' gw-fin-negative' : ''}`}>{c.value}</div>              </div>
            </div>
          );
        })}
      </div>

      <div className="data-table-container baseball-todo-table-wrap">
        <table className="data-table baseball-table baseball-todo-table">
          <colgroup>
            <col className="baseball-todo-col-done" />
            <col />
            <col className="baseball-todo-col-owner" />
            <col className="baseball-todo-col-date" />
            <col className="baseball-todo-col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th className="center">Erledigt</th>
              <th>Was</th>
              <th>Wer</th>
              <th>Bis wann</th>
              <th aria-label="Aktionen" />
            </tr>
          </thead>
          <tbody>
            {orderedTodos.map((t) => {
              const overdue = !t.done && !!t.due_date && t.due_date < today;
              return (
                <tr key={t.id} className={t.done ? 'baseball-todo--done' : undefined}>
                  <td className="center">
                    <CheckCell
                      checked={t.done}
                      disabled={disabled}
                      label={`${t.task} erledigt`}
                      onChange={(v) => todos.update(t.id, { done: v ? 1 : 0 })}
                    />
                  </td>
                  <td>
                    <TextCell value={t.task} disabled={disabled} label="Was" onSave={(v) => v && todos.update(t.id, { task: v })} />
                  </td>
                  <td>
                    <TextCell value={t.owner} disabled={disabled} label="Wer" placeholder="Wer?" onSave={(v) => todos.update(t.id, { owner: v })} />
                  </td>
                  <td className={`baseball-todo-date${overdue ? ' baseball-todo-date--overdue' : ''}`} title={overdue ? 'Überfällig' : 'Bis wann'}>
                    <DatePicker
                      value={t.due_date || ''}
                      disabled={disabled}
                      onChange={(v) => { if ((v || '') !== (t.due_date || '')) todos.update(t.id, { due_date: v || null }); }}
                    />
                  </td>
                  <td>
                    <div className="baseball-row-actions">
                      <DeleteButton disabled={disabled} label={`Aufgabe ${t.task} entfernen`} onClick={() => setPending(t)} />
                    </div>
                  </td>
                </tr>
              );
            })}
            <tr className="baseball-add-row" ref={addRowRef}>
              <td className="baseball-add-hint center">{disabled ? '' : draft.task.trim() ? 'Enter' : ''}</td>
              <td>{addInput('task', 'Was ist zu tun?', { ref: taskInputRef, maxLength: 120 })}</td>
              <td>{addInput('owner', 'Wer?', { maxLength: 60 })}</td>
              <td className="baseball-todo-date" title="Bis wann" onKeyDown={handleDateKeyDown} onBlur={handleAddBlur}>
                <DatePicker value={draft.due_date} disabled={disabled} onChange={(v) => setDraft({ due_date: v || '' })} />
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {pending && (
        <ConfirmDialog
          title="Aufgabe löschen?"
          message={`„${pending.task}“ wird entfernt.`}
          confirmLabel="Löschen"
          onConfirm={() => { const id = pending.id; setPending(null); todos.remove(id); }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
};

export default BaseballOverview;
