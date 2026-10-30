import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AlertCircle, Edit2, Archive, ArchiveRestore, BookOpen, Package, Lock } from 'lucide-react';
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
import { itemEconomics, recipeCostPerUnit } from '../utils/gluehweinCatalogMath';
import Button from './Button';
import './DataTable.css';
import './ClientModal.css'; // shared .modal-overlay / .modal-content / .modal-actions styles
import './SettingsFieldsModal.css'; // shared field grid (.settings-fields-modal-*)
import './GluehweinCatalog.css';

const LOCALE = 'de-DE';

// Suggestions for the free-text units (datalist).
const SELL_UNITS = ['Glas', 'Becher', 'Flasche', 'Shot', 'Stk'];
const BUY_UNITS = ['Flasche', 'Kasten', 'Paket', 'Fass', 'Kiste'];

const numOrNull = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const fmtNum = (n) => (n == null ? '' : Number(n).toLocaleString(LOCALE, { maximumFractionDigits: 3 }));
const fmtPct = (p) => (p == null ? null : `${(p * 100).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} %`);
const str = (v) => (v == null ? '' : String(v));
const digits = (v) => String(v).replace(/\D/g, '');
const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
const hasRecipe = (i) => (i?.recipe?.length || 0) > 0;
const unitOf = (i) => String(i?.unit || '').trim() || 'Stk';
// Shown in the inline fields: comma decimal, no grouping (so the text parses back with numOrNull).
const shownNum = (v) => (v == null || v === '' ? '' : Number(v).toLocaleString(LOCALE, { useGrouping: false, maximumFractionDigits: 4 }));

/** Migrated multi-pack without content: buying unit differs from the selling unit but content is still 1. */
const contentMissing = (i) => (
  !hasRecipe(i)
  && i.buy_pack_price != null
  && Number(i.pack_size) === 1
  && !!String(i.buy_unit || '').trim()
  && String(i.buy_unit).trim().toLowerCase() !== unitOf(i).toLowerCase()
);

/**
 * Add / edit one Sortiment product: the product itself (name, selling unit; not year-bound, always editable)
 * and its terms for the selected scout year (read-only when the year is locked): selling price per selling unit,
 * buying unit + price per buying unit + content (selling units per buying unit), planned quantity in selling units.
 * Products with a recipe are costed through the recipe (recipeCost per selling unit); their own buy fields are
 * ignored and kept as they are. onSave({ item, terms|null }) throws to show the save error.
 */
