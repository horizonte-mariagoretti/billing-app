import { useState, useRef, useEffect } from 'react';
import useSettings from '../hooks/useSettings';
import useFocusTrap from '../hooks/useFocusTrap';
import { useT } from '../hooks/useUiTranslations';
import Button from './Button';
import DecimalInput from './DecimalInput';
import { AlertCircle } from 'lucide-react';
import './ClientModal.css'; // shared .modal-overlay / .modal-content / .modal-actions styles
import './SettingsFieldsModal.css';

/**
 * Small modal that edits a few settings keys in place (e.g. lasagne prices, camp contribution).
 *
 * fields: [{ key, label, hint?, placeholder?, kind: 'decimal' | 'count' | 'checkbox', allowEmpty?, wide?, max?, suffix? }]
 *   checkbox → saved as '1' / '0'. max: upper bound for count/decimal. suffix: unit shown after the input (e.g. %).
 *   decimal → DecimalInput (comma decimals, >= 0); count → digits only (whole number).
 *   allowEmpty: empty is saved as '' (meaning "not set"); otherwise empty is saved as '0'.
 *   wide: field spans both grid columns.
 * values: current settings object (only the field keys are read).
 * onSaved(patch): called with the saved { key: string } patch after a successful write.
 */
const SettingsFieldsModal = ({ title, description, fields, values, onSaved, onCancel, triggerRef, saveFn }) => {
  const { saveSettings } = useSettings();
  const t = useT();
  const [form, setForm] = useState(() =>
    Object.fromEntries(fields.map((f) => [f.key, values?.[f.key] == null ? '' : String(values[f.key])]))
  );
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const modalRef = useRef(null);
  useFocusTrap(modalRef, { active: true, triggerRef });

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const setValue = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const validate = () => {
    const next = {};
    const patch = {};
    fields.forEach((f) => {
      if (f.kind === 'checkbox') {
        patch[f.key] = form[f.key] === '1' ? '1' : '0';
        return;
      }
      const raw = String(form[f.key] ?? '').trim();
      if (raw === '') {
        patch[f.key] = f.allowEmpty ? '' : '0';
        return;
      }
      if (f.kind === 'count') {
        if (!/^\d+$/.test(raw)) next[f.key] = t('settings_modal_err_count', 'Bitte eine ganze Zahl eingeben.');
        else if (f.max != null && parseInt(raw, 10) > f.max) next[f.key] = `${t('settings_modal_err_max', 'Höchstens')} ${f.max}`;
        else patch[f.key] = String(parseInt(raw, 10));
        return;
      }
      const n = Number(raw.replace(',', '.'));
      if (!Number.isFinite(n) || n < 0) next[f.key] = t('settings_modal_err_number', 'Bitte einen gültigen Betrag (≥ 0) eingeben.');
      else if (f.max != null && n > f.max) next[f.key] = `${t('settings_modal_err_max', 'Höchstens')} ${f.max}`;
      else patch[f.key] = String(Math.round(n * 100) / 100);
    });
    setErrors(next);
    return Object.keys(next).length === 0 ? patch : null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const patch = validate();
    if (!patch) return;
    setSaving(true);
    setSaveError(null);
    try {
      await (saveFn ?? saveSettings)(patch);
      onSaved(patch);
    } catch {
      setSaveError(t('settings_modal_save_error', 'Einstellungen konnten nicht gespeichert werden.'));
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="settings-fields-modal-title">
      <div className="modal-content settings-fields-modal" ref={modalRef}>
        <h2 id="settings-fields-modal-title">{title}</h2>
        {description && <p className="settings-fields-modal-desc">{description}</p>}
        <form onSubmit={handleSubmit} noValidate>
          {saveError && (
            <div className="page-error" role="alert">
              <AlertCircle size={16} />
              <span>{saveError}</span>
            </div>
          )}
          <div className="settings-fields-modal-grid">
            {fields.map((f) => {
              const id = `sfm-${f.key}`;
              const err = errors[f.key];
              return (
                <div key={f.key} className={`settings-fields-modal-field${f.wide ? ' wide' : ''}`}>
                  {f.kind === 'checkbox' ? (
                    <label className="settings-fields-modal-check" htmlFor={id}>
                      <input
                        id={id}
                        type="checkbox"
                        checked={form[f.key] === '1'}
                        onChange={(e) => setValue(f.key, e.target.checked ? '1' : '0')}
                      />
                      <span>{f.label}</span>
                    </label>
                  ) : (
                    <label className="input-label" htmlFor={id}>{f.label}</label>
                  )}
                  {f.kind === 'checkbox' ? null : f.kind === 'count' ? (
                    <div className="settings-fields-modal-input">
                    <input
                      id={id}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      className={`input-field${err ? ' error' : ''}`}
                      value={form[f.key]}
                      placeholder={f.placeholder}
                      onChange={(e) => setValue(f.key, e.target.value.replace(/\D/g, ''))}
                      onFocus={(e) => e.target.select()}
                      aria-invalid={err ? 'true' : undefined}
                    />
                    {f.suffix && <span className="settings-fields-modal-suffix">{f.suffix}</span>}
                    </div>
                  ) : (
                    <DecimalInput
                      id={id}
                      min="0"
                      className={`input-field${err ? ' error' : ''}`}
                      value={form[f.key]}
                      placeholder={f.placeholder}
                      onChange={(e) => setValue(f.key, e.target.value)}
                      onFocus={(e) => e.target.select()}
                      aria-invalid={err ? 'true' : undefined}
                    />
                  )}
                  {err
                    ? <span className="input-error">{err}</span>
                    : f.hint && <span className="settings-fields-modal-hint">{f.hint}</span>}
                </div>
              );
            })}
          </div>
          <div className="modal-actions">
            <Button variant="ghost" type="button" onClick={onCancel}>{t('btn_cancel', 'Abbrechen')}</Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? t('horis_saving', 'Speichern…') : t('btn_save', 'Speichern')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettingsFieldsModal;
