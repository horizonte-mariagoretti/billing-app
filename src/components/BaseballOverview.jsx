import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useBaseballRows } from '../hooks/useBaseballRows';
import Button from './Button';
import ConfirmDialog from './ConfirmDialog';
import { TextCell, CheckCell, DeleteButton, money } from './BaseballCells';
import './BaseballPlanning.css';

const sum = (rows, fn) => rows.reduce((acc, r) => acc + fn(r), 0);

/** Today as YYYY-MM-DD in local time (to spot overdue tasks). */
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Baseballturnier Übersicht: key figures from the other tabs and a ToDo list
 * (done, Was, Wer, Bis wann, delete). Open tasks first, then done ones, each in sort order.
 * Open tasks past their due date show the date in red.
 */
const BaseballOverview = ({ year, yearLocked, onError }) => {
  const todos = useBaseballRows('baseball_todos', year, yearLocked, onError);
  const teams = useBaseballRows('baseball_teams', year, yearLocked, onError);
  const sponsors = useBaseballRows('baseball_sponsors', year, yearLocked, onError);
  const shopping = useBaseballRows('baseball_shopping', year, yearLocked, onError);
  const [draft, setDraft] = useState('');
  const [owner, setOwner] = useState('');
  const [due, setDue] = useState('');
  const [pending, setPending] = useState(null);

  if (!todos.rows || !teams.rows || !sponsors.rows || !shopping.rows) {
    return <div className="baseball-planning-loading">Lade Übersicht…</div>;
  }

  const disabled = !!yearLocked;
  const orderedTodos = [...todos.rows.filter((t) => !t.done), ...todos.rows.filter((t) => t.done)];
  const today = todayKey();
  const openTodos = todos.rows.filter((t) => !t.done).length;
  const feesTotal = sum(teams.rows, (t) => Number(t.fee) || 0);
  const feesPaid = sum(teams.rows.filter((t) => t.paid), (t) => Number(t.fee) || 0);
  const sponsorsConfirmed = sum(sponsors.rows.filter((s) => s.status === 'zugesagt'), (s) => Number(s.amount) || 0);
  const sponsorsPaid = sum(sponsors.rows.filter((s) => s.paid), (s) => Number(s.amount) || 0);
  const shoppingTotal = sum(shopping.rows, (s) => (Number(s.qty) || 0) * (Number(s.unit_price) || 0));

  const handleAdd = (e) => {
    e.preventDefault();
    const task = draft.trim();
    if (!task || disabled) return;
    todos.add({ task, owner: owner.trim(), place: '', due_date: due || null });
    setDraft('');
    setOwner('');
    setDue('');
  };

  return (
    <div className="baseball-planning">
      <div className="baseball-stats">
        <div className="baseball-stat card">
          <div className="baseball-stat-label">Teams</div>
          <div className="baseball-stat-value">{teams.rows.length}</div>
          <div className="baseball-stat-sub">{teams.rows.filter((t) => t.contacted).length} kontaktiert</div>
        </div>
        <div className="baseball-stat card">
          <div className="baseball-stat-label">Team-Beiträge</div>
          <div className="baseball-stat-value">{money(feesPaid)}</div>
          <div className="baseball-stat-sub">von {money(feesTotal)} bezahlt</div>
        </div>
        <div className="baseball-stat card">
          <div className="baseball-stat-label">Sponsoring zugesagt</div>
          <div className="baseball-stat-value">{money(sponsorsConfirmed)}</div>
          <div className="baseball-stat-sub">{money(sponsorsPaid)} überwiesen</div>
        </div>
        <div className="baseball-stat card">
          <div className="baseball-stat-label">Offene Aufgaben</div>
          <div className="baseball-stat-value">{openTodos}</div>
          <div className="baseball-stat-sub">Einkauf {money(shoppingTotal)}</div>
        </div>
      </div>

      <form className="baseball-add-form" onSubmit={handleAdd}>
        <input
          type="text"
          className="input-field baseball-todo-input"
          placeholder="Was ist zu tun?"
          value={draft}
          maxLength={120}
          disabled={disabled}
          aria-label="Was"
          onChange={(e) => setDraft(e.target.value)}
        />
        <input
          type="text"
          className="input-field baseball-todo-owner-input"
          placeholder="Wer?"
          value={owner}
          maxLength={60}
          disabled={disabled}
          aria-label="Wer"
          onChange={(e) => setOwner(e.target.value)}
        />
        <input
          type="date"
          className="input-field baseball-todo-date-input"
          value={due}
          disabled={disabled}
          aria-label="Bis wann"
          title="Bis wann"
          onChange={(e) => setDue(e.target.value)}
        />
        <Button type="submit" variant="secondary" size="md" disabled={disabled || !draft.trim()}>
          <Plus size={16} /> Aufgabe hinzufügen
        </Button>
      </form>

      {todos.rows.length === 0 ? (
        <div className="card baseball-planning-loading">Noch keine Aufgaben.</div>
      ) : (
        <ul className="card baseball-todo-list">
          {orderedTodos.map((t) => {
            const overdue = !t.done && !!t.due_date && t.due_date < today;
            return (
            <li key={t.id} className={`baseball-todo${t.done ? ' baseball-todo--done' : ''}`}>
              <CheckCell
                checked={t.done}
                disabled={disabled}
                label={`${t.task} erledigt`}
                onChange={(v) => todos.update(t.id, { done: v ? 1 : 0 })}
              />
              <div className="baseball-todo-fields">
                <span className="baseball-todo-task">
                  <TextCell value={t.task} disabled={disabled} label="Was" onSave={(v) => v && todos.update(t.id, { task: v })} />
                </span>
                <span className="baseball-todo-owner">
                  <TextCell value={t.owner} disabled={disabled} label="Wer" placeholder="Wer?" onSave={(v) => todos.update(t.id, { owner: v })} />
                </span>
                <span className={`baseball-todo-date${overdue ? ' baseball-todo-date--overdue' : ''}`} title={overdue ? 'Überfällig' : 'Bis wann'}>
                  <TextCell type="date" value={t.due_date} disabled={disabled} label="Bis wann" onSave={(v) => todos.update(t.id, { due_date: v || null })} />
                </span>
              </div>
              <DeleteButton disabled={disabled} label={`Aufgabe ${t.task} entfernen`} onClick={() => setPending(t)} />
            </li>
            );
          })}
        </ul>
      )}

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