const ItemModal = ({ item, year, yearLocked, recipeCost, onSave, onCancel, triggerRef }) => {
  const t = useT();
  const formatCurrency = useCurrency();
  const withRecipe = hasRecipe(item);
  const [form, setForm] = useState(() => ({
    name: item?.name || '',
    unit: item?.unit || 'Becher',
    sell_price: str(item?.sell_price),
    buy_unit: item?.buy_unit || '',
    buy_pack_price: str(item?.buy_pack_price),
    pack_size: str(item?.pack_size ?? 1),
    planned_qty: str(item?.planned_qty ?? 0),
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

  const unit = form.unit.trim() || 'Stk';
  const buyUnit = form.buy_unit.trim();
  const buyUnitLabel = buyUnit || t('gw_buy_unit_fallback', 'Einkaufseinheit');
  const oldBuyFilled = withRecipe && (item?.buy_pack_price != null || !!item?.buy_unit);

  const packPrice = numOrNull(form.buy_pack_price);
  const econ = itemEconomics({
    sell_price: numOrNull(form.sell_price),
    buy_pack_price: withRecipe ? null : packPrice,
    pack_size: withRecipe ? null : numOrNull(form.pack_size),
    planned_qty: numOrNull(form.planned_qty) ?? 0,
    recipeCost: withRecipe ? recipeCost ?? 0 : undefined,
  });
  const totalCost = !withRecipe && econ.packsToBuy != null && packPrice != null ? econ.packsToBuy * packPrice : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!form.name.trim()) next.name = t('gw_err_name', 'Bitte einen Namen eingeben.');
    const content = numOrNull(form.pack_size);
    if (!yearLocked && !withRecipe && packPrice != null && (content == null || content <= 0)) {
      next.pack_size = t('gw_err_content', 'Bitte einen Inhalt größer 0 eingeben.');
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    setSaveError(null);
    const base = {
      sell_price: round2(numOrNull(form.sell_price)),
      planned_qty: numOrNull(form.planned_qty) ?? 0,
    };
    try {
      await onSave({
        item: {
          ...(item?.id ? { id: item.id, sort_order: item.sort_order, active: item.active } : {}),
          name: form.name.trim(),
          unit,
        },
        terms: yearLocked ? null : withRecipe
          ? { ...base, keepBuy: true }
          : {
            ...base,
            buy_unit: buyUnit || null,
            buy_pack_price: round2(packPrice),
            pack_size: content != null && content > 0 ? content : 1,
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
        <input
          id="gw-item-buy-unit"
          type="text"
          list="gw-buy-units"
          className="input-field"
          value={form.buy_unit}
          maxLength={20}
          placeholder="Kasten"
          disabled={disabled}
          onChange={(e) => setValue('buy_unit', e.target.value)}
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
      <div className="settings-fields-modal-field wide">
        <label className="input-label" htmlFor="gw-item-content">{t('gw_col_content', 'Inhalt')}</label>
        <div className="settings-fields-modal-input">
          <input
            id="gw-item-content"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className={`input-field${errors.pack_size ? ' error' : ''}`}
            value={form.pack_size}
            placeholder="1"
            disabled={disabled}
            onChange={(e) => setValue('pack_size', digits(e.target.value))}
            onFocus={(e) => e.target.select()}
            aria-invalid={errors.pack_size ? 'true' : undefined}
          />
          <span className="settings-fields-modal-suffix">{unit} {t('gw_per', 'pro')} {buyUnitLabel}</span>
        </div>
        {errors.pack_size && <span className="input-error">{errors.pack_size}</span>}
      </div>
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
          <datalist id="gw-sell-units">{SELL_UNITS.map((u) => <option key={u} value={u} />)}</datalist>
          <datalist id="gw-buy-units">{BUY_UNITS.map((u) => <option key={u} value={u} />)}</datalist>
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
              <label className="input-label" htmlFor="gw-item-unit">{t('gw_col_sell_unit', 'Verkaufseinheit')}</label>
              <input
                id="gw-item-unit"
                type="text"
                list="gw-sell-units"
                className="input-field"
                value={form.unit}
                maxLength={20}
                placeholder="Becher"
                onChange={(e) => setValue('unit', e.target.value)}
              />
              <span className="settings-fields-modal-hint">
                {t('gw_sell_unit_hint', 'So wird verkauft, z. B. Glas, Becher oder Flasche.')}
              </span>
            </div>
          </div>

          <div className="gw-item-terms-head">
            <span>{t('gw_terms_for', 'Konditionen')} {yearLabel}</span>
            {yearLocked && (
              <span className="gw-item-terms-locked"><Lock size={13} /> {t('gw_year_locked', 'Jahr gesperrt')}</span>
            )}
          </div>
          <fieldset className="gw-item-terms" disabled={yearLocked}>
            <div className="settings-fields-modal-grid">
              <div className="settings-fields-modal-field">
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
                  <span className="settings-fields-modal-suffix">€ {t('gw_per', 'pro')} {unit}</span>
                </div>
              </div>
              <div className="settings-fields-modal-field">
                <label className="input-label" htmlFor="gw-item-planned">{t('gw_col_planned_qty', 'Geplant')}</label>
                <div className="settings-fields-modal-input">
                  <input
                    id="gw-item-planned"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    className="input-field"
                    value={form.planned_qty}
                    placeholder="0"
                    onChange={(e) => setValue('planned_qty', digits(e.target.value))}
                    onFocus={(e) => e.target.select()}
                  />
                  <span className="settings-fields-modal-suffix">{unit}</span>
                </div>
              </div>

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
            </div>

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
                  <strong>{econ.packsToBuy == null ? '–' : `${fmtNum(econ.packsToBuy)} ${buyUnit || unit}`}</strong>
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
const InlineField = ({ label, value, disabled = false, digitsOnly = false, onCommit }) => {
  const [draft, setDraft] = useState(() => shownNum(value));
  useEffect(() => { setDraft(shownNum(value)); }, [value]);

  return (
    <input
      type="text"
      inputMode={digitsOnly ? 'numeric' : 'decimal'}
      autoComplete="off"
      className="gw-inline-input"
      aria-label={label}
      title={label}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(digitsOnly ? digits(e.target.value) : e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={async () => {
        if (draft === shownNum(value)) return;
        const ok = await onCommit(draft);
        if (!ok) setDraft(shownNum(value));
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
                <select
                  id="gw-copy-source"
                  className="input-field"
                  value={source}
                  onChange={(e) => setFrom(Number(e.target.value))}
                >
                  {sources.map((y) => (
                    <option key={y.year} value={y.year}>{scoutYearLabel(y.year)}</option>
                  ))}
                </select>
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
  const formatCurrency = useCurrency();
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

  // Per product: economics for the selected year (recipe products costed through their ingredients).
  const rows = useMemo(() => items.map((i) => {
    const recipeCost = hasRecipe(i) ? recipeCostPerUnit(i.recipe, ingredients) : null;
    const econ = itemEconomics({
      sell_price: i.sell_price,
      buy_pack_price: i.buy_pack_price,
      pack_size: i.pack_size,
      planned_qty: i.planned_qty,
      recipeCost: hasRecipe(i) ? recipeCost ?? 0 : undefined,
    });
    return { ...i, recipeCost, econ };
  }), [items, ingredients]);

  const inactiveCount = items.filter((i) => !i.active).length;
  const q = search.trim().toLowerCase();
  const visible = useMemo(() => rows.filter((i) => (
    (showInactive || i.active) && (!q || String(i.name).toLowerCase().includes(q))
  )), [rows, showInactive, q]);

  const sorted = useMemo(() => sortRows(visible, {
    name: (i) => String(i.name).toLowerCase(),
    sell_price: (i) => i.sell_price ?? null,
    buy: (i) => (hasRecipe(i) || !i.buy_unit
      ? null
      : `${String(i.buy_unit).toLowerCase()} ${String(Math.round((Number(i.buy_pack_price) || 0) * 100)).padStart(10, '0')}`),
    cost: (i) => i.econ.cost,
    margin: (i) => i.econ.margin,
    margin_pct: (i) => i.econ.marginPct,
    planned_qty: (i) => Number(i.planned_qty) || 0,
    packs: (i) => i.econ.packsToBuy,
    revenue: (i) => i.econ.revenue,
    profit: (i) => i.econ.profit,
    recipe: (i) => i.recipe?.length || 0,
    status: (i) => (i.active ? 0 : 1),
  }, { tieBreak: (i) => i.name, locale: LOCALE }), [visible, sortRows]);

  // Totals of the visible active products; missing values are skipped.
  const totals = useMemo(() => {
    const active = visible.filter((i) => i.active);
    const sum = (key) => {
      const vals = active.map((i) => i.econ[key]).filter((v) => v != null);
      return vals.length ? vals.reduce((s, v) => s + v, 0) : null;
    };
    return { revenue: sum('revenue'), profit: sum('profit') };
  }, [visible]);

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
    const terms = {
      sell_price: row.sell_price,
      planned_qty: row.planned_qty,
      buy_unit: row.buy_unit,
      buy_pack_price: row.buy_pack_price,
      pack_size: row.pack_size,
      [field]: value,
    };
    if (hasRecipe(row)) terms.keepBuy = true;
    try {
      await saveTerms(year, row.id, terms);
      await reload();
      return true;
    } catch (err) {
      report(err);
      return false;
    }
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
  const money = (v, signed = false) => (v == null
    ? muted('–')
    : <span className={signed && v < 0 ? 'negative' : undefined}>{formatCurrency(Number(v))}</span>);

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
              <col className="gw-col-money" />
              <col className="gw-col-money" />
              <col className="gw-col-pct" />
              <col className="gw-col-planned" />
              <col className="gw-col-packs" />
              <col className="gw-col-money" />
              <col className="gw-col-money" />
              <col className="gw-col-recipe" />
              <col className="gw-col-status" />
              <col className="gw-col-actions" />
            </colgroup>
            <thead>
              <tr>
                {sortTh('name', t('gw_col_name', 'Name'))}
                {sortTh('sell_price', t('gw_col_sell', 'Verkaufspreis'), 'right')}
                {sortTh('buy', t('gw_col_buy_short', 'Einkauf'))}
                {sortTh('cost', t('gw_col_unit_cost', 'Kosten/Einheit'), 'right')}
                {sortTh('margin', t('gw_col_margin_eur', 'Marge €'), 'right')}
                {sortTh('margin_pct', t('gw_col_margin_pct', 'Marge %'), 'right')}
                {sortTh('planned_qty', t('gw_col_planned_qty', 'Geplant'))}
                {sortTh('packs', t('gw_col_to_buy', 'Zu kaufen'))}
                {sortTh('revenue', t('gw_col_revenue', 'Umsatz'), 'right')}
                {sortTh('profit', t('gw_col_profit', 'Rohgewinn'), 'right')}
                {sortTh('recipe', t('gw_recipe_title', 'Rezept'))}
                {sortTh('status', t('gw_col_status', 'Status'))}
                <th aria-label={t('actions', 'Aktionen')} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((i) => {
                const recipeCount = i.recipe?.length || 0;
                const unit = unitOf(i);
                const { econ } = i;
                return (
                  <tr key={i.id} className={i.active ? undefined : 'gw-row-inactive'}>
                    <td className="gw-name-cell">{i.name}</td>
                    <td className="num dt-mono">
                      <InlineField
                        label={`${t('gw_col_sell', 'Verkaufspreis')}: ${i.name}`}
                        value={i.sell_price}
                        disabled={yearLocked}
                        onCommit={(text) => commitField(i, 'sell_price', text)}
                      />
                      <span className="dt-muted gw-unit-suffix"> / {unit}</span>
                    </td>
                    <td className="gw-buy-cell">
                      {recipeCount > 0 ? muted(t('gw_via_recipe', 'über Rezept')) : (
                        <>
                          <div>
                            {i.buy_unit
                              ? <>1 {i.buy_unit} = <InlineField
                                label={`${t('gw_col_content', 'Inhalt')}: ${i.name}`}
                                value={i.pack_size}
                                digitsOnly
                                disabled={yearLocked}
                                onCommit={(text) => commitField(i, 'pack_size', text)}
                              /> {unit}</>
                              : muted('–')}
                            {contentMissing(i) && (
                              <span
                                className="gw-badge-warn"
                                title={t('gw_content_missing_hint', 'Inhalt prüfen: wie viele Verkaufseinheiten stecken in einer Einkaufseinheit?')}
                              >
                                {t('gw_content_missing', 'Inhalt fehlt')}
                              </span>
                            )}
                          </div>
                          <div className="dt-muted dt-mono gw-buy-price">
                            à <InlineField
                              label={`${t('gw_buy_pack_price_per', 'Preis je')}: ${i.name}`}
                              value={i.buy_pack_price}
                              disabled={yearLocked}
                              onCommit={(text) => commitField(i, 'buy_pack_price', text)}
                            /> €
                          </div>
                        </>
                      )}
                    </td>
                    <td className="num dt-mono">{money(econ.cost)}</td>
                    <td className="num dt-mono">{money(econ.margin, true)}</td>
                    <td className="num dt-mono">
                      {econ.marginPct == null
                        ? muted('–')
                        : <span className={econ.marginPct < 0 ? 'negative' : undefined}>{fmtPct(econ.marginPct)}</span>}
                    </td>
                    <td className="dt-mono">
                      <InlineField
                        label={`${t('gw_col_planned_qty', 'Geplant')}: ${i.name}`}
                        value={i.planned_qty}
                        digitsOnly
                        disabled={yearLocked}
                        onCommit={(text) => commitField(i, 'planned_qty', text)}
                      />
                      <span className="dt-muted"> {unit}</span>
                    </td>
                    <td className="dt-mono">
                      {recipeCount > 0
                        ? muted(t('gw_via_shopping_list', 'über Einkaufsliste'))
                        : econ.packsToBuy == null
                          ? muted('–')
                          : <>{fmtNum(econ.packsToBuy)} <span className="dt-muted">{i.buy_unit || unit}</span></>}
                    </td>
                    <td className="num dt-mono">{money(econ.revenue)}</td>
                    <td className="num dt-mono">{money(econ.profit, true)}</td>
                    <td>
                      <button
                        type="button"
                        className="gw-recipe-btn"
                        onClick={() => openRecipe(i)}
                        title={t('gw_recipe_title', 'Rezept')}
                        aria-label={`${t('gw_recipe_title', 'Rezept')}: ${i.name}`}
                      >
                        <BookOpen size={15} />
                        <span>
                          {recipeCount
                            ? `${recipeCount} ${recipeCount === 1 ? t('gw_recipe_ingredient_one', 'Zutat') : t('gw_recipe_ingredient_many', 'Zutaten')}`
                            : t('gw_recipe_none', 'Kein Rezept')}
                        </span>
                      </button>
                    </td>
                    <td>
                      <span className={`gw-status${i.active ? ' active' : ''}`}>
                        {i.active ? t('gw_active', 'aktiv') : t('gw_inactive', 'inaktiv')}
                      </span>
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
            <tfoot>
              <tr>
                <td>{t('gw_total', 'Gesamt')}</td>
                <td />
                <td />
                <td />
                <td />
                <td />
                <td />
                <td />
                <td className="num dt-mono">{money(totals.revenue)}</td>
                <td className="num dt-mono">{money(totals.profit, true)}</td>
                <td />
                <td />
                <td />
              </tr>
            </tfoot>
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
