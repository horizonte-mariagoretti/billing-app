import { useState, useEffect, useRef } from 'react';
import { AlertCircle, Lock, Archive, ArchiveRestore } from 'lucide-react';
import useFocusTrap from '../hooks/useFocusTrap';
import { useT } from '../hooks/useUiTranslations';
import Button from './Button';
import DecimalInput from './DecimalInput';
import ConfirmDialog from './ConfirmDialog';
import './ClientModal.css'; // shared .modal-overlay / .modal-content / .modal-actions styles
import './SettingsFieldsModal.css'; // shared field grid (.settings-fields-modal-*)
import './GluehweinIngredientModal.css';

const INGREDIENT_PACK_TYPES = [
  { value: 'none', label: '–' },
  { value: 'kasten', label: 'Kasten' },
  { value: 'flasche', label: 'Flasche' },
  { value: 'paket', label: 'Paket' },
];

const numOrNull = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const str = (v) => (v == null ? '' : String(v));

/**
 * Add / edit one Glühwein ingredient (Einkaufsliste > Zutaten): the ingredient itself (name, unit; not year-bound,
 * always editable) and its terms for the selected scout year (price per unit, pack, Zusatzbedarf, Bestand;
 * read-only when the year is locked).
 * ingredient: row from useGluehweinIngredients().fetchIngredients, or null for a new one.
 * onSave({ ingredient, terms|null }) throws to show the save error.
 * onDeactivate(): async soft delete (throws INGREDIENT_IN_USE while a recipe uses it). onReactivate(): async.
 */
