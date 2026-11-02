import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useBaseballRows } from '../hooks/useBaseballRows';
import Button from './Button';
import ConfirmDialog from './ConfirmDialog';
import { TextCell, DeleteButton, money } from './BaseballCells';
import './DataTable.css';
import './BaseballPlanning.css';

/**
 * Baseballturnier Einkaufsliste (Excel "PacklisteEinkäufe"): item, quantity, price per piece, total,
 * category, source, bought, used and what is left (bought − used).
 */
const BaseballShopping = ({ year, yearLocked, onError }) => {
  const shopping = useBaseballRows('baseball_shopping', year, yearLocked, onError);
  const [item, setItem] = useState('');
  const [pending, setPending] = useState(null);

  if (!shopping.rows) return <div className="baseball-planning-loading">Lade Einkaufsliste…</div>;

  const disabled = !!yearLocked;
  const total = shopping.rows.reduce((acc, s) => acc + (Number(s.qty) || 0) * (Number(s.unit_price) || 0), 0);

  const handleAdd = (e) => {
    e.preventDefault();
    if (!item.trim()) return;
    shopping.add({ item: item.trim() });
    setItem('');
  };

  return (
    <div className="baseball-planning">
      <form className="baseball-add-form" onSubmit={handleAdd}>
        <input
          type="text"
          className="input-field"
          placeholder="Ware, z. B. Bratwurst"
          value={item}
          maxLength={80}
          disabled={disabled}
          aria-label="Neue Ware"
          onChange={(e) => setItem(e.target.value)}
        />
        <Button type="submit" variant="secondary" size="md" disabled={disabled || !item.trim()}>
          <Plus size={16} /> Ware hinzufügen
        </Button>
      </form>

      {shopping.rows.length === 0 ? (
        <div className="card baseball-planning-loading">Noch keine Ware auf der Liste.</div>
      ) : (
        <div className="data-table-container">
          <table className="data-table baseball-table">
            <colgroup>
              <col style={{ width: '220px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '140px' }} />
              <col style={{ width: '140px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '48px' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Ware</th>
                <th className="num">Menge</th>
                <th className="num">Preis/Stk €</th>
                <th className="num">Gesamt €</th>
                <th>Kategorie</th>
                <th>Quelle</th>
                <th className="num">Gekauft</th>
                <th className="num">Verbraucht</th>
                <th className="num">Übrig</th>
                <th aria-label="Aktionen" />
              </tr>
            </thead>
            <tbody>
              {shopping.rows.map((s) => {
                const left = (Number(s.bought) || 0) - (Number(s.used) || 0);
                return (
                  <tr key={s.id}>
                    <td><TextCell value={s.item} disabled={disabled} label="Ware" onSave={(v) => v && shopping.update(s.id, { item: v })} /></td>
                    <td><TextCell type="number" align="right" value={s.qty} disabled={disabled} label={`Menge: ${s.item}`} onSave={(v) => shopping.update(s.id, { qty: v })} /></td>
                    <td><TextCell type="number" step="0.01" align="right" value={s.unit_price} disabled={disabled} label={`Preis pro Stück: ${s.item}`} onSave={(v) => shopping.update(s.id, { unit_price: v })} /></td>
                    <td className="num">{money((Number(s.qty) || 0) * (Number(s.unit_price) || 0))}</td>
                    <td><TextCell value={s.category} disabled={disabled} label={`Kategorie: ${s.item}`} onSave={(v) => shopping.update(s.id, { category: v })} /></td>
                    <td><TextCell value={s.source} disabled={disabled} label={`Quelle: ${s.item}`} onSave={(v) => shopping.update(s.id, { source: v })} /></td>
                    <td><TextCell type="number" align="right" value={s.bought} disabled={disabled} label={`Gekauft: ${s.item}`} onSave={(v) => shopping.update(s.id, { bought: v })} /></td>
                    <td><TextCell type="number" align="right" value={s.used} disabled={disabled} label={`Verbraucht: ${s.item}`} onSave={(v) => shopping.update(s.id, { used: v })} /></td>
                    <td className={`num${left < 0 ? ' dt-muted' : ''}`}>{left}</td>
                    <td>
                      <DeleteButton disabled={disabled} label={`Ware ${s.item} entfernen`} onClick={() => setPending(s)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="baseball-foot-total" colSpan={3}>Summe</td>
                <td className="num baseball-foot-total">{money(total)}</td>
                <td colSpan={6} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title="Ware löschen?"
          message={`„${pending.item}“ wird von der Einkaufsliste entfernt.`}
          confirmLabel="Löschen"
          onConfirm={() => { const id = pending.id; setPending(null); shopping.remove(id); }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
};

export default BaseballShopping;
