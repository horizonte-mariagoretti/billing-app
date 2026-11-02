import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AlertCircle, Edit2, Archive, ArchiveRestore, BookOpen, Package, Lock, Plus } from 'lucide-react';
import { useGluehweinCatalog } from '../hooks/useGluehweinCatalog';
import { useGluehweinIngredients } from '../hooks/useGluehweinIngredients';
import useYear from '../hooks/useYear';
import { scoutYearLabel } from '../utils/scoutYear';
import useTableSort from '../hooks/useTableSort';
import useCurrency from '../hooks/useCurrency';
import useFocusTrap from '../hooks/useFocusTrap';
import { useT } from '../hooks/useUiTranslations';
import SortableTh from './SortableTh';
import ConfirmDialog from './ConfirmDialog';
import DecimalInput from './DecimalInput';
import RecipeEditor from './RecipeEditor';
import UnitPicker from './UnitPicker';
import PlanModePicker from './PlanModePicker';
import { pluralUnit } from '../utils/gwUnits';
import StyledSelect from './StyledSelect';
import { itemEconomics, plannedPortions, recipeCostPerUnit } from '../utils/gluehweinCatalogMath';
import Button from './Button';
import { editableRowProps } from './editableRow';
import './DataTable.css';
import './ClientModal.css'; // shared .modal-overlay / .modal-content / .modal-actions styles
import './SettingsFieldsModal.css'; // shared field grid (.settings-fields-modal-*)
import './GluehweinCatalog.css';

const LOCALE = 'de-DE';

/**
 * One block of the item popup's Konditionen (Verkauf, Einkauf, Eingekauft): title plus its fields in a grid.
 * Each block is self-contained, so a block can be moved or reused without touching the others.
 */
const TermsBlock = ({ title, children }) => (
  <section className="gw-terms-block">
    {title && <h3 className="gw-terms-block-title">{title}</h3>}
    <div className="settings-fields-modal-grid">{children}</div>
  </section>
);

const numOrNull = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const fmtNum = (n) => (n == null ? '' : Number(n).toLocaleString(LOCALE, { maximumFractionDigits: 3 }));
const fmtPct = (p) => (p == null ? null : `${(p * 100).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} %`);
const str = (v) => (v == null ? '' : String(v));
const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
const unitOf = (i) => String(i?.unit || '').trim() || 'Stk';
// Unit the planned quantity is typed in: liters, buying units (bottles) or selling units.
const planLabelOf = (i) => (i?.plan_unit === 'liter'
  ? 'l'
  : i?.plan_unit === 'buy' && String(i?.buy_unit || '').trim() ? String(i.buy_unit).trim() : unitOf(i));

// Shown in the inline fields: comma decimal, no grouping (so the text parses back with numOrNull).
// Dot notation for DecimalInput (it shows the comma itself); decimals fixes the digits, e.g. prices 5.00.
const shownDot = (v, decimals) => {
  if (v == null || v === '') return '';
  return decimals != null ? Number(v).toFixed(decimals) : String(Number(v));
};

/**
 * Add / edit one Sortiment product: the product itself (name, selling unit; not year-bound, always editable)
 * and its terms for the selected scout year (read-only when the year is locked): selling price per selling unit,
 * buying unit + price per buying unit + content (selling units per buying unit), planned quantity in selling units.
 * Products with a recipe are costed through the recipe (recipeCost per selling unit); their own buy fields are
 * ignored and kept as they are. onSave({ item, terms|null }) throws to show the save error.
 */
