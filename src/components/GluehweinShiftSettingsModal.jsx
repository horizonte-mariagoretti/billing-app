import { useState, useRef, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import useSettings from '../hooks/useSettings';
import useFocusTrap from '../hooks/useFocusTrap';
import Button from './Button';
import './ClientModal.css'; // shared .modal-overlay / .modal-content / .modal-actions styles
import './SettingsFieldsModal.css';
import './GluehweinShiftSettingsModal.css';

/**
 * Popup for the Glühwein shift settings, saved per scout year (`year_settings`, like the Lasagnen prices):
 * gluehwein_mandatory_shifts, gluehwein_bonus_enabled, gluehwein_bonus_factor.
 * onSaved(patch) gets the saved { key: string } patch.
 */
const GluehweinShiftSettingsModal = ({ settings, year, yearLocked, onClose, onSaved }) => {
  const { saveYearSettings } = useSettings();
  const [mandatory, setMandatory] = useState(() => String(settings?.gluehwein_mandatory_shifts ?? '0'));
  const [bonusEnabled, setBonusEnabled] = useState(() => String(settings?.gluehwein_bonus_enabled ?? '0') === '1');
  const [factor, setFactor] = useState(() => String(settings?.gluehwein_bonus_factor ?? '100'));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const modalRef = useRef(null);
  useFocusTrap(modalRef, { active: true });

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const disabled = !!yearLocked || saving;

  const validate = () => {
    const next = {};
    const m = mandatory.trim();
    if (m !== '' && !/^\d+$/.test(m)) next.mandatory = 'Bitte eine ganze Zahl (≥ 0) eingeben.';

    const f = factor.trim();
    if (f !== '' && (!/^\d+$/.test(f) || Number(f) > 100)) next.factor = 'Bitte eine ganze Zahl von 0 bis 100 eingeben.';

    setErrors(next);
    if (Object.keys(next).length) return null;
    return {
      gluehwein_mandatory_shifts: String(m === '' ? 0 : parseInt(m, 10)),
      gluehwein_bonus_enabled: bonusEnabled ? '1' : '0',
      gluehwein_bonus_factor: String(f === '' ? 100 : parseInt(f, 10)),
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (yearLocked) return;
    const patch = validate();
    if (!patch) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveYearSettings(year, patch);
      onSaved?.(patch);
    } catch (err) {
      setSaveError(err?.message === 'YEAR_LOCKED'
        ? 'Dieses Jahr ist abgeschlossen. Die Einstellungen können hier nicht geändert werden.'
        : 'Einstellungen konnten nicht gespeichert werden.');
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="gw-shift-settings-title">
      <div className="modal-content settings-fields-modal gw-shift-settings" ref={modalRef}>
        <h2 id="gw-shift-settings-title">Schicht-Einstellungen</h2>
        <form onSubmit={handleSubmit} noValidate>
          {yearLocked && (
            <div className="gw-shift-settings-note" role="note">
              Dieses Jahr ist abgeschlossen. Die Einstellungen können hier nicht geändert werden.
            </div>
          )}
          {saveError && (
            <div className="page-error" role="alert">
              <AlertCircle size={16} />
              <span>{saveError}</span>
            </div>
          )}

          <fieldset className="gw-shift-settings-fieldset" disabled={disabled}>
            <div className="settings-fields-modal-grid">
              <div className="settings-fields-modal-field">
                <label className="input-label" htmlFor="gw-mandatory">Pflichtschichten pro Hori</label>
                <input
                  id="gw-mandatory"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  className={`input-field${errors.mandatory ? ' error' : ''}`}
                  value={mandatory}
                  placeholder="0"
                  onChange={(e) => { setMandatory(e.target.value.replace(/\D/g, '')); setErrors((x) => ({ ...x, mandatory: undefined })); }}
                  onFocus={(e) => e.target.select()}
                  aria-invalid={errors.mandatory ? 'true' : undefined}
                />
                {errors.mandatory && <span className="input-error">{errors.mandatory}</span>}
              </div>
              <div className="settings-fields-modal-field">
                <label className="input-label" htmlFor="gw-factor">Bonus-Faktor</label>
                <div className="settings-fields-modal-input">
                  <input
                    id="gw-factor"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    className={`input-field${errors.factor ? ' error' : ''}`}
                    value={factor}
                    placeholder="100"
                    onChange={(e) => { setFactor(e.target.value.replace(/\D/g, '')); setErrors((x) => ({ ...x, factor: undefined })); }}
                    onFocus={(e) => e.target.select()}
                    aria-invalid={errors.factor ? 'true' : undefined}
                  />
                  <span className="settings-fields-modal-suffix">%</span>
                </div>
                {errors.factor && <span className="input-error">{errors.factor}</span>}
              </div>
              <div className="settings-fields-modal-field wide">
                <label className="settings-fields-modal-check" htmlFor="gw-bonus-enabled">
                  <input
                    id="gw-bonus-enabled"
                    type="checkbox"
                    checked={bonusEnabled}
                    onChange={(e) => setBonusEnabled(e.target.checked)}
                  />
                  <span>Glühwein-Bonus aktiv</span>
                </label>
              </div>
            </div>
          </fieldset>

          <div className="modal-actions">
            <Button variant="ghost" type="button" onClick={onClose}>
              {yearLocked ? 'Schließen' : 'Abbrechen'}
            </Button>
            {!yearLocked && (
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? 'Speichern…' : 'Speichern'}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default GluehweinShiftSettingsModal;
