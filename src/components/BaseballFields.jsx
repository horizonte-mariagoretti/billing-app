import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useBaseballRows } from '../hooks/useBaseballRows';
import Button from './Button';
import ConfirmDialog from './ConfirmDialog';
import { TextCell, DeleteButton } from './BaseballCells';
import './BaseballPlanning.css';

/**
 * Baseballturnier Felder (Excel "Felder"): one card per field, named as the field (e.g. sponsor name),
 * with the teams that play on it. Teams are assigned in the Teams tab.
 */
const BaseballFields = ({ year, yearLocked, onError }) => {
  const fields = useBaseballRows('baseball_fields', year, yearLocked, onError);
  const teams = useBaseballRows('baseball_teams', year, yearLocked, onError);
  const [name, setName] = useState('');
  const [pending, setPending] = useState(null);

  if (!fields.rows || !teams.rows) return <div className="baseball-planning-loading">Lade Felder…</div>;

  const disabled = !!yearLocked;

  const handleAdd = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    fields.add({ name: name.trim() });
    setName('');
  };

  return (
    <div className="baseball-planning">
      <form className="baseball-add-form" onSubmit={handleAdd}>
        <input
          type="text"
          className="input-field"
          placeholder="Feldname"
          value={name}
          maxLength={60}
          disabled={disabled}
          aria-label="Neues Feld"
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" variant="secondary" size="md" disabled={disabled || !name.trim()}>
          <Plus size={16} /> Feld hinzufügen
        </Button>
      </form>

      {fields.rows.length === 0 ? (
        <div className="card baseball-planning-loading">Noch keine Felder angelegt.</div>
      ) : (
        <div className="baseball-field-grid">
          {fields.rows.map((f) => {
            const onField = teams.rows.filter((t) => t.field_id === f.id);
            return (
              <div key={f.id} className="card baseball-field-card">
                <div className="baseball-field-head">
                  <TextCell value={f.name} disabled={disabled} label="Feldname" onSave={(v) => v && fields.update(f.id, { name: v })} />
                  <DeleteButton disabled={disabled} label={`Feld ${f.name} entfernen`} onClick={() => setPending(f)} />
                </div>
                {onField.length === 0 ? (
                  <div className="baseball-field-empty">Noch kein Team zugeordnet.</div>
                ) : (
                  <ul className="baseball-field-teams">
                    {onField.map((t) => <li key={t.id}>{t.name}</li>)}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title="Feld löschen?"
          message={`„${pending.name}“ wird entfernt. Teams auf diesem Feld bleiben, sind dann ohne Feld.`}
          confirmLabel="Löschen"
          onConfirm={() => { const id = pending.id; setPending(null); fields.remove(id); }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
};

export default BaseballFields;
