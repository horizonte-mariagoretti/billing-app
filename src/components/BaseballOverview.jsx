import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useBaseballRows } from '../hooks/useBaseballRows';
import Button from './Button';
import ConfirmDialog from './ConfirmDialog';
import { TextCell, CheckCell, DeleteButton, money } from './BaseballCells';
import './DataTable.css';
import './BaseballPlanning.css';

const EMPTY_TODO = { task: '', owner: '', place: '', due_date: '' };

const sum = (rows, fn) => rows.reduce((acc, r) => acc + fn(r), 0);

/**
 * Baseballturnier Übersicht: key figures from the other tabs and the ToDo list (Excel "ToDo-List":
 * Was, Wer, Wo, Bis wann, Done, Bemerkung).
 */
const BaseballOverview = ({ year, yearLocked, onError }) => {
  const todos = useBaseballRows('baseball_todos', year, yearLocked, onError);
  const teams = useBaseballRows('baseball_teams', year, yearLocked, onError);
  const sponsors = useBaseballRows('baseball_sponsors', year, yearLocked, onError);
  const shopping = useBaseballRows('baseball_shopping', year, yearLocked, onError);
  const [draft, setDraft] = useState(EMPTY_TODO);
  const [pending, setPending] = useState(null);

  if (!todos.rows || !teams.rows || !sponsors.rows || !shopping.rows) {
    return <div className="baseball-planning-loading">Lade Übersicht…</div>;
  }

  const disabled = !!yearLocked;
  const openTodos = todos.rows.filter((t) => !t.done).length;
  const feesTotal = sum(teams.rows, (t) => Number(t.fee) || 0);
  const feesPaid = sum(teams.rows.filter((t) => t.paid), (t) => Number(t.fee) || 0);
  const sponsorsConfirmed = sum(sponsors.rows.filter((s) => s.status === 'zugesagt'), (s) => Number(s.amount) || 0);
  const sponsorsPaid = sum(sponsors.rows.filter((s) => s.paid), (s) => Number(s.amount) || 0);
  const shoppingTotal = sum(shopping.rows, (s) => (Number(s.qty) || 0) * (Number(s.unit_price) || 0));

  const handleAdd = (e) => {
    e.preventDefault();
    if (!draft.task.trim()) return;
    todos.add({ task: draft.task.trim(), owner: draft.owner.trim(), place: draft.place.trim(), due_date: draft.due_date || null });
    setDraft(EMPTY_TODO);
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
          className="input-field"
          placeholder="Was ist zu tun?"
          value={draft.task}
          maxLength={120}
          disabled={disabled}
          aria-label="Neue Aufgabe"
          onChange={(e) => setDraft({ ...draft, task: e.target.value })}
        />
        <input
          type="text"
          className="input-field"
          placeholder="Wer"
          value={draft.owner}
          maxLength={60}
          disabled={disabled}
          aria-label="Wer"
          onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
        />
        <input
          type="text"
          className="input-field"
          placeholder="Wo"
          value={draft.place}
          maxLength={60}
          disabled={disabled}
          aria-label="Wo"
          onChange={(e) => setDraft({ ...draft, place: e.target.value })}
        />
        <input
          type="date"
          className="input-field"
          value={draft.due_date}
          disabled={disabled}
          aria-label="Bis wann"
          onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
        />
        <Button type="submit" variant="secondary" size="md" disabled={disabled || !draft.task.trim()}>
          <Plus size={16} /> Aufgabe hinzufügen
        </Button>
      </form>

      {todos.rows.length === 0 ? (
        <div className="card baseball-planning-loading">Noch keine Aufgaben.</div>
      ) : (
        <div className="data-table-container">
          <table className="data-table baseball-table">
            <colgroup>
              <col style={{ width: '84px' }} />
              <col style={{ width: '240px' }} />
              <col style={{ width: '140px' }} />
              <col style={{ width: '140px' }} />
              <col style={{ width: '150px' }} />
              <col style={{ width: '200px' }} />
              <col style={{ width: '48px' }} />
            </colgroup>
            <thead>
              <tr>
                <th className="center">Erledigt</th>
                <th>Was</th>
                <th>Wer</th>
                <th>Wo</th>
                <th>Bis wann</th>
                <th>Bemerkung</th>
                <th aria-label="Aktionen" />
              </tr>
            </thead>
            <tbody>
              {todos.rows.map((t) => (
                <tr key={t.id}>
                  <td className="center">
                    <CheckCell
                      checked={t.done}
                      disabled={disabled}
                      label={`${t.task} erledigt`}
                      onChange={(v) => todos.update(t.id, { done: v ? 1 : 0 })}
                    />
                  </td>
                  <td><TextCell value={t.task} disabled={disabled} label="Was" onSave={(v) => v && todos.update(t.id, { task: v })} /></td>
                  <td><TextCell value={t.owner} disabled={disabled} label={`Wer: ${t.task}`} onSave={(v) => todos.update(t.id, { owner: v })} /></td>
                  <td><TextCell value={t.place} disabled={disabled} label={`Wo: ${t.task}`} onSave={(v) => todos.update(t.id, { place: v })} /></td>
                  <td><TextCell type="date" value={t.due_date ?? ''} disabled={disabled} label={`Bis wann: ${t.task}`} onSave={(v) => todos.update(t.id, { due_date: v || null })} /></td>
                  <td><TextCell value={t.note} disabled={disabled} label={`Bemerkung: ${t.task}`} onSave={(v) => todos.update(t.id, { note: v })} /></td>
                  <td>
                    <DeleteButton disabled={disabled} label={`Aufgabe ${t.task} entfernen`} onClick={() => setPending(t)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
