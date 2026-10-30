import { useState, useRef, useEffect } from 'react';
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import useSettings from '../hooks/useSettings';
import useFocusTrap from '../hooks/useFocusTrap';
import Button from './Button';
import { shiftTimeError } from '../utils/shiftLayout';
import './ClientModal.css'; // shared .modal-overlay / .modal-content / .modal-actions styles
import './SettingsFieldsModal.css';
import './GluehweinShiftSettingsModal.css';

const DEFAULT_TEMPLATES = ['16:00-19:00', '19:00-22:00'];
const SLOT_RE = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/;

/** Parses the gluehwein_shift_templates setting (JSON array of "HH:MM-HH:MM"). */
function parseShiftTemplates(raw) {
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const list = JSON.parse(raw ?? '');
    if (Array.isArray(list)) return list.map(String);
  } catch { /* fall through */ }
  return [...DEFAULT_TEMPLATES];
}

/** Returns an error text for one template row, or null when it is valid. */
function templateError(value) {
  const m = SLOT_RE.exec(String(value ?? '').trim());
  if (!m) return 'Format HH:MM-HH:MM, z. B. 16:00-19:00.';
  // End before start = shift ends after midnight (e.g. 22:00-02:00).
  const err = shiftTimeError(`${m[1]}:${m[2]}`, `${m[3]}:${m[4]}`);
  if (err === 'SLOT_TOO_LONG') return 'Eine Schicht darf höchstens 12 Stunden dauern.';
  if (err) return 'Beginn und Ende dürfen nicht gleich sein.';
  return null;
}

const toTimeRow = (s) => {
  const [start = '', end = ''] = String(s).split('-');
  return { start, end };
};

/**
 * Popup for the Glühwein shift settings, saved per scout year (`year_settings`, like the Lasagnen prices):
 * gluehwein_shift_templates, gluehwein_mandatory_shifts, gluehwein_bonus_enabled, gluehwein_bonus_factor.
 * onSaved(patch) gets the saved { key: string } patch.
 */
const GluehweinShiftSettingsModal = ({ settings, year, yearLocked, onClose, onSaved }) => {
  const { saveYearSettings } = useSettings();
  const [rows, setRows] = useState(() => parseShiftTemplates(settings?.gluehwein_shift_templates).map(toTimeRow));
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

  const setRow = (i, field, value) => {
    setRows((list) => list.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
    setErrors((e) => ({ ...e, [`row${i}`]: undefined, templates: undefined }));
  };
  const addRow = () => {
    setRows((list) => {
      const last = list[list.length - 1];
      return [...list, { start: last?.end || '', end: '' }];
    });
    setErrors((e) => ({ ...e, templates: undefined }));
  };
  const removeRow = (i) => {
    setRows((list) => list.filter((_, idx) => idx !== i));
    setErrors({});
  };

  const validate = () => {
    const next = {};
    const templates = rows.map((r) => `${r.start.trim()}-${r.end.trim()}`);
    templates.forEach((tpl, i) => {
      const err = templateError(tpl);
      if (err) next[`row${i}`] = err;
    });
    const starts = templates.map((tpl) => tpl.split('-')[0]);
    starts.forEach((s, i) => {
      if (!next[`row${i}`] && starts.indexOf(s) !== i) next[`row${i}`] = 'Diese Beginnzeit gibt es schon.';
    });
    if (templates.length === 0) next.templates = 'Mindestens eine Schicht anlegen.';

    const m = mandatory.trim();
    if (m !== '' && !/^\d+$/.test(m)) next.mandatory = 'Bitte eine ganze Zahl (≥ 0) eingeben.';

    const f = factor.trim();
    if (f !== '' && (!/^\d+$/.test(f) || Number(f) > 100)) next.factor = 'Bitte eine ganze Zahl von 0 bis 100 eingeben.';

    setErrors(next);
    if (Object.keys(next).length) return null;
    const sorted = [...templates].sort(); // "HH:MM-…" sorts by start time
    return {
      gluehwein_shift_templates: JSON.stringify(sorted),
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
        <p className="settings-fields-modal-desc">
          Schichtzeiten, Pflichtschichten pro Hori und Bonus für Extra-Schichten
          {year != null ? ` (gelten für ${year}/${String((Number(year) + 1) % 100).padStart(2, '0')})` : ''}.
        </p>
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
            <legend className="input-label">Schichtzeiten</legend>
            <ul className="gw-shift-settings-rows">
              {rows.map((r, i) => {
                const err = errors[`row${i}`];
                return (
                  <li key={i} className="gw-shift-settings-row">
                    <div className="gw-shift-settings-times">
                      <input
                        type="time"
                        className={`input-field${err ? ' error' : ''}`}
                        aria-label={`Schicht ${i + 1} Beginn`}
                        value={r.start}
                        onChange={(e) => setRow(i, 'start', e.target.value)}
                        aria-invalid={err ? 'true' : undefined}
                      />
                      <span className="gw-shift-settings-dash">–</span>
                      <input
                        type="time"
                        className={`input-field${err ? ' error' : ''}`}
                        aria-label={`Schicht ${i + 1} Ende`}
                        value={r.end}
                        onChange={(e) => setRow(i, 'end', e.target.value)}
                        aria-invalid={err ? 'true' : undefined}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRow(i)}
                        aria-label={`Schicht ${i + 1} entfernen`}
                        title="Schicht entfernen"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                    {err && <span className="input-error">{err}</span>}
                  </li>
                );
              })}
            </ul>
            {errors.templates && <span className="input-error">{errors.templates}</span>}
            <span className="settings-fields-modal-hint">Ende vor Beginn = Schicht endet nach Mitternacht (z. B. 22:00–02:00).</span>
            <Button type="button" variant="secondary" size="sm" onClick={addRow}>
              <Plus size={16} /> Schicht hinzufügen
            </Button>
          </fieldset>

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
                {errors.mandatory
                  ? <span className="input-error">{errors.mandatory}</span>
                  : <span className="settings-fields-modal-hint">Nur Schichten darüber zählen als Extra für den Bonus.</span>}
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
                {errors.factor
                  ? <span className="input-error">{errors.factor}</span>
                  : <span className="settings-fields-modal-hint">100 % = voller Anteil, 50 % = halber Anteil.</span>}
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
                <span className="settings-fields-modal-hint">
                  Der Anteil an den Extra-Schichten senkt den Lagerbeitrag eines Horis.
                </span>
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
