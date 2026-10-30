import { useState, useRef, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import useFocusTrap from '../hooks/useFocusTrap';
import { crossesMidnight, shiftDuration, shiftTimeError } from '../utils/shiftLayout';
import Button from './Button';
import './ClientModal.css'; // shared .modal-overlay / .modal-content / .modal-actions styles
import './SettingsFieldsModal.css'; // shared field grid (.settings-fields-modal-*)
import './GluehweinShiftModal.css';

const ERROR_TEXT = {
  BAD_SLOT_TIME: 'Bitte Beginn und Ende eingeben (nicht gleich).',
  SLOT_TOO_LONG: 'Eine Schicht darf höchstens 12 Stunden dauern.',
  SLOT_EXISTS: 'An diesem Tag gibt es schon eine Schicht mit dieser Beginnzeit.',
  YEAR_LOCKED: 'Dieses Jahr ist abgeschlossen und kann nicht mehr geändert werden.',
};

const fmtDuration = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`;
};

/**
 * Add / edit one shift of a Verkaufstag: Beginn + Ende ("HH:MM"). Ende before Beginn = ends after midnight.
 * Props: dayLabel, slot (null = new, else { id, start_time, end_time }), defaultStart, existingStarts ("HH:MM"[] of
 * the other shifts of that day), onSave(start, end) → Promise (throw Error(code) to show it), onCancel.
 */
const GluehweinShiftModal = ({ dayLabel, slot, defaultStart = '', existingStarts = [], onSave, onCancel }) => {
  const [start, setStart] = useState(() => String(slot?.start_time ?? defaultStart ?? '').slice(0, 5));
  const [end, setEnd] = useState(() => {
    const e = String(slot?.end_time ?? '').slice(0, 5);
    return slot && e === String(slot.start_time ?? '').slice(0, 5) ? '' : e; // open end → empty field
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const modalRef = useRef(null);
  useFocusTrap(modalRef, { active: true });

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const duration = shiftDuration(start, end);
  const nextDay = crossesMidnight(start, end);
  const liveError = start && end ? shiftTimeError(start, end) : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const code = shiftTimeError(start, end)
      || (existingStarts.includes(start) ? 'SLOT_EXISTS' : null);
    if (code) { setError(ERROR_TEXT[code]); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(start, end);
    } catch (err) {
      const msg = String(err?.message ?? '');
      const known = Object.keys(ERROR_TEXT).find((k) => msg.startsWith(k));
      setError(known ? ERROR_TEXT[known] : 'Schicht konnte nicht gespeichert werden.');
      setSaving(false);
    }
  };

  const title = slot ? 'Schicht bearbeiten' : 'Schicht hinzufügen';

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="gw-shift-modal-title">
      <div className="modal-content settings-fields-modal gw-shift-modal" ref={modalRef}>
        <h2 id="gw-shift-modal-title">{title}</h2>
        <p className="settings-fields-modal-desc">{dayLabel}</p>
        <form onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="page-error" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
          <div className="settings-fields-modal-grid">
            <div className="settings-fields-modal-field">
              <label className="input-label" htmlFor="gw-shift-start">Beginn</label>
              <input
                id="gw-shift-start"
                type="time"
                className="input-field gw-shift-modal-time"
                value={start}
                autoFocus
                onChange={(e) => { setStart(e.target.value); setError(null); }}
              />
            </div>
            <div className="settings-fields-modal-field">
              <label className="input-label" htmlFor="gw-shift-end">Ende</label>
              <input
                id="gw-shift-end"
                type="time"
                className="input-field gw-shift-modal-time"
                value={end}
                onChange={(e) => { setEnd(e.target.value); setError(null); }}
              />
            </div>
            <div className="settings-fields-modal-field wide">
              <div className="gw-shift-modal-summary" aria-live="polite">
                {duration != null && duration > 0 ? (
                  <>
                    <span>Dauer <strong className="gw-shift-modal-duration">{fmtDuration(duration)}</strong></span>
                    {nextDay && <span className="gw-shift-modal-badge">+1 Tag</span>}
                  </>
                ) : <span className="gw-shift-modal-muted">Dauer —</span>}
                {liveError === 'SLOT_TOO_LONG' && <span className="input-error">max. 12 h</span>}
              </div>
              <span className="settings-fields-modal-hint">Ende vor Beginn = nach Mitternacht (endet am Folgetag).</span>
            </div>
          </div>
          <div className="modal-actions">
            <Button variant="ghost" type="button" onClick={onCancel}>Abbrechen</Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Speichern…' : (slot ? 'Speichern' : 'Hinzufügen')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GluehweinShiftModal;
