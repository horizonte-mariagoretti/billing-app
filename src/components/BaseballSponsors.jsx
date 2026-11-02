import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useBaseballRows } from '../hooks/useBaseballRows';
import Button from './Button';
import ConfirmDialog from './ConfirmDialog';
import StyledSelect from './StyledSelect';
import { TextCell, CheckCell, DeleteButton, money } from './BaseballCells';
import './DataTable.css';
import './BaseballPlanning.css';

export const SPONSOR_STATUS = [
  { value: 'offen', label: 'Offen' },
  { value: 'angefragt', label: 'Angefragt' },
  { value: 'zugesagt', label: 'Zugesagt' },
  { value: 'abgesagt', label: 'Abgesagt' },
];

/**
 * Baseballturnier Sponsoren (Excel "Sponsoren"): status, sponsor level (50 / 100 / 150 €), special deals,
 * total amount, invoice and payment, advertising material out and received material back.
 */
const BaseballSponsors = ({ year, yearLocked, onError }) => {
  const sponsors = useBaseballRows('baseball_sponsors', year, yearLocked, onError);
  const [name, setName] = useState('');
  const [pending, setPending] = useState(null);

  if (!sponsors.rows) return <div className="baseball-planning-loading">Lade Sponsoren…</div>;

  const disabled = !!yearLocked;
  const total = sponsors.rows.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
  const paid = sponsors.rows.filter((s) => s.paid).reduce((acc, s) => acc + (Number(s.amount) || 0), 0);

  const handleAdd = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    sponsors.add({ name: name.trim() });
    setName('');
  };

  return (
    <div className="baseball-planning">
      <form className="baseball-add-form" onSubmit={handleAdd}>
        <input
          type="text"
          className="input-field"
          placeholder="Sponsor"
          value={name}
          maxLength={80}
          disabled={disabled}
          aria-label="Neuer Sponsor"
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" variant="secondary" size="md" disabled={disabled || !name.trim()}>
          <Plus size={16} /> Sponsor hinzufügen
        </Button>
      </form>

      {sponsors.rows.length === 0 ? (
        <div className="card baseball-planning-loading">Noch keine Sponsoren angelegt.</div>
      ) : (
        <div className="data-table-container">
          <table className="data-table baseball-table">
            <colgroup>
              <col style={{ width: '200px' }} />
              <col style={{ width: '140px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '100px' }} />
              <col style={{ width: '150px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '80px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '150px' }} />
              <col style={{ width: '150px' }} />
              <col style={{ width: '48px' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Sponsor</th>
                <th>Ansprechpartner</th>
                <th>Status</th>
                <th className="num">Level €</th>
                <th>Sonder</th>
                <th className="num">Betrag €</th>
                <th className="center">Rechnung</th>
                <th className="center">Überwiesen</th>
                <th>Werbematerial</th>
                <th>Erhaltenes Material</th>
                <th aria-label="Aktionen" />
              </tr>
            </thead>
            <tbody>
              {sponsors.rows.map((s) => (
                <tr key={s.id}>
                  <td><TextCell value={s.name} disabled={disabled} label="Sponsor" onSave={(v) => v && sponsors.update(s.id, { name: v })} /></td>
                  <td><TextCell value={s.contact_name} disabled={disabled} label={`Ansprechpartner: ${s.name}`} onSave={(v) => sponsors.update(s.id, { contact_name: v })} /></td>
                  <td>
                    <StyledSelect value={s.status} disabled={disabled} onChange={(e) => sponsors.update(s.id, { status: e.target.value })}>
                      {SPONSOR_STATUS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </StyledSelect>
                  </td>
                  <td><TextCell type="number" step="1" align="right" value={s.level_amount} disabled={disabled} label={`Level: ${s.name}`} onSave={(v) => sponsors.update(s.id, { level_amount: v })} /></td>
                  <td><TextCell value={s.special} disabled={disabled} label={`Sonder: ${s.name}`} onSave={(v) => sponsors.update(s.id, { special: v })} /></td>
                  <td><TextCell type="number" step="0.5" align="right" value={s.amount} disabled={disabled} label={`Betrag: ${s.name}`} onSave={(v) => sponsors.update(s.id, { amount: v })} /></td>
                  <td className="center">
                    <CheckCell checked={s.invoiced} disabled={disabled} label={`${s.name} Rechnung gestellt`} onChange={(v) => sponsors.update(s.id, { invoiced: v ? 1 : 0 })} />
                  </td>
                  <td className="center">
                    <CheckCell checked={s.paid} disabled={disabled} label={`${s.name} überwiesen`} onChange={(v) => sponsors.update(s.id, { paid: v ? 1 : 0 })} />
                  </td>
                  <td><TextCell value={s.material_out} disabled={disabled} label={`Werbematerial: ${s.name}`} onSave={(v) => sponsors.update(s.id, { material_out: v })} /></td>
                  <td><TextCell value={s.material_in} disabled={disabled} label={`Erhaltenes Material: ${s.name}`} onSave={(v) => sponsors.update(s.id, { material_in: v })} /></td>
                  <td>
                    <DeleteButton disabled={disabled} label={`Sponsor ${s.name} entfernen`} onClick={() => setPending(s)} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="baseball-foot-total" colSpan={5}>Summe</td>
                <td className="num baseball-foot-total">{money(total)}</td>
                <td />
                <td className="baseball-foot-total">{money(paid)} überwiesen</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title="Sponsor löschen?"
          message={`„${pending.name}“ wird mit Betrag und Materialangaben entfernt.`}
          confirmLabel="Löschen"
          onConfirm={() => { const id = pending.id; setPending(null); sponsors.remove(id); }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
};

export default BaseballSponsors;
