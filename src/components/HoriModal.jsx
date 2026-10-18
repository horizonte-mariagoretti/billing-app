import React, { useState, useRef, useEffect } from 'react';
import useHoris from '../hooks/useHoris';
import useFocusTrap from '../hooks/useFocusTrap';
import { useT } from '../hooks/useUiTranslations';
import { calcAge } from '../utils/jobHours';
import Button from './Button';
import Input from './Input';
import DatePicker from './DatePicker';
import { AlertCircle } from 'lucide-react';
import './ClientModal.css'; // shared .modal-overlay / .modal-content / .form-row styles
import './HoriModal.css';

const HoriModal = ({ editingHori, onSave, onCancel, triggerRef }) => {
  const { saveHori } = useHoris();
  const t = useT();
  const [formData, setFormData] = useState(() => ({
    first_name: editingHori?.first_name || '',
    last_name:  editingHori?.last_name || '',
    birth_date: editingHori?.birth_date || '',
    active:     editingHori ? editingHori.active === 1 || editingHori.active === true : true,
  }));
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const modalRef = useRef(null);
  useFocusTrap(modalRef, { active: true, triggerRef });

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const age = formData.birth_date ? calcAge(formData.birth_date) : null;
  const ageOutOfRange = age != null && (age < 14 || age > 16);

  const validate = () => {
    const errors = {};
    if (!formData.first_name.trim()) errors.first_name = t('horis_first_name_required', 'Vorname ist erforderlich');
    if (!formData.last_name.trim())  errors.last_name  = t('horis_last_name_required', 'Nachname ist erforderlich');
    if (!formData.birth_date)        errors.birth_date = t('horis_birth_date_required', 'Geburtsdatum ist erforderlich');
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        first_name: formData.first_name.trim(),
        last_name:  formData.last_name.trim(),
        birth_date: formData.birth_date,
        active:     formData.active ? 1 : 0,
      };
      if (editingHori?.id) payload.id = editingHori.id;
      const id = await saveHori(payload);
      onSave({ ...payload, id: id ?? editingHori?.id });
    } catch (err) {
      setSaveError(t('horis_save_error', 'Hori konnte nicht gespeichert werden.'));
      setSaving(false);
    }
  };

  const title = editingHori
    ? t('horis_edit_title', 'Hori bearbeiten')
    : t('horis_add_title', 'Neuen Hori hinzufügen');

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="hori-modal-title">
      <div className="modal-content horis-modal" ref={modalRef}>
        <h2 id="hori-modal-title">{title}</h2>
        <form onSubmit={handleSubmit} noValidate>
          {saveError && (
            <div className="page-error" role="alert">
              <AlertCircle size={16} />
              <span>{saveError}</span>
            </div>
          )}
          <div className="form-row">
            <Input
              label={t('horis_field_first_name', 'Vorname')}
              value={formData.first_name}
              onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              error={formErrors.first_name}
              autoComplete="off"
              required
            />
            <Input
              label={t('horis_field_last_name', 'Nachname')}
              value={formData.last_name}
              onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              error={formErrors.last_name}
              autoComplete="off"
              required
            />
          </div>

          <div className="horis-modal-date">
            <DatePicker
              label={t('horis_field_birth_date', 'Geburtsdatum')}
              value={formData.birth_date}
              onChange={(v) => setFormData({ ...formData, birth_date: v })}
            />
            {formErrors.birth_date && <span className="input-error">{formErrors.birth_date}</span>}
            {age != null && !formErrors.birth_date && (
              <span className={`horis-modal-hint${ageOutOfRange ? ' warn' : ''}`}>
                {t('horis_age_label', 'Alter')}: {age} {t('horis_years', 'Jahre')}
                {ageOutOfRange && ` — ${t('horis_age_out_of_range', 'außerhalb von 14–16 Jahren')}`}
              </span>
            )}
          </div>

          <label className="horis-modal-check">
            <input
              type="checkbox"
              checked={formData.active}
              onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
            />
            <span>
              <strong>{t('horis_field_active', 'Aktiv')}</strong>
              <small>{t('horis_field_active_hint', 'Inaktive Horis werden nicht mehr für neue Arbeiten vorgeschlagen.')}</small>
            </span>
          </label>

          <div className="modal-actions">
            <Button variant="ghost" type="button" onClick={onCancel}>{t('btn_cancel', 'Abbrechen')}</Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? t('horis_saving', 'Speichern…') : t('horis_save', 'Hori speichern')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default HoriModal;
