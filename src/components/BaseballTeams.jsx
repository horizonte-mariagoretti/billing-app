import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useBaseballRows } from '../hooks/useBaseballRows';
import Button from './Button';
import ConfirmDialog from './ConfirmDialog';
import StyledSelect from './StyledSelect';
import { TextCell, CheckCell, DeleteButton } from './BaseballCells';
import './DataTable.css';
import './BaseballPlanning.css';

/**
 * Baseballturnier Teams (Excel "Teams"): contact, contacted, Beitrag, paid, and the field the team plays on.
 */
const BaseballTeams = ({ year, yearLocked, onError }) => {
  const teams = useBaseballRows('baseball_teams', year, yearLocked, onError);
  const fields = useBaseballRows('baseball_fields', year, yearLocked, onError);
  const [name, setName] = useState('');
  const [pending, setPending] = useState(null);

  if (!teams.rows || !fields.rows) return <div className="baseball-planning-loading">Lade Teams…</div>;

  const disabled = !!yearLocked;

  const handleAdd = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    teams.add({ name: name.trim() });
    setName('');
  };

  return (
    <div className="baseball-planning">
      <form className="baseball-add-form" onSubmit={handleAdd}>
        <input
          type="text"
          className="input-field"
          placeholder="Gruppenname"
          value={name}
          maxLength={60}
          disabled={disabled}
          aria-label="Neues Team"
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" variant="secondary" size="md" disabled={disabled || !name.trim()}>
          <Plus size={16} /> Team hinzufügen
        </Button>
      </form>

      {teams.rows.length === 0 ? (
        <div className="card baseball-planning-loading">Noch keine Teams angelegt.</div>
      ) : (
        <div className="data-table-container">
          <table className="data-table baseball-table">
            <colgroup>
              <col style={{ width: '200px' }} />
              <col style={{ width: '150px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '180px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '80px' }} />
              <col style={{ width: '170px' }} />
              <col style={{ width: '48px' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Gruppe</th>
                <th>Ansprechpartner</th>
                <th>Telefon</th>
                <th>E-Mail</th>
                <th className="center">Kontaktiert</th>
                <th className="num">Beitrag €</th>
                <th className="center">Bezahlt</th>
                <th>Feld</th>
                <th aria-label="Aktionen" />
              </tr>
            </thead>
            <tbody>
              {teams.rows.map((t) => (
                <tr key={t.id}>
                  <td><TextCell value={t.name} disabled={disabled} label="Gruppe" onSave={(v) => v && teams.update(t.id, { name: v })} /></td>
                  <td><TextCell value={t.contact_name} disabled={disabled} label={`Ansprechpartner: ${t.name}`} onSave={(v) => teams.update(t.id, { contact_name: v })} /></td>
                  <td><TextCell value={t.phone} disabled={disabled} label={`Telefon: ${t.name}`} onSave={(v) => teams.update(t.id, { phone: v })} /></td>
                  <td><TextCell type="email" value={t.email} disabled={disabled} label={`E-Mail: ${t.name}`} onSave={(v) => teams.update(t.id, { email: v })} /></td>
                  <td className="center">
                    <CheckCell checked={t.contacted} disabled={disabled} label={`${t.name} kontaktiert`} onChange={(v) => teams.update(t.id, { contacted: v ? 1 : 0 })} />
                  </td>
                  <td>
                    <TextCell type="number" step="0.5" align="right" value={t.fee} disabled={disabled} label={`Beitrag: ${t.name}`} onSave={(v) => teams.update(t.id, { fee: v })} />
                  </td>
                  <td className="center">
                    <CheckCell checked={t.paid} disabled={disabled} label={`${t.name} bezahlt`} onChange={(v) => teams.update(t.id, { paid: v ? 1 : 0 })} />
                  </td>
                  <td>
                    <StyledSelect
                      value={t.field_id ?? ''}
                      disabled={disabled}
                      placeholder="–"
                      onChange={(e) => teams.update(t.id, { field_id: e.target.value || null })}
                    >
                      <option value="">–</option>
                      {fields.rows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </StyledSelect>
                  </td>
                  <td>
                    <DeleteButton disabled={disabled} label={`Team ${t.name} entfernen`} onClick={() => setPending(t)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title="Team löschen?"
          message={`„${pending.name}“ wird mit Kontakt, Beitrag und Feld entfernt.`}
          confirmLabel="Löschen"
          onConfirm={() => { const id = pending.id; setPending(null); teams.remove(id); }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
};

export default BaseballTeams;
