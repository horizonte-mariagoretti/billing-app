import { useState, useRef, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import useFocusTrap from '../hooks/useFocusTrap';
import { shiftDuration, shiftTimeError } from '../utils/shiftLayout';
import Button from './Button';
import Input from './Input';
import './ClientModal.css'; // shared .modal-overlay / .modal-content / .form-row / .modal-actions styles
import './BaseballTeamModal.css';

const TIME_ERRORS = {
  BAD_SLOT_TIME: 'Beginn und Ende dürfen nicht gleich sein.',
  SLOT_TOO_LONG: 'Eine Schicht darf höchstens 12 Stunden dauern.',
};

const fmtDuration = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')} h`;

/**
 * Add or edit one Baseballturnier shift: Name (required), Beginn (required), Ende (optional = open end;
 * an end before the begin means past midnight). shift = null adds a new one.
 * onSave({ label, start_time, end_time }) resolves to true when saved; false keeps the dialog open.
 */
const BaseballShiftModal = ({ shift, defaultLabel = '', onSave, onCancel }) => {
  const [form, setForm] = useState(() => ({
    label: shift?.label || defaultLabel,
    start: shift?.start_time || '',
    end: shift?.end_time || '',
  }));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const modalRef = useRef(null);
  useFocusTrap(modalRef, { active: true });

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((er) => ({ ...er, [key]: null, end: key === 'start' ? null : er.end }));
  };

  const duration = form.start && form.end ? shiftDuration(form.start, form.end) : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const label = form.label.trim();
    const next = {};
    if (!label) next.label = 'Name ist erforderlich';
    if (!form.start) next.start = 'Beginn ist erforderlich';
    else if (form.end) {
      const err = shiftTimeError(form.start, form.end);
      if (err) next.end = TIME_ERRORS[err];
    }
    if (Object.values(next).some(Boolean)) {
      setErrors(next);
      return;
    }
    setSaving(true);
    setSaveError(null);
    const ok = await onSave({ label, start_time: form.start, end_time: form.end || null });
    if (!ok) {
      setSaveError('Schicht konnte nicht gespeichert werden.');
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="baseball-shift-modal-title">
      <div className="modal-content baseball-team-modal" ref={modalRef}>
        <h2 id="baseball-shift-modal-title">{shift ? 'Schicht bearbeiten' : 'Schicht hinzufügen'}</h2>
        <form onSubmit={handleSubmit} noValidate>
          {saveError && (
            <div className="page-error" role="alert">
              <AlertCircle size={16} />
              <span>{saveError}</span>
            </div>
          )}
          <Input
            label="Name"
            value={form.label}
            maxLength={40}
            placeholder="z. B. Schicht 1"
            onChange={set('label')}
            error={errors.label}
            autoComplete="off"
            required
          />
          <div className="form-row">
            <Input label="Beginn" type="time" value={form.start} onChange={set('start')} error={errors.start} required />
            <Input label="Ende (optional)" type="time" value={form.end} onChange={set('end')} error={errors.end} />
          </div>
          <p className="baseball-shift-modal-hint">
            {!form.end
              ? 'Ohne Ende gilt die Schicht als offen („ab …").'
              : duration
                ? `Dauer ${fmtDuration(duration)}${form.end < form.start ? ' (bis nach Mitternacht)' : ''}`
                : ' '}
          </p>
          <div className="modal-actions">
            <Button variant="ghost" type="button" onClick={onCancel}>Abbrechen</Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Speichern…' : 'Speichern'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BaseballShiftModal;
