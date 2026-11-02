import { useState, useRef, useEffect } from 'react';
import { AlertCircle, Trash2 } from 'lucide-react';
import useFocusTrap from '../hooks/useFocusTrap';
import Button from './Button';
import Input from './Input';
import StyledSelect from './StyledSelect';
import ConfirmDialog from './ConfirmDialog';
import './ClientModal.css'; // shared .modal-overlay / .modal-content / .form-row / .modal-actions styles
import './BaseballTeamModal.css';

/**
 * Edit one person of a Baseballturnier shift slot: Name (required), Telefon, Team (optional, the year's teams).
 * context = "Theke · Schicht 1" (shown under the title).
 * onSave(patch) and onDelete() resolve to true when done; false keeps the dialog open.
 */
const BaseballPersonModal = ({ person, context, teams, onSave, onDelete, onCancel }) => {
  const [form, setForm] = useState(() => ({
    name: person?.name || '',
    phone: person?.phone || '',
    team_id: person?.team_id || '',
  }));
  const [nameError, setNameError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const modalRef = useRef(null);
  useFocusTrap(modalRef, { active: !confirmDelete });

  useEffect(() => {
    if (confirmDelete) return undefined; // Escape then belongs to the confirm dialog
    const handleKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel, confirmDelete]);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (key === 'name') setNameError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setNameError('Name ist erforderlich');
      return;
    }
    setSaving(true);
    setSaveError(null);
    const ok = await onSave({ name, phone: form.phone.trim(), team_id: form.team_id || null });
    if (!ok) {
      setSaveError('Person konnte nicht gespeichert werden.');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    setSaving(true);
    const ok = await onDelete();
    if (!ok) {
      setSaveError('Person konnte nicht gelöscht werden.');
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="baseball-person-modal-title">
      <div className="modal-content baseball-team-modal" ref={modalRef}>
        <h2 id="baseball-person-modal-title">Person bearbeiten</h2>
        {context && <p className="baseball-person-modal-context">{context}</p>}
        <form onSubmit={handleSubmit} noValidate>
          {saveError && (
            <div className="page-error" role="alert">
              <AlertCircle size={16} />
              <span>{saveError}</span>
            </div>
          )}
          <Input
            label="Name"
            value={form.name}
            maxLength={80}
            onChange={set('name')}
            error={nameError}
            autoComplete="off"
            required
          />
          <div className="form-row">
            <Input
              label="Telefon (optional)"
              type="tel"
              value={form.phone}
              maxLength={40}
              onChange={set('phone')}
              autoComplete="off"
            />
            <div className="input-group">
              <span className="input-label">Team (optional)</span>
              <StyledSelect
                portal
                value={form.team_id}
                onChange={(e) => setForm((f) => ({ ...f, team_id: e.target.value || '' }))}
              >
                <option value="">–</option>
                {(teams || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </StyledSelect>
            </div>
          </div>
          <div className="modal-actions baseball-person-modal-actions">
            <Button variant="danger" type="button" disabled={saving} onClick={() => setConfirmDelete(true)}>
              <Trash2 size={15} /> Löschen
            </Button>
            <span className="baseball-person-modal-spacer" />
            <Button variant="ghost" type="button" onClick={onCancel}>Abbrechen</Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Speichern…' : 'Speichern'}
            </Button>
          </div>
        </form>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title="Person löschen?"
          message={`${person?.name || 'Diese Person'} wird aus der Schicht entfernt.`}
          confirmLabel="Löschen"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
};

export default BaseballPersonModal;
