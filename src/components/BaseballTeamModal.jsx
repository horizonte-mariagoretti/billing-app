import { useState, useRef, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import useFocusTrap from '../hooks/useFocusTrap';
import Button from './Button';
import Input from './Input';
import BaseballFieldSelect from './BaseballFieldSelect';
import './ClientModal.css'; // shared .modal-overlay / .modal-content / .form-row / .modal-actions styles
import './BaseballTeamModal.css';

/**
 * Edit one Baseballturnier team: Gruppenname (required), Feld, Ansprechpartner, Telefon, E-Mail.
 * fields = the year's baseball_fields; fieldCounts = Map field id → team count (a full field is disabled
 * unless it is the team's own).
 * onSave(patch) resolves to true when saved; false keeps the dialog open (the error shows in the page banner).
 */
const BaseballTeamModal = ({ team, fields, fieldCounts, onSave, onCancel, triggerRef }) => {
  const [form, setForm] = useState(() => ({
    name: team?.name || '',
    field_id: team?.field_id || null,
    contact_name: team?.contact_name || '',
    phone: team?.phone || '',
    email: team?.email || '',
  }));
  const [nameError, setNameError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const modalRef = useRef(null);
  useFocusTrap(modalRef, { active: true, triggerRef });

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (key === 'name') setNameError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setNameError('Gruppenname ist erforderlich');
      return;
    }
    setSaving(true);
    setSaveError(null);
    const ok = await onSave({
      name,
      field_id: form.field_id || null,
      contact_name: form.contact_name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
    });
    if (!ok) {
      setSaveError('Team konnte nicht gespeichert werden.');
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="baseball-team-modal-title">
      <div className="modal-content baseball-team-modal" ref={modalRef}>
        <h2 id="baseball-team-modal-title">Team bearbeiten</h2>
        <form onSubmit={handleSubmit} noValidate>
          {saveError && (
            <div className="page-error" role="alert">
              <AlertCircle size={16} />
              <span>{saveError}</span>
            </div>
          )}
          <Input
            label="Gruppenname"
            value={form.name}
            maxLength={60}
            onChange={set('name')}
            error={nameError}
            autoComplete="off"
            required
          />
          <div className="input-group baseball-team-modal-field">
            <span className="input-label">Feld</span>
            <BaseballFieldSelect
              fields={fields}
              counts={fieldCounts}
              value={form.field_id}
              ownFieldId={team?.field_id || null}
              onChange={(id) => setForm((f) => ({ ...f, field_id: id }))}
            />
          </div>
          <Input
            label="Ansprechpartner"
            value={form.contact_name}
            maxLength={80}
            onChange={set('contact_name')}
            autoComplete="off"
          />
          <div className="form-row">
            <Input
              label="Telefon"
              type="tel"
              value={form.phone}
              maxLength={40}
              onChange={set('phone')}
              autoComplete="off"
            />
            <Input
              label="E-Mail"
              type="email"
              value={form.email}
              maxLength={120}
              onChange={set('email')}
              autoComplete="off"
            />
          </div>
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

export default BaseballTeamModal;