const GluehweinIngredientModal = ({
  ingredient, year, yearLocked, onSave, onDeactivate, onReactivate, onCancel, triggerRef,
}) => {
  const t = useT();
  const [form, setForm] = useState(() => ({
    name: ingredient?.name || '',
    unit: ingredient?.unit || 'Stk',
    buy_price: str(ingredient?.buy_price),
    pack_type: ingredient?.pack_type || 'none',
    pack_size: str(ingredient?.pack_size ?? 1),
    extra_qty: str(ingredient?.extra_qty ?? 0),
    stock_qty: str(ingredient?.stock_qty ?? 0),
  }));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const modalRef = useRef(null);
  useFocusTrap(modalRef, { active: !confirming, triggerRef });

  useEffect(() => {
    if (confirming) return undefined; // the ConfirmDialog handles Escape itself
    const handleKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel, confirming]);

  const setValue = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const errorText = (err) => (err?.message === 'INGREDIENT_IN_USE'
    ? t('gw_err_ingredient_in_use', 'Diese Zutat wird in einem Rezept verwendet und kann nicht deaktiviert werden.')
    : err?.message === 'YEAR_LOCKED'
      ? t('gw_err_year_locked', 'Das Jahr ist gesperrt.')
      : t('gw_save_error', 'Änderung konnte nicht gespeichert werden.'));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!form.name.trim()) next.name = t('gw_err_name', 'Bitte einen Namen eingeben.');
    const packSize = numOrNull(form.pack_size);
    if (!yearLocked && form.pack_type !== 'none' && (packSize == null || packSize <= 0)) {
      next.pack_size = t('gw_err_pack_size', 'Bitte eine Packungsgröße größer 0 eingeben.');
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    setSaveError(null);
    const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
    try {
      await onSave({
        ingredient: {
          ...(ingredient?.id ? { id: ingredient.id } : {}),
          name: form.name.trim(),
          unit: form.unit.trim() || 'Stk',
        },
        terms: yearLocked ? null : {
          buy_price: round2(numOrNull(form.buy_price)),
          pack_type: form.pack_type,
          pack_size: form.pack_type === 'none' ? 1 : packSize,
          extra_qty: Math.max(0, numOrNull(form.extra_qty) ?? 0),
          stock_qty: Math.max(0, numOrNull(form.stock_qty) ?? 0),
        },
      });
    } catch (err) {
      setSaveError(errorText(err));
      setSaving(false);
    }
  };

  const runStatus = async (fn) => {
    setConfirming(false);
    setSaving(true);
    setSaveError(null);
    try {
      await fn();
    } catch (err) {
      setSaveError(errorText(err));
      setSaving(false);
    }
  };

  const yearLabel = `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
  const unitLabel = form.unit.trim() || 'Stk';

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="gw-ing-modal-title">
      <div className="modal-content settings-fields-modal" ref={modalRef}>
        <h2 id="gw-ing-modal-title">
          {ingredient ? t('gw_ing_edit', 'Zutat bearbeiten') : t('gw_ing_add', 'Zutat hinzufügen')}
        </h2>
        <form onSubmit={handleSubmit} noValidate>
          {saveError && (
            <div className="page-error" role="alert">
              <AlertCircle size={16} />
              <span>{saveError}</span>
            </div>
          )}
          <div className="settings-fields-modal-grid">
            <div className="settings-fields-modal-field wide">
              <label className="input-label" htmlFor="gw-ing-name">{t('gw_col_name', 'Name')}</label>
              <input
                id="gw-ing-name"
                type="text"
                className={`input-field${errors.name ? ' error' : ''}`}
                value={form.name}
                maxLength={80}
                autoFocus
                onChange={(e) => setValue('name', e.target.value)}
                aria-invalid={errors.name ? 'true' : undefined}
              />
              {errors.name && <span className="input-error">{errors.name}</span>}
            </div>
            <div className="settings-fields-modal-field wide">
              <label className="input-label" htmlFor="gw-ing-unit">{t('gw_col_unit', 'Einheit')}</label>
              <input
                id="gw-ing-unit"
                type="text"
                className="input-field"
                value={form.unit}
                maxLength={20}
                placeholder="Stk"
                onChange={(e) => setValue('unit', e.target.value)}
              />
            </div>
          </div>

          <div className="gw-ing-terms-head">
            <span>{t('gw_terms_for', 'Konditionen')} {yearLabel}</span>
            {yearLocked && (
              <span className="gw-ing-terms-locked"><Lock size={13} /> {t('gw_year_locked', 'Jahr gesperrt')}</span>
            )}
          </div>
          <fieldset className="gw-ing-terms" disabled={yearLocked}>
            <div className="settings-fields-modal-grid">
              <div className="settings-fields-modal-field wide">
                <label className="input-label" htmlFor="gw-ing-buy">{t('gw_col_buy', 'Einkaufspreis')}</label>
                <DecimalInput
                  id="gw-ing-buy"
                  min="0"
                  className="input-field"
                  value={form.buy_price}
                  placeholder="0,00"
                  onChange={(e) => setValue('buy_price', e.target.value)}
                  onFocus={(e) => e.target.select()}
                />
                <span className="settings-fields-modal-hint">{t('gw_buy_hint', 'Pro Einheit')}</span>
              </div>
              <div className="settings-fields-modal-field">
                <label className="input-label" htmlFor="gw-ing-pack">{t('gw_col_pack_type', 'Packungsart')}</label>
                <select
                  id="gw-ing-pack"
                  className="input-field"
                  value={form.pack_type}
                  onChange={(e) => setValue('pack_type', e.target.value)}
                >
                  {INGREDIENT_PACK_TYPES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.value === 'none' ? t('gw_pack_none_option', 'Keins') : t(`gw_pack_${p.value}`, p.label)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="settings-fields-modal-field">
                <label className="input-label" htmlFor="gw-ing-pack-size">{t('gw_col_pack_size', 'Packungsgröße')}</label>
                <div className="settings-fields-modal-input">
                  <DecimalInput
                    id="gw-ing-pack-size"
                    min="0"
                    className={`input-field${errors.pack_size ? ' error' : ''}`}
                    value={form.pack_type === 'none' ? '1' : form.pack_size}
                    disabled={yearLocked || form.pack_type === 'none'}
                    onChange={(e) => setValue('pack_size', e.target.value)}
                    onFocus={(e) => e.target.select()}
                    aria-invalid={errors.pack_size ? 'true' : undefined}
                  />
                  <span className="settings-fields-modal-suffix">{unitLabel}</span>
                </div>
                {errors.pack_size && <span className="input-error">{errors.pack_size}</span>}
              </div>
              <div className="settings-fields-modal-field">
                <label className="input-label" htmlFor="gw-ing-extra">{t('gw_col_extra_qty', 'Zusatzbedarf')}</label>
                <div className="settings-fields-modal-input">
                  <DecimalInput
                    id="gw-ing-extra"
                    min="0"
                    className="input-field"
                    value={form.extra_qty}
                    placeholder="0"
                    onChange={(e) => setValue('extra_qty', e.target.value)}
                    onFocus={(e) => e.target.select()}
                  />
                  <span className="settings-fields-modal-suffix">{unitLabel}</span>
                </div>
                <span className="settings-fields-modal-hint">{t('gw_extra_hint', 'Zusätzlich zum Bedarf aus den Rezepten.')}</span>
              </div>
              <div className="settings-fields-modal-field">
                <label className="input-label" htmlFor="gw-ing-stock">{t('gw_col_stock', 'Bestand')}</label>
                <div className="settings-fields-modal-input">
                  <DecimalInput
                    id="gw-ing-stock"
                    min="0"
                    className="input-field"
                    value={form.stock_qty}
                    placeholder="0"
                    onChange={(e) => setValue('stock_qty', e.target.value)}
                    onFocus={(e) => e.target.select()}
                  />
                  <span className="settings-fields-modal-suffix">{unitLabel}</span>
                </div>
                <span className="settings-fields-modal-hint">{t('gw_stock_hint', 'Schon vorhanden, wird abgezogen.')}</span>
              </div>
            </div>
          </fieldset>

          <div className="modal-actions gw-ing-actions">
            {ingredient && (ingredient.active ? (
              <Button variant="ghost" type="button" icon={Archive} className="gw-ing-deactivate" disabled={saving} onClick={() => setConfirming(true)}>
                {t('gw_deactivate', 'Deaktivieren')}
              </Button>
            ) : (
              <Button variant="ghost" type="button" icon={ArchiveRestore} className="gw-ing-deactivate" disabled={saving} onClick={() => runStatus(onReactivate)}>
                {t('gw_reactivate', 'Reaktivieren')}
              </Button>
            ))}
            <Button variant="ghost" type="button" onClick={onCancel}>{t('btn_cancel', 'Abbrechen')}</Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? t('horis_saving', 'Speichern…') : t('btn_save', 'Speichern')}
            </Button>
          </div>
        </form>
      </div>

      {confirming && (
        <ConfirmDialog
          title={t('gw_ing_deactivate_title', 'Zutat deaktivieren?')}
          message={`${ingredient.name}: ${t('gw_ing_deactivate_msg', 'Die Zutat wird ausgeblendet und kann später wieder aktiviert werden.')}`}
          confirmLabel={t('gw_deactivate', 'Deaktivieren')}
          onConfirm={() => runStatus(onDeactivate)}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
};

export default GluehweinIngredientModal;
