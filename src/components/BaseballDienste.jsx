import { useState, useEffect, useCallback } from 'react';
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import { useBaseballDuties } from '../hooks/useBaseballDuties';
import Button from './Button';
import ConfirmDialog from './ConfirmDialog';
import './DataTable.css';
import './BaseballDienste.css';

const fmtShift = (s) => (s.start_time && s.end_time ? `${s.label} (${s.start_time}–${s.end_time} Uhr)` : s.label);

/**
 * Parent duties of the Baseballturnier (Elterndienste): one row per duty, one column per shift, the parents'
 * names in each cell. Cells save when the field loses focus. A locked year is read-only.
 */
const BaseballDienste = ({ year, yearLocked, onError }) => {
  const { fetchDuties, addDuty, deleteDuty, addShift, deleteShift, saveCell } = useBaseballDuties();
  const [data, setData] = useState({ duties: [], shifts: [], cells: new Map() });
  const [loadedYear, setLoadedYear] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [newDuty, setNewDuty] = useState('');
  const [newShift, setNewShift] = useState({ label: '', start: '', end: '' });
  const [confirm, setConfirm] = useState(null); // { kind: 'duty'|'shift', id, label }
  const [busy, setBusy] = useState(false);

  const report = useCallback((err, fallback) => {
    if (err?.message === 'YEAR_LOCKED') onError?.('Das Jahr ist gesperrt.');
    else if (err?.message === 'NAME_EMPTY') onError?.('Bitte einen Namen eingeben.');
    else onError?.(fallback);
  }, [onError]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await fetchDuties(year);
        if (!cancelled) setData(d);
      } catch {
        if (!cancelled) onError?.('Elterndienste konnten nicht geladen werden.');
      } finally {
        if (!cancelled) setLoadedYear(year);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchDuties, year, reloadKey]);

  const run = async (fn, fallback) => {
    if (yearLocked) return;
    setBusy(true);
    try {
      await fn();
      setReloadKey((k) => k + 1);
    } catch (err) {
      report(err, fallback);
    } finally {
      setBusy(false);
    }
  };

  const handleAddDuty = (e) => {
    e.preventDefault();
    run(async () => { await addDuty(year, newDuty); setNewDuty(''); }, 'Dienst konnte nicht angelegt werden.');
  };

  const handleAddShift = (e) => {
    e.preventDefault();
    run(async () => {
      await addShift(year, newShift.label, newShift.start, newShift.end);
      setNewShift({ label: '', start: '', end: '' });
    }, 'Schicht konnte nicht angelegt werden.');
  };

  const confirmDelete = async () => {
    const target = confirm;
    setConfirm(null);
    await run(
      () => (target.kind === 'duty' ? deleteDuty(year, target.id) : deleteShift(year, target.id)),
      'Löschen fehlgeschlagen.'
    );
  };

  const handleCellBlur = (dutyId, shiftId, value, previous) => {
    if (value.trim() === (previous || '').trim()) return;
    run(() => saveCell(year, dutyId, shiftId, value), 'Eintrag konnte nicht gespeichert werden.');
  };

  if (loadedYear !== year) return <div className="baseball-dienste-loading">Lade Elterndienste…</div>;

  const disabled = !!yearLocked || busy;

  return (
    <div className="baseball-dienste">
      {yearLocked && (
        <div className="baseball-dienste-note" role="note">
          <AlertCircle size={14} /> Dieses Jahr ist abgeschlossen. Die Elterndienste sind nur lesbar.
        </div>
      )}

      <div className="baseball-dienste-add">
        <form className="baseball-dienste-form" onSubmit={handleAddDuty}>
          <input
            type="text"
            className="input-field"
            placeholder="Dienst, z. B. Theke"
            value={newDuty}
            maxLength={40}
            disabled={disabled}
            onChange={(e) => setNewDuty(e.target.value)}
            aria-label="Neuer Dienst"
          />
          <Button type="submit" variant="secondary" size="md" disabled={disabled || !newDuty.trim()}>
            <Plus size={16} /> Dienst hinzufügen
          </Button>
        </form>
        <form className="baseball-dienste-form" onSubmit={handleAddShift}>
          <input
            type="text"
            className="input-field"
            placeholder="Schicht, z. B. Schicht 1"
            value={newShift.label}
            maxLength={40}
            disabled={disabled}
            onChange={(e) => setNewShift({ ...newShift, label: e.target.value })}
            aria-label="Neue Schicht"
          />
          <input
            type="time"
            className="input-field"
            value={newShift.start}
            disabled={disabled}
            onChange={(e) => setNewShift({ ...newShift, start: e.target.value })}
            aria-label="Beginn"
          />
          <input
            type="time"
            className="input-field"
            value={newShift.end}
            disabled={disabled}
            onChange={(e) => setNewShift({ ...newShift, end: e.target.value })}
            aria-label="Ende"
          />
          <Button type="submit" variant="secondary" size="md" disabled={disabled || !newShift.label.trim()}>
            <Plus size={16} /> Schicht hinzufügen
          </Button>
        </form>
      </div>

      {data.duties.length === 0 || data.shifts.length === 0 ? (
        <div className="baseball-dienste-empty card">
          Noch keine Dienste oder Schichten. Oben einen Dienst und eine Schicht anlegen, dann die Namen eintragen.
        </div>
      ) : (
        <div className="data-table-container">
          <table className="data-table baseball-dienste-table">
            <thead>
              <tr>
                <th>Dienst</th>
                {data.shifts.map((s) => (
                  <th key={s.id}>
                    <span className="baseball-dienste-shift">
                      {fmtShift(s)}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        aria-label={`Schicht ${s.label} entfernen`}
                        title="Schicht entfernen"
                        onClick={() => setConfirm({ kind: 'shift', id: s.id, label: s.label })}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </span>
                  </th>
                ))}
                <th aria-label="Aktionen" />
              </tr>
            </thead>
            <tbody>
              {data.duties.map((d) => (
                <tr key={d.id}>
                  <td className="baseball-dienste-duty">{d.name}</td>
                  {data.shifts.map((s) => {
                    const key = `${d.id}|${s.id}`;
                    const value = data.cells.get(key) || '';
                    return (
                      <td key={s.id}>
                        <input
                          type="text"
                          className="input-field baseball-dienste-cell"
                          defaultValue={value}
                          key={`${key}:${value}`}
                          disabled={disabled}
                          aria-label={`${d.name}, ${fmtShift(s)}`}
                          onBlur={(e) => handleCellBlur(d.id, s.id, e.target.value, value)}
                        />
                      </td>
                    );
                  })}
                  <td>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      aria-label={`Dienst ${d.name} entfernen`}
                      title="Dienst entfernen"
                      onClick={() => setConfirm({ kind: 'duty', id: d.id, label: d.name })}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'duty' ? 'Dienst löschen?' : 'Schicht löschen?'}
          message={`${confirm.label}: Die Namen in dieser ${confirm.kind === 'duty' ? 'Zeile' : 'Spalte'} gehen verloren.`}
          confirmLabel="Löschen"
          onConfirm={confirmDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
};

export default BaseballDienste;
