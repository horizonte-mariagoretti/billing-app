import { useState, useRef, useEffect } from 'react';
import useFocusTrap from '../hooks/useFocusTrap';
import { useT } from '../hooks/useUiTranslations';
import { categoriesFor } from '../utils/lasagnaFinance';
import Button from './Button';
import DecimalInput from './DecimalInput';
import { AlertCircle } from 'lucide-react';
import './ClientModal.css'; // shared .modal-overlay / .modal-content / .modal-actions styles
import './SettingsFieldsModal.css'; // shared field grid (.settings-fields-modal-*)

/**
 * Add / edit one manual Lasagnen entry: an expense or extra income (e.g. a donation).
 * kind: 'expense' | 'income'.
 * entry: null for a new one, else { id, description, category, amount }.
 * onSave({ id?, kind, description, category, amount:number }): async; throw to show the save error.
 */
const FinanceEntryModal = ({ kind = 'expense', entry, categories: categoriesProp, onSave, onCancel, triggerRef }) => {
  const t = useT();
  const isIncome = kind === 'income';
  // Optional categories ([{ value, label }]) override the Lasagnen list; without it Lasagnen behaves as before.
  const categories = categoriesProp?.length ? categoriesProp : categoriesFor(kind);
  const [form, setForm] = useState(() => ({
    description: entry?.description || '',
    category: entry?.category || categories[0].value,
    amount: entry ? String(entry.amount ?? '') : '',
  }));
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = Number(String(form.amount).replace(',', '.'));
    const next = {};
    if (!form.description.trim()) next.description = t('lasagnen_exp_err_desc', 'Bitte eine Beschreibung eingeben.');
    if (!Number.isFinite(amount) || amount <= 0) next.amount = t('lasagnen_exp_err_amount', 'Bitte einen Betrag größer 0 eingeben.');
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({ ...(entry?.id ? { id: entry.id } : {}), kind, ...form, amount: Math.round(amount * 100) / 100 });
    } catch {
      setSaveError(t('lasagnen_save_error', 'Änderung konnte nicht gespeichert werden.'));
      setSaving(false);
    }
  };

  const title = isIncome
    ? (entry ? t('lasagnen_inc_edit_title', 'Einnahme bearbeiten') : t('lasagnen_inc_add', 'Einnahme hinzufügen'))
    : (entry ? t('lasagnen_exp_edit_title', 'Ausgabe bearbeiten') : t('lasagnen_exp_add', 'Ausgabe hinzufügen'));

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="finance-entry-modal-title">
      <div className="modal-content settings-fields-modal" ref={modalRef}>
        <h2 id="finance-entry-modal-title">{title}</h2>
        <form onSubmit={handleSubmit} noValidate>
          {saveError && (
            <div className="page-error" role="alert">
              <AlertCircle size={16} />
              <span>{saveError}</span>
            </div>
          )}
          <div className="settings-fields-modal-grid">
            <div className="settings-fields-modal-field wide">
              <label className="input-label" htmlFor="exp-desc">{t('lasagnen_exp_col_desc', 'Beschreibung')}</label>
              <input
                id="exp-desc"
                type="text"
                className={`input-field${errors.description ? ' error' : ''}`}
                value={form.description}
                maxLength={120}
                autoFocus
                placeholder={isIncome ? t('lasagnen_inc_desc_ph', 'z. B. Spende Elternabend') : t('lasagnen_exp_desc_ph', 'z. B. Gemüse Großmarkt')}
                onChange={(e) => setValue('description', e.target.value)}
                aria-invalid={errors.description ? 'true' : undefined}
              />
              {errors.description && <span className="input-error">{errors.description}</span>}
            </div>
            <div className="settings-fields-modal-field">
              <label className="input-label" htmlFor="exp-cat">{t('lasagnen_exp_col_cat', 'Kategorie')}</label>
              <select
                id="exp-cat"
                className="input-field"
                value={form.category}
                onChange={(e) => setValue('category', e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>{t(`lasagnen_cat_${c.value}`, c.label)}</option>
                ))}
              </select>
            </div>
            <div className="settings-fields-modal-field">
              <label className="input-label" htmlFor="exp-amount">{t('lasagnen_exp_col_amount', 'Betrag')}</label>
              <DecimalInput
                id="exp-amount"
                min="0"
                className={`input-field${errors.amount ? ' error' : ''}`}
                value={form.amount}
                placeholder="0,00"
                onChange={(e) => setValue('amount', e.target.value)}
                onFocus={(e) => e.target.select()}
                aria-invalid={errors.amount ? 'true' : undefined}
              />
              {errors.amount && <span className="input-error">{errors.amount}</span>}
            </div>
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

export default FinanceEntryModal;
