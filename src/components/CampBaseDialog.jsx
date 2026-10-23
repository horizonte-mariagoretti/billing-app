import { useState, useRef, useEffect } from 'react';
import useSettings from '../hooks/useSettings';
import useFocusTrap from '../hooks/useFocusTrap';
import { useT } from '../hooks/useUiTranslations';
import Button from './Button';
import DecimalInput from './DecimalInput';
import { AlertCircle } from 'lucide-react';
import './ClientModal.css'; // shared .modal-overlay / .modal-content / .modal-actions styles
import './CampBaseDialog.css';

const KEYS = ['camp_base_contribution', 'camp_min_contribution', 'camp_reduction_per_percent'];

const toField = (v) => (v == null ? '' : String(v));
// '' -> null, invalid -> NaN, otherwise the number
const parse = (s) => {
  const str = String(s ?? '').trim();
  if (str === '') return null;
  const n = Number(str.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

// Mounted only while open, so every opening starts from the saved values and
// Cancel simply drops the local form state.
const CampBaseForm = ({ settings, onClose, onSaved, triggerRef }) => {
  const { saveSettings } = useSettings();
  const t = useT();
  const [form, setForm] = useState(() => Object.fromEntries(KEYS.map(k => [k, toField(settings?.[k])])));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const ref = useRef(null);
  useFocusTrap(ref, { active: true, triggerRef });

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const set = (key) => (e) => {
    setForm(f => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors(er => ({ ...er, [key]: undefined }));
  };

  const validate = () => {
    const invalid = t('camp_dialog_invalid', 'Bitte eine gültige Zahl ≥ 0 eingeben.');
    const base = parse(form.camp_base_contribution);
    const min = parse(form.camp_min_contribution);
    const step = parse(form.camp_reduction_per_percent);
    const errs = {};
    if (base === null) errs.camp_base_contribution = t('camp_dialog_base_required', 'Basis Lagerbeitrag ist erforderlich.');
    else if (Number.isNaN(base) || base < 0) errs.camp_base_contribution = invalid;
    if (min !== null && (Number.isNaN(min) || min < 0)) errs.camp_min_contribution = invalid;
    else if (min !== null && base !== null && !Number.isNaN(base) && min > base) {
      errs.camp_min_contribution = t('camp_dialog_min_above_base', 'Der Mindestbeitrag darf nicht höher als der Basis Lagerbeitrag sein.');
    }
    if (step !== null && (Number.isNaN(step) || step < 0)) errs.camp_reduction_per_percent = invalid;
    setErrors(errs);
    if (Object.keys(errs).length) return null;
    return {
      camp_base_contribution: String(base),
      camp_min_contribution: String(min ?? 0),
      camp_reduction_per_percent: step === null ? '' : String(step),
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const patch = validate();
    if (!patch) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveSettings(patch);
      onSaved?.(patch);
    } catch {
      setSaveError(t('camp_dialog_save_error', 'Lagerbeitrag konnte nicht gespeichert werden.'));
      setSaving(false);
    }
  };

  const field = (key, label, hint, extra = {}) => (
    <div className="camp-dialog-field">
      <label className="input-label" htmlFor={`camp-dialog-${key}`}>{label}</label>
      <DecimalInput
        id={`camp-dialog-${key}`}
        min="0"
        step="0.01"
        className={`input-field${errors[key] ? ' camp-dialog-input-error' : ''}`}
        value={form[key]}
        onChange={set(key)}
        onFocus={(e) => e.target.select()}
        aria-invalid={errors[key] ? 'true' : undefined}
        aria-describedby={`camp-dialog-${key}-hint`}
        {...extra}
      />
      {errors[key]
        ? <span className="input-error" role="alert">{errors[key]}</span>
        : null}
      <p className="camp-dialog-hint" id={`camp-dialog-${key}-hint`}>{hint}</p>
    </div>
  );

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="camp-dialog-title">
      <div className="modal-content camp-dialog" ref={ref}>
        <h2 id="camp-dialog-title">{t('settings_camp_base', 'Basis Lagerbeitrag')}</h2>
        <form onSubmit={handleSubmit} noValidate>
          {saveError && (
            <div className="page-error" role="alert">
              <AlertCircle size={16} />
              <span>{saveError}</span>
            </div>
          )}
          {field('camp_base_contribution',
            t('settings_camp_base', 'Basis Lagerbeitrag'),
            t('settings_camp_base_hint', 'Maximaler Beitrag pro Hori; wird anhand des Arbeitsanteils reduziert.'))}
          {field('camp_min_contribution',
            t('settings_camp_min', 'Mindestbeitrag'),
            t('settings_camp_min_hint', 'Der Beitrag sinkt nie unter diesen Betrag.'))}
          {field('camp_reduction_per_percent',
            t('settings_camp_step', 'Reduktion pro 1 % Arbeitsanteil'),
            t('settings_camp_step_hint', 'Feste Reduktion in Euro pro Prozent. Leer oder 0: Basis × Arbeitsanteil.'),
            { placeholder: t('settings_camp_step_placeholder', 'leer = proportional') })}

          <div className="modal-actions">
            <Button variant="ghost" type="button" onClick={onClose}>{t('btn_cancel', 'Abbrechen')}</Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? t('horis_saving', 'Speichern…') : t('btn_save', 'Speichern')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

const CampBaseDialog = ({ open, settings, onClose, onSaved, triggerRef }) => {
  if (!open) return null;
  return <CampBaseForm settings={settings} onClose={onClose} onSaved={onSaved} triggerRef={triggerRef} />;
};

export default CampBaseDialog;
