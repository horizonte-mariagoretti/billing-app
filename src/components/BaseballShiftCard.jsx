import { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { TextCell, EditButton, DeleteButton } from './BaseballCells';

/** "09:00–14:30 Uhr", "ab 16:30 Uhr" (open end) or '' (no time). */
export const shiftTimeLabel = (s) => {
  if (s?.start_time && s?.end_time) return `${s.start_time}–${s.end_time} Uhr`;
  if (s?.start_time) return `ab ${s.start_time} Uhr`;
  return '';
};

/**
 * One Baseballturnier shift as a card: head (name, time, "x von y besetzt", edit/delete) and one row per duty
 * with its persons as chips, Soll (needed, editable) and Ist (count). The dashed "+" chip opens an inline name
 * field: Enter saves and keeps the field open for the next name, Escape (or leaving it empty) closes it.
 */
const BaseballShiftCard = ({
  shift, duties, persons, needed, disabled,
  onEdit, onDelete, onDeleteDuty, onAddPerson, onOpenPerson, onSetNeeded,
}) => {
  const [adding, setAdding] = useState(null); // duty id with the open name field
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);
  const cancelRef = useRef(false); // Escape: the blur that follows must not save

  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);
  useEffect(() => { if (disabled) setAdding(null); }, [disabled]);

  const slot = (dutyId) => {
    const key = `${dutyId}|${shift.id}`;
    return { list: persons.get(key) || [], soll: needed.get(key) || 0 };
  };

  let filled = 0;
  let total = 0;
  for (const d of duties) {
    const { list, soll } = slot(d.id);
    filled += Math.min(list.length, soll);
    total += soll;
  }
  const time = shiftTimeLabel(shift);

  const save = async (dutyId, keepOpen) => {
    const name = draft.trim();
    if (!name) {
      if (!keepOpen) setAdding(null);
      return;
    }
    setDraft('');
    const ok = await onAddPerson(dutyId, shift.id, name);
    if (!ok) setDraft(name);
    else if (keepOpen) inputRef.current?.focus();
    else setAdding(null);
  };

  return (
    <section className="card baseball-field-card baseball-dienste-card" aria-label={shift.label}>
      <div className="baseball-field-head">
        <h3 className="baseball-field-name">{shift.label}</h3>
        {time && <span className="baseball-field-group">{time}</span>}
        <span className="baseball-field-meta">
          {total > 0 ? `${filled} von ${total} besetzt` : 'Kein Bedarf eingetragen'}
        </span>
        <div className="baseball-row-actions">
          <EditButton label={`Schicht ${shift.label} bearbeiten`} disabled={disabled} onClick={onEdit} />
          <DeleteButton label={`Schicht ${shift.label} löschen`} disabled={disabled} onClick={onDelete} />
        </div>
      </div>

      {duties.length === 0 ? (
        <p className="baseball-field-empty">Noch keine Dienste. Oben mit „Dienst hinzufügen" anlegen.</p>
      ) : (
        <div className="data-table-container">
          <table className="data-table baseball-table baseball-dienste-table">
            <colgroup>
              <col className="baseball-dienste-col-duty" />
              <col />
              <col className="baseball-dienste-col-num" />
              <col className="baseball-dienste-col-num" />
              <col className="baseball-dienste-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>Dienst</th>
                <th>Personen</th>
                <th>Soll</th>
                <th>Ist</th>
                <th aria-label="Aktionen" />
              </tr>
            </thead>
            <tbody>
              {duties.map((d) => {
                const { list, soll } = slot(d.id);
                const ist = list.length;
                const short = ist < soll;
                return (
                  <tr key={d.id}>
                    <td className="dt-strong baseball-text-cell" title={d.name}>{d.name}</td>
                    <td className="baseball-dienste-persons">
                      <div className="baseball-field-chips">
                        {list.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="baseball-field-chip baseball-dienste-chip"
                            disabled={disabled}
                            title={[p.name, p.phone, p.team_name].filter(Boolean).join(' · ')}
                            onClick={() => onOpenPerson(p, d)}
                          >
                            {p.name}
                            {p.phone && <span className="baseball-dienste-chip-phone">{p.phone}</span>}
                          </button>
                        ))}
                        {adding === d.id ? (
                          <input
                            ref={inputRef}
                            type="text"
                            className="input-field baseball-dienste-chip-input"
                            value={draft}
                            maxLength={80}
                            placeholder="Name"
                            aria-label={`Person für ${d.name}, ${shift.label}`}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); save(d.id, true); }
                              if (e.key === 'Escape') { e.preventDefault(); cancelRef.current = true; setDraft(''); setAdding(null); }
                            }}
                            onBlur={() => { if (cancelRef.current) { cancelRef.current = false; return; } save(d.id, false); }}
                          />
                        ) : (
                          <button
                            type="button"
                            className="baseball-dienste-chip-add"
                            disabled={disabled}
                            aria-label={`Person zu ${d.name}, ${shift.label} hinzufügen`}
                            title="Person hinzufügen"
                            onClick={() => { cancelRef.current = false; setDraft(''); setAdding(d.id); }}
                          >
                            <Plus size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      <TextCell
                        type="number"
                        step="1"
                        value={soll}
                        disabled={disabled}
                        label={`Soll ${d.name}, ${shift.label}`}
                        onSave={(n) => onSetNeeded(d.id, shift.id, n)}
                      />
                    </td>
                    <td>
                      {soll === 0 && ist === 0 ? (
                        <span className="dt-muted">–</span>
                      ) : (
                        <span className={`baseball-dienste-ist${short ? ' baseball-dienste-ist--short' : ''}`}>{ist}</span>
                      )}
                    </td>
                    <td>
                      <div className="baseball-row-actions">
                        <DeleteButton
                          label={`Dienst ${d.name} löschen`}
                          disabled={disabled}
                          onClick={() => onDeleteDuty(d)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default BaseballShiftCard;