const ItemModal = ({ item, year, yearLocked, recipeCost, onSave, onCancel, onOpenRecipe, triggerRef }) => {
  const t = useT();
  const formatCurrency = useCurrency();
  const [form, setForm] = useState(() => ({
    name: item?.name || '',
    unit: item?.unit || 'Becher',
    sell_price: str(item?.sell_price),
    buy_unit: item?.buy_unit || '',
    buy_pack_price: str(item?.buy_pack_price),
    pack_size: str(item?.pack_size ?? 1),
    planned_qty: str(item?.planned_qty ?? 0),
    plan_unit: item?.plan_unit || 'portion',
    liters: str(item?.liters_per_portion ?? ''),
    use_recipe: !!item?.use_recipe,
    purchase_qty: str(item?.purchase_qty ?? ''),
    purchase_unit: item?.purchase_unit || '',
    pack_liters: str(item?.pack_liters ?? ''),
  }));
  const withRecipe = form.use_recipe;
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

  const unit = form.unit.trim() || 'Stk';
  const buyUnit = form.buy_unit.trim();
  const buyUnitLabel = buyUnit || t('gw_buy_unit_fallback', 'Einkaufseinheit');
  const planSuffix = form.plan_unit === 'liter' ? 'l' : form.plan_unit === 'buy' ? buyUnitLabel : unit;
  const oldBuyFilled = withRecipe && (item?.buy_pack_price != null || !!item?.buy_unit);

  const packPrice = numOrNull(form.buy_pack_price);
  // Liter products are bought in liters per Einkaufseinheit (e.g. Pack = 6 l); pack_liters is stored, not converted.
  const isLiterPack = form.plan_unit === 'liter';
  const packLiters = numOrNull(form.pack_liters);
  const effContent = isLiterPack ? null : numOrNull(form.pack_size);
  const planModeLabels = {
    portion: `${unit} (${t('gw_plan_portion', 'Verkaufseinheit')})`,
    liter: t('gw_plan_liter', 'Liter (Gesamtmenge)'),
    buy: buyUnit ? `${buyUnit} (${t('gw_plan_buy', 'Einkaufseinheit')})` : t('gw_plan_buy', 'Einkaufseinheit'),
  };
  const portions = plannedPortions({
    planned_qty: numOrNull(form.planned_qty) ?? 0,
    plan_unit: form.plan_unit,
    liters_per_portion: null,
    pack_size: withRecipe ? null : effContent,
  });
  const econ = itemEconomics({
    sell_price: numOrNull(form.sell_price),
    buy_pack_price: withRecipe ? null : packPrice,
    pack_size: withRecipe ? null : effContent,
    planned_qty: portions ?? 0,
    recipeCost: withRecipe ? recipeCost ?? 0 : undefined,
  });
  const totalCost = !withRecipe && econ.packsToBuy != null && packPrice != null ? econ.packsToBuy * packPrice : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!form.name.trim()) next.name = t('gw_err_name', 'Bitte einen Namen eingeben.');
    const content = effContent;
    if (!yearLocked && !withRecipe && packPrice != null) {
      if (isLiterPack && !(packLiters > 0)) {
        next.pack_liters = t('gw_err_pack_liters', 'Bitte Liter pro Einkaufseinheit größer 0 eingeben.');
      } else if (!isLiterPack && (content == null || content <= 0)) {
        next.pack_size = t('gw_err_content', 'Bitte einen Inhalt größer 0 eingeben.');
      }
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    setSaveError(null);
    const base = {
      sell_price: round2(numOrNull(form.sell_price)),
      planned_qty: numOrNull(form.planned_qty) ?? 0,
      purchase_qty: numOrNull(form.purchase_qty),
      purchase_unit: buyUnit || null,
    };
    try {
      await onSave({
        item: {
          ...(item?.id ? { id: item.id, sort_order: item.sort_order, active: item.active } : {}),
          name: form.name.trim(),
          unit,
          plan_unit: form.plan_unit,
          liters_per_portion: null,
          use_recipe: form.use_recipe,
        },
        terms: yearLocked ? null : withRecipe
          ? { ...base, keepBuy: true }
          : {
            ...base,
            buy_unit: buyUnit || null,
            buy_pack_price: round2(packPrice),
            pack_size: content != null && content > 0 ? content : 1,
            pack_liters: isLiterPack ? packLiters : null,
          },
      });
    } catch {
      setSaveError(t('gw_save_error', 'Änderung konnte nicht gespeichert werden.'));
      setSaving(false);
    }
  };

  const yearLabel = `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
  const money = (v) => (v == null ? '–' : formatCurrency(v));

  const buyFields = (disabled) => (
    <>
      <div className="settings-fields-modal-field">
        <label className="input-label" htmlFor="gw-item-buy-unit">{t('gw_col_buy_unit', 'Einkaufseinheit')}</label>
        <UnitPicker
          id="gw-item-buy-unit"
          kind="buy"
          value={form.buy_unit}
          disabled={disabled}
          onChange={(u) => setValue('buy_unit', u)}
        />
      </div>
      <div className="settings-fields-modal-field">
        <label className="input-label" htmlFor="gw-item-buy-price">
          {t('gw_buy_pack_price_per', 'Preis je')} {buyUnitLabel}
        </label>
        <DecimalInput
          id="gw-item-buy-price"
          min="0"
          className="input-field"
          value={form.buy_pack_price}
          placeholder="0,00"
          disabled={disabled}
          onChange={(e) => setValue('buy_pack_price', e.target.value)}
          onFocus={(e) => e.target.select()}
        />
      </div>
      {isLiterPack ? (
        <div className="settings-fields-modal-field wide">
          <label className="input-label" htmlFor="gw-item-pack-liters">{t('gw_pack_liters', 'Liter pro Einkaufseinheit')}</label>
          <div className="settings-fields-modal-input">
            <DecimalInput
              id="gw-item-pack-liters"
              className={`input-field${errors.pack_liters ? ' error' : ''}`}
              value={form.pack_liters}
              placeholder="6"
              disabled={disabled}
              onChange={(e) => setValue('pack_liters', e.target.value)}
              onFocus={(e) => e.target.select()}
              aria-invalid={errors.pack_liters ? 'true' : undefined}
            />
            <span className="settings-fields-modal-suffix">l {t('gw_per', 'pro')} {buyUnitLabel}</span>
          </div>
          {errors.pack_liters && <span className="input-error">{errors.pack_liters}</span>}
          {effContent != null && (
            <span className="settings-fields-modal-hint">
              = {fmtNum(effContent)} {unit} {t('gw_per', 'pro')} {buyUnitLabel}
            </span>
          )}
        </div>
      ) : (
      <div className="settings-fields-modal-field wide">
        <label className="input-label" htmlFor="gw-item-content">{t('gw_col_content', 'Inhalt')}</label>
        <div className="settings-fields-modal-input">
          <DecimalInput
            id="gw-item-content"
            className={`input-field${errors.pack_size ? ' error' : ''}`}
            value={form.pack_size}
            placeholder="1"
            disabled={disabled}
            onChange={(e) => setValue('pack_size', e.target.value)}
            onFocus={(e) => e.target.select()}
            aria-invalid={errors.pack_size ? 'true' : undefined}
          />
          <span className="settings-fields-modal-suffix">{pluralUnit(unit, form.pack_size)} {t('gw_per', 'pro')} {buyUnitLabel}</span>
        </div>
        {errors.pack_size && <span className="input-error">{errors.pack_size}</span>}
      </div>
      )}
    </>
  );

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="gw-item-modal-title">
      <div className="modal-content settings-fields-modal gw-item-modal" ref={modalRef}>
        <h2 id="gw-item-modal-title">
          {item ? t('gw_item_edit', 'Artikel bearbeiten') : t('gw_item_add', 'Artikel hinzufügen')}
        </h2>
        <form onSubmit={handleSubmit} noValidate>
          {saveError && (
            <div className="page-error" role="alert">
              <AlertCircle size={16} />
              <span>{saveError}</span>
            </div>
          )}
          <section className="gw-popup-section">
          <h3 className="gw-popup-section-title">{t('gw_section_sell', 'Verkauf')}</h3>
          <div className="settings-fields-modal-grid">
            <div className="settings-fields-modal-field wide">
              <label className="input-label" htmlFor="gw-item-name">{t('gw_col_name', 'Name')}</label>
              <input
                id="gw-item-name"
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
              <div className="gw-price-unit">
                <div className="gw-price-unit-price">
                  <label className="input-label" htmlFor="gw-item-sell">{t('gw_col_sell', 'Verkaufspreis')}</label>
                  <div className="settings-fields-modal-input">
                    <DecimalInput
                      id="gw-item-sell"
                      min="0"
                      className="input-field"
                      value={form.sell_price}
                      placeholder="0,00"
                      onChange={(e) => setValue('sell_price', e.target.value)}
                      onFocus={(e) => e.target.select()}
                    />
                    <span className="settings-fields-modal-suffix">€ {t('gw_per', 'pro')}</span>
                  </div>
                </div>
                <div className="gw-price-unit-unit">
                  <label className="input-label" htmlFor="gw-item-unit">{t('gw_col_sell_unit', 'Verkaufseinheit')}</label>
                  <UnitPicker
                    id="gw-item-unit"
                    kind="sell"
                    value={form.unit}
                    onChange={(u) => setValue('unit', u)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="gw-item-recipe">
            <div className="gw-item-recipe-text">
              <span className="input-label">{t('gw_recipe_title', 'Rezept')}</span>
              <span className="settings-fields-modal-hint">
                {form.use_recipe
                  ? t('gw_use_recipe_on', 'An: der Bedarf kommt aus den Zutaten des Rezepts.')
                  : t('gw_use_recipe_off', 'Aus: das Produkt wird direkt eingekauft.')}
              </span>
            </div>
            <label className="gw-switch" title={t('gw_use_recipe', 'Rezept verwenden')}>
              <input
                type="checkbox"
                role="switch"
                checked={form.use_recipe}
                disabled={!item}
                onChange={(e) => setValue('use_recipe', e.target.checked)}
                aria-label={t('gw_use_recipe', 'Rezept verwenden')}
              />
              <span className="gw-switch-track" aria-hidden="true" />
            </label>
            {item && (
              <Button variant="secondary" type="button" onClick={() => onOpenRecipe(item)}>
                <BookOpen size={15} /> {(item.recipe?.length || 0)
                  ? `${t('gw_recipe_edit', 'Rezept bearbeiten')} (${item.recipe.length})`
                  : t('gw_recipe_add', 'Rezept anlegen')}
              </Button>
            )}
          </div>

          <fieldset className="gw-item-terms" disabled={yearLocked}>
            <TermsBlock>
            </TermsBlock>
          </fieldset>
          </section>

          <section className="gw-popup-section">
          <h3 className="gw-popup-section-title">
            {t('gw_section_buy', 'Einkauf')}
            {yearLocked && (
              <span className="gw-item-terms-locked"><Lock size={13} /> {t('gw_year_locked', 'Jahr gesperrt')} · {yearLabel}</span>
            )}
          </h3>
          <fieldset className="gw-item-terms" disabled={yearLocked}>
            <TermsBlock>
              {withRecipe ? (
                <div className="settings-fields-modal-field wide">
                  <div className="gw-item-recipe-cost">
                    <span>{t('gw_recipe_cost', 'Kosten laut Rezept')}</span>
                    <strong className="dt-mono">{money(recipeCost ?? 0)} / {unit}</strong>
                  </div>
                  <span className="settings-fields-modal-hint">
                    {t('gw_recipe_cost_hint', 'Berechnet aus den Zutatenpreisen; eingekauft wird über die Einkaufsliste.')}
                  </span>
                </div>
              ) : buyFields(false)}

              {oldBuyFilled && (
                <>
                  <div className="settings-fields-modal-field wide">
                    <span className="settings-fields-modal-hint">
                      {t('gw_old_buy_ignored', 'Frühere Einkaufsangaben: werden ignoriert, solange ein Rezept existiert.')}
                    </span>
                  </div>
                  {buyFields(true)}
                </>
              )}
            </TermsBlock>

            <TermsBlock>
              <div className="settings-fields-modal-field wide">
                <label className="input-label" htmlFor="gw-item-bought">{t('gw_col_bought_form', 'Einkauf')}</label>
                <div className="gw-bought-cell">
                  <DecimalInput
                    id="gw-item-bought"
                    className="input-field"
                    value={form.purchase_qty}
                    placeholder="0"
                    onChange={(e) => setValue('purchase_qty', e.target.value)}
                    onFocus={(e) => e.target.select()}
                  />
                  <span className="settings-fields-modal-suffix">{pluralUnit(buyUnitLabel, form.purchase_qty)}</span>
                </div>
              </div>
            </TermsBlock>

            <div className="gw-item-preview" aria-live="polite">
              <div><span>{t('gw_col_unit_cost', 'Kosten/Einheit')}</span><strong>{money(econ.cost)}</strong></div>
              <div>
                <span>{t('gw_col_margin', 'Marge')}</span>
                <strong className={econ.margin != null && econ.margin < 0 ? 'negative' : undefined}>
                  {money(econ.margin)}{econ.marginPct != null ? ` · ${fmtPct(econ.marginPct)}` : ''}
                </strong>
              </div>
              {!withRecipe && (
                <div>
                  <span>{t('gw_col_to_buy', 'Zu kaufen')}</span>
                  <strong>{econ.packsToBuy == null ? '–' : `${fmtNum(econ.packsToBuy)} ${pluralUnit(buyUnit || unit, econ.packsToBuy)}`}</strong>
                </div>
              )}
              {!withRecipe && (
                <div><span>{t('gw_total_cost', 'Gesamtkosten')}</span><strong>{money(totalCost)}</strong></div>
              )}
              <div><span>{t('gw_col_revenue', 'Umsatz')}</span><strong>{money(econ.revenue)}</strong></div>
              <div>
                <span>{t('gw_col_profit', 'Rohgewinn')}</span>
                <strong className={econ.profit != null && econ.profit < 0 ? 'negative' : undefined}>{money(econ.profit)}</strong>
              </div>
            </div>
          </fieldset>
          </section>

          <fieldset className="gw-item-terms gw-unit-bottom" disabled={yearLocked}>
            <div className="gw-unit-group">
              <div className="settings-fields-modal-field">
                <label className="input-label" htmlFor="gw-item-planned">{t('gw_col_final_sold', 'Final verkauft')}</label>
                <div className="settings-fields-modal-input">
                  <DecimalInput
                    id="gw-item-planned"
                    className="input-field"
                    value={form.planned_qty}
                    placeholder="0"
                    onChange={(e) => setValue('planned_qty', e.target.value)}
                    onFocus={(e) => e.target.select()}
                  />
                  <span className="settings-fields-modal-suffix">{pluralUnit(planSuffix, form.planned_qty)}</span>
                </div>
              </div>
              <div className="settings-fields-modal-field">
                <label className="input-label" htmlFor="gw-item-plan-unit">{t('gw_unit_label', 'Einheit')}</label>
                <PlanModePicker
                  value={form.plan_unit}
                  labels={planModeLabels}
                  onChange={(mode) => setValue('plan_unit', mode)}
                />
              </div>
            </div>
          </fieldset>

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

/**
 * Number field edited in place in the table. Commits on blur or Enter; onCommit(text) resolves true when the value
 * is accepted (or unchanged) and false when it was refused, which resets the field to the stored value.
 */
const InlineField = ({ label, value, decimals, disabled = false, onCommit }) => {
  const shown = () => shownDot(value, decimals);
  const [draft, setDraft] = useState(shown);
  useEffect(() => { setDraft(shown()); }, [value, decimals]);

  return (
    <DecimalInput
      className="gw-inline-input"
      aria-label={label}
      title={label}
      placeholder="–"
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={async () => {
        if (draft === shown()) return;
        const ok = await onCommit(draft);
        if (!ok) setDraft(shown());
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
};


/**
 * Copies the Sortiment terms (prices, Einkaufseinheit, content, optionally planned quantities) of one scout year
 * into the selected year. onCopy(fromYear, withQty) throws to show the error and keep the popup open.
 */
const CopyTermsModal = ({ year, onCopy, onCancel, triggerRef }) => {
  const t = useT();
  const { years } = useYear();
  const sources = years.filter((y) => y.year !== year);
  const [from, setFrom] = useState('');
  const [withQty, setWithQty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const source = from || sources[0]?.year || '';

  const modalRef = useRef(null);
  useFocusTrap(modalRef, { active: true, triggerRef });

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!source) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onCopy(Number(source), withQty);
    } catch (err) {
      setSaveError(err?.message === 'YEAR_LOCKED'
        ? t('gw_err_year_locked', 'Das Jahr ist gesperrt.')
        : t('gw_save_error', 'Änderung konnte nicht gespeichert werden.'));
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="gw-copy-modal-title">
      <div className="modal-content settings-fields-modal gw-copy-modal" ref={modalRef}>
        <h2 id="gw-copy-modal-title">{t('gw_copy_title', 'Sortiment aus Jahr kopieren')}</h2>
        <form onSubmit={handleSubmit} noValidate>
          {saveError && (
            <div className="page-error" role="alert">
              <AlertCircle size={16} />
              <span>{saveError}</span>
            </div>
          )}
          {sources.length === 0 ? (
            <span className="settings-fields-modal-hint">
              {t('gw_copy_no_source', 'Kein anderes Jahr vorhanden.')}
            </span>
          ) : (
            <div className="settings-fields-modal-grid">
              <div className="settings-fields-modal-field wide">
                <label className="input-label" htmlFor="gw-copy-source">{t('gw_copy_from', 'Kopieren von')}</label>
                <StyledSelect value={source} onChange={(e) => setFrom(Number(e.target.value))}>
                  {sources.map((y) => (
                    <option key={y.year} value={y.year}>{scoutYearLabel(y.year)}</option>
                  ))}
                </StyledSelect>
              </div>
              <label className="gw-copy-qty-toggle">
                <input type="checkbox" checked={withQty} onChange={(e) => setWithQty(e.target.checked)} />
                {t('gw_copy_with_qty', 'Geplante Mengen mitkopieren')}
              </label>
              <span className="settings-fields-modal-hint wide">
                {t(
                  'gw_copy_hint',
                  'Verkaufspreis, Einkaufseinheit, Preis und Inhalt werden in das gewählte Jahr übernommen und überschreiben dort vorhandene Werte. Rezepte bleiben unverändert.'
                )}
              </span>
            </div>
          )}
          <div className="modal-actions">
            <Button variant="ghost" type="button" onClick={onCancel}>{t('btn_cancel', 'Abbrechen')}</Button>
            <Button variant="primary" type="submit" disabled={saving || !source}>
              {saving ? t('horis_saving', 'Speichern…') : t('gw_copy_action', 'Kopieren')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

/**
 * Sortiment of a Verkaufsaktion (Glühwein and any other action using the gw_* catalog): only finished, sellable
 * products with their terms for the selected scout year. Ingredients live in the Einkaufsliste (Zutaten).
 * action: SALES_ACTIONS entry (label only; the catalog itself is shared).
 * Products (name/unit/active) are always editable; terms are read-only in a locked year. Recipes are not year-bound.
 * Sold per selling unit (unit), bought per buying unit (buy_unit, content = pack_size); recipe products are costed
 * through their ingredients. search: filters by name.
 * addRequest: { n, triggerRef } from the page header's "Artikel hinzufügen" button; a new n opens the add popup
 * (stays available in a locked year: the product is not year-bound, the terms lock inside the popup).
 */
const GluehweinCatalog = ({ action, year, yearLocked, search = '', onError, addRequest = null }) => {
  const t = useT();
  const { fetchItems, saveItem, deleteItem, saveTerms, copyTerms } = useGluehweinCatalog();
  const { fetchIngredients } = useGluehweinIngredients();
  const [items, setItems] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [loadedYear, setLoadedYear] = useState(null);
  const loading = loadedYear !== year;
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState(null); // null | { item: row | null, triggerRef }
  const [copyOpen, setCopyOpen] = useState(null); // null | { triggerRef }
  const [recipeFor, setRecipeFor] = useState(null); // { product, ingredients }
  const [toDeactivate, setToDeactivate] = useState(null);
  // Unsorted = sort_order, then name (order of fetchItems).
  const { sort, toggleSort, sortRows } = useTableSort({ key: null, dir: null });

  // Header buttons ("Aus Jahr kopieren", "Artikel hinzufügen"): act on a new request, not on the one present when the
  // tab mounts.
  const seenAddRef = useRef(addRequest?.n ?? 0);
  useEffect(() => {
    if (!addRequest || addRequest.n === seenAddRef.current) return;
    seenAddRef.current = addRequest.n;
    if (addRequest.key === 'copy') setCopyOpen({ triggerRef: addRequest.triggerRef || null });
    else setModal({ item: null, triggerRef: addRequest.triggerRef || null });
  }, [addRequest]);

  const report = useCallback((err) => {
    const msg = err?.message === 'YEAR_LOCKED'
      ? t('gw_err_year_locked', 'Das Jahr ist gesperrt.')
      : t('gw_save_error', 'Änderung konnte nicht gespeichert werden.');
    onError?.(msg);
  }, [onError, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, ings] = await Promise.all([fetchItems(year), fetchIngredients(year)]);
        if (!cancelled) {
          setItems(list || []);
          setIngredients(ings || []);
        }
      } catch {
        if (!cancelled) onError?.(t('gw_load_error_sortiment', 'Sortiment konnte nicht geladen werden.'));
      } finally {
        if (!cancelled) setLoadedYear(year);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const reload = useCallback(async () => {
    const [list, ings] = await Promise.all([fetchItems(year), fetchIngredients(year)]);
    setItems(list || []);
    setIngredients(ings || []);
  }, [fetchItems, fetchIngredients, year]);

  // Recipe products: their cost per selling unit (shown in the popup only).
  const rows = useMemo(() => items.map((i) => ({
    ...i,
    recipeCost: i.use_recipe ? recipeCostPerUnit(i.recipe, ingredients) : null,
  })), [items, ingredients]);

  const inactiveCount = items.filter((i) => !i.active).length;
  const q = search.trim().toLowerCase();
  const visible = useMemo(() => rows.filter((i) => (
    (showInactive || i.active) && (!q || String(i.name).toLowerCase().includes(q))
  )), [rows, showInactive, q]);

  const sorted = useMemo(() => sortRows(visible, {
    name: (i) => String(i.name).toLowerCase(),
    sell_price: (i) => i.sell_price ?? null,
    planned_qty: (i) => Number(i.planned_qty) || 0,
  }, { tieBreak: (i) => i.name, locale: LOCALE }), [visible, sortRows]);

  // Throws on failure so the popup shows its save error and stays open.
  const handleSave = async ({ item, terms }) => {
    const id = await saveItem(item);
    if (terms && !yearLocked) await saveTerms(year, id || item.id, terms);
    await reload();
    setModal(null);
  };

  const handleCopy = async (fromYear, withQty) => {
    await copyTerms(fromYear, year, { withQty });
    setCopyOpen(null);
    await reload();
  };

  // One inline edit of a row: whole terms are rewritten, the other fields keep their stored values.
  // Returns false when the value is refused (the field then shows the stored value again).
  const commitField = async (row, field, text) => {
    const trimmed = String(text).trim();
    const parsed = trimmed === '' ? null : numOrNull(trimmed);
    const invalid = parsed === null ? (trimmed !== '' || field === 'pack_size') : parsed < 0 || (field === 'pack_size' && parsed === 0);
    if (invalid) {
      onError?.(t('gw_err_number', 'Bitte eine gültige Zahl eingeben.'));
      return false;
    }
    const value = field === 'planned_qty'
      ? parsed ?? 0
      : field === 'pack_size' ? parsed : round2(parsed);
    const current = row[field] == null ? null : Number(row[field]);
    if (value === (field === 'planned_qty' ? current ?? 0 : current)) return true;
    return saveRowTerms(row, { [field]: value });
  };

  // Writes the whole terms of one row; patch overrides single fields, the others keep their stored values.
  const saveRowTerms = async (row, patch) => {
    const terms = {
      sell_price: row.sell_price,
      planned_qty: row.planned_qty,
      buy_unit: row.buy_unit,
      buy_pack_price: row.buy_pack_price,
      pack_size: row.pack_size,
      purchase_qty: row.purchase_qty,
      purchase_unit: row.purchase_unit,
      pack_liters: row.pack_liters,
      ...patch,
    };
    if (row.use_recipe) terms.keepBuy = true;
    try {
      await saveTerms(year, row.id, terms);
      await reload();
      return true;
    } catch (err) {
      report(err);
      return false;
    }
  };

  // Eingekauft: total bought in the unit picked with the toggle. Returns false when refused.
  const commitPurchase = async (row, text) => {
    const trimmed = String(text).trim();
    const parsed = trimmed === '' ? null : numOrNull(trimmed);
    if ((trimmed !== '' && parsed === null) || (parsed !== null && parsed < 0)) {
      onError?.(t('gw_err_number', 'Bitte eine gültige Zahl eingeben.'));
      return false;
    }
    const current = row.purchase_qty == null ? null : Number(row.purchase_qty);
    if (parsed === current) return true;
    return saveRowTerms(row, { purchase_qty: round2(parsed) });
  };


  const confirmDeactivate = async () => {
    const id = toDeactivate.id;
    setToDeactivate(null);
    try {
      await deleteItem(id);
      await reload();
    } catch (err) {
      report(err);
    }
  };

  const reactivate = async (item) => {
    try {
      await saveItem({ id: item.id, name: item.name, unit: item.unit, sort_order: item.sort_order, active: 1 });
      await reload();
    } catch (err) {
      report(err);
    }
  };

  const openRecipe = async (product) => {
    try {
      const ings = await fetchIngredients(year);
      setRecipeFor({ product, ingredients: ings || [] });
    } catch (err) {
      report(err);
    }
  };

  const handleRecipeSaved = async () => {
    setRecipeFor(null);
    try {
      await reload();
    } catch (err) {
      report(err);
    }
  };

  const sortTh = (key, label, align = 'left') => (
    <SortableTh column={key} label={label} align={align} sort={sort} onSort={toggleSort} />
  );

  const muted = (text) => <span className="dt-muted">{text}</span>;

  return (
    <div className="gw-catalog">
      {(yearLocked || inactiveCount > 0) && (
      <div className="gw-catalog-toolbar">
        <div className="gw-catalog-toolbar-left">
          {yearLocked && (
            <span className="gw-catalog-locked">
              <Lock size={14} /> {t('gw_terms_locked', 'Jahr gesperrt: Preise und Bedarf sind schreibgeschützt.')}
            </span>
          )}
          {inactiveCount > 0 && (
            <label className="gw-catalog-inactive-toggle">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              {t('gw_show_inactive', 'Inaktive anzeigen')} ({inactiveCount})
            </label>
          )}
        </div>
      </div>
      )}

      <div className="data-table-container">
        {loading || visible.length === 0 ? (
          <div className="gw-catalog-empty">
            <Package size={36} strokeWidth={1.4} />
            <div className="gw-catalog-empty-title">
              {loading
                ? t('loading', 'Laden…')
                : items.length > 0 && q
                  ? `${t('gw_no_match', 'Keine Artikel gefunden für')} "${search.trim()}"`
                  : `${t('gw_empty_sortiment', 'Noch keine Artikel im Sortiment')}${action?.label ? ` (${action.label})` : ''}`}
            </div>
            {!loading && q && items.length > 0 && (
              <div className="gw-catalog-empty-desc">{t('try_different_search', 'Versuche einen anderen Suchbegriff.')}</div>
            )}
          </div>
        ) : (
          <table className="data-table gw-catalog-table" aria-label={`${t('gw_sortiment', 'Sortiment')}${action?.label ? ` ${action.label}` : ''}`}>
            <colgroup>
              <col />
              <col className="gw-col-sell" />
              <col className="gw-col-buy" />
              <col className="gw-col-planned" />
              <col className="gw-col-actions" />
            </colgroup>
            <thead>
              <tr>
                {sortTh('name', t('gw_col_name', 'Name'))}
                {sortTh('sell_price', t('gw_col_sell', 'Verkaufspreis'))}
                <th>{t('gw_col_bought_form', 'Einkauf')}</th>
                {sortTh('planned_qty', t('gw_col_sold', 'Verkauft'))}
                <th aria-label={t('actions', 'Aktionen')} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((i) => {
                const unit = unitOf(i);
                return (
                  <tr
                    key={i.id}
                    {...editableRowProps(
                      () => setModal({ item: i, triggerRef: null }),
                      `${t('btn_edit', 'Bearbeiten')}: ${i.name}`,
                      i.active ? undefined : 'gw-row-inactive',
                    )}
                  >
                    <td className="gw-name-cell">{i.name}</td>
                    <td className="dt-mono gw-price-cell">
                      <InlineField
                        label={`${t('gw_col_sell', 'Verkaufspreis')}: ${i.name}`}
                        value={i.sell_price}
                        decimals={2}
                        disabled={yearLocked}
                        onCommit={(text) => commitField(i, 'sell_price', text)}
                      />
                      <span className="dt-muted gw-unit-suffix"> €</span>
                    </td>
                    <td className="dt-mono gw-buy-cell-td">
                      <div className="gw-bought-cell">
                        <InlineField
                          label={`${t('gw_col_bought', 'Eingekauft')}: ${i.name}`}
                          value={i.purchase_qty}
                          disabled={yearLocked}
                          onCommit={(text) => commitPurchase(i, text)}
                        />
                        <span className="gw-unit-label">{i.buy_unit ? pluralUnit(i.buy_unit, i.purchase_qty) : "–"}</span>
                      </div>
                    </td>
                    <td className="dt-mono gw-sold-cell">
                      <InlineField
                        label={`${t('gw_col_sold', 'Verkauft')}: ${i.name}`}
                        value={i.planned_qty}
                        disabled={yearLocked}
                        onCommit={(text) => commitField(i, 'planned_qty', text)}
                      />
                      <span className="dt-muted"> {pluralUnit(planLabelOf(i), i.planned_qty)}</span>
                    </td>
                    <td className="gw-row-actions">
                      <button
                        type="button"
                        onClick={() => setModal({ item: i, triggerRef: null })}
                        title={t('btn_edit', 'Bearbeiten')}
                        aria-label={`${t('btn_edit', 'Bearbeiten')}: ${i.name}`}
                      >
                        <Edit2 size={16} />
                      </button>
                      {i.active ? (
                        <button
                          type="button"
                          onClick={() => setToDeactivate(i)}
                          title={t('gw_deactivate', 'Deaktivieren')}
                          aria-label={`${t('gw_deactivate', 'Deaktivieren')}: ${i.name}`}
                        >
                          <Archive size={16} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => reactivate(i)}
                          title={t('gw_reactivate', 'Reaktivieren')}
                          aria-label={`${t('gw_reactivate', 'Reaktivieren')}: ${i.name}`}
                        >
                          <ArchiveRestore size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {copyOpen && (
        <CopyTermsModal
          year={year}
          onCopy={handleCopy}
          onCancel={() => setCopyOpen(null)}
          triggerRef={copyOpen.triggerRef}
        />
      )}

      {modal && (
        <ItemModal
          item={modal.item}
          year={year}
          yearLocked={yearLocked}
          recipeCost={modal.item ? rows.find((r) => r.id === modal.item.id)?.recipeCost ?? null : null}
          onSave={handleSave}
          onCancel={() => setModal(null)}
          onOpenRecipe={(row) => { setModal(null); openRecipe(row); }}
          triggerRef={modal.triggerRef}
        />
      )}

      {recipeFor && (
        <RecipeEditor
          product={recipeFor.product}
          ingredients={recipeFor.ingredients}
          onClose={() => setRecipeFor(null)}
          onSaved={handleRecipeSaved}
        />
      )}

      {toDeactivate && (
        <ConfirmDialog
          title={t('gw_deactivate_title', 'Artikel deaktivieren?')}
          message={`${toDeactivate.name}: ${t('gw_deactivate_msg', 'Der Artikel wird ausgeblendet und kann später wieder aktiviert werden.')}`}
          confirmLabel={t('gw_deactivate', 'Deaktivieren')}
          onConfirm={confirmDeactivate}
          onCancel={() => setToDeactivate(null)}
        />
      )}
    </div>
  );
};

export default GluehweinCatalog;
