import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AlertCircle, Plus, Edit2, Archive, ArchiveRestore, BookOpen, Package, Lock } from 'lucide-react';
import { useGluehweinCatalog } from '../hooks/useGluehweinCatalog';
import useTableSort from '../hooks/useTableSort';
import useCurrency from '../hooks/useCurrency';
import useFocusTrap from '../hooks/useFocusTrap';
import { useT } from '../hooks/useUiTranslations';
import SortableTh from './SortableTh';
import ConfirmDialog from './ConfirmDialog';
import DecimalInput from './DecimalInput';
import RecipeEditor from './RecipeEditor';
import Button from './Button';
import './DataTable.css';
import './ClientModal.css'; // shared .modal-overlay / .modal-content / .modal-actions styles
import './SettingsFieldsModal.css'; // shared field grid (.settings-fields-modal-*)
import './GluehweinCatalog.css';

const LOCALE = 'de-DE';

// Display order of the kinds; also the default (unsorted) order of the table.
const KINDS = [
  { value: 'drink', label: 'Getränk' },
  { value: 'addon', label: 'Zusatz' },
  { value: 'beer', label: 'Bier' },
  { value: 'beer_special', label: 'Spezialbier' },
  { value: 'ingredient', label: 'Zutat' },
];
const KIND_ORDER = new Map(KINDS.map((k, i) => [k.value, i]));

const PACK_TYPES = [
  { value: 'none', label: '–' },
  { value: 'kasten', label: 'Kasten' },
  { value: 'flasche', label: 'Flasche' },
  { value: 'paket', label: 'Paket' },
];

const isProduct = (kind) => kind !== 'ingredient';
const numOrNull = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const fmtNum = (n) => (n == null ? '' : Number(n).toLocaleString(LOCALE, { maximumFractionDigits: 3 }));
const str = (v) => (v == null ? '' : String(v));

/**
 * Add / edit one catalog item: the item itself (name, kind, unit; not year-bound, always editable)
 * and its terms for the selected scout year (prices, pack, Bedarf; read-only when the year is locked).
 * onSave({ item, terms|null }) throws to show the save error.
 */
const ItemModal = ({ item, year, yearLocked, onSave, onCancel, triggerRef }) => {
  const t = useT();
  const [form, setForm] = useState(() => ({
    name: item?.name || '',
    kind: item?.kind || 'drink',
    unit: item?.unit || 'Stk',
    sell_price: str(item?.sell_price),
    buy_price: str(item?.buy_price),
    pack_type: item?.pack_type || 'none',
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

  const sellable = isProduct(form.kind);

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
        item: {
          ...(item?.id ? { id: item.id, sort_order: item.sort_order, active: item.active } : {}),
          name: form.name.trim(),
          kind: form.kind,
          unit: form.unit.trim() || 'Stk',
        },
        terms: yearLocked ? null : {
          sell_price: sellable ? round2(numOrNull(form.sell_price)) : null,
          buy_price: round2(numOrNull(form.buy_price)),
          pack_type: form.pack_type,
          pack_size: form.pack_type === 'none' ? 1 : packSize,
          planned_qty: numOrNull(form.planned_qty) ?? 0,
        },
      });
    } catch {
      setSaveError(t('gw_save_error', 'Änderung konnte nicht gespeichert werden.'));
      setSaving(false);
    }
  };

  const yearLabel = `${year}/${String((year + 1) % 100).padStart(2, '0')}`;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="gw-item-modal-title">
      <div className="modal-content settings-fields-modal" ref={modalRef}>
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
            <div className="settings-fields-modal-field">
              <label className="input-label" htmlFor="gw-item-kind">{t('gw_col_kind', 'Art')}</label>
              <select
                id="gw-item-kind"
                className="input-field"
                value={form.kind}
                onChange={(e) => setValue('kind', e.target.value)}
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{t(`gw_kind_${k.value}`, k.label)}</option>
                ))}
              </select>
            </div>
            <div className="settings-fields-modal-field">
              <label className="input-label" htmlFor="gw-item-unit">{t('gw_col_unit', 'Einheit')}</label>
              <input
                id="gw-item-unit"
                type="text"
                className="input-field"
                value={form.unit}
                maxLength={20}
                placeholder="Stk"
                onChange={(e) => setValue('unit', e.target.value)}
              />
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
              {sellable && (
                <div className="settings-fields-modal-field">
                  <label className="input-label" htmlFor="gw-item-sell">{t('gw_col_sell', 'Verkaufspreis')}</label>
                  <DecimalInput
                    id="gw-item-sell"
                    min="0"
                    className="input-field"
                    value={form.sell_price}
                    placeholder="0,00"
                    onChange={(e) => setValue('sell_price', e.target.value)}
                    onFocus={(e) => e.target.select()}
                  />
                </div>
              )}
              <div className={`settings-fields-modal-field${sellable ? '' : ' wide'}`}>
                <label className="input-label" htmlFor="gw-item-buy">{t('gw_col_buy', 'Einkaufspreis')}</label>
                <DecimalInput
                  id="gw-item-buy"
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
                <label className="input-label" htmlFor="gw-item-pack">{t('gw_col_pack', 'Gebinde')}</label>
                <select
                  id="gw-item-pack"
                  className="input-field"
                  value={form.pack_type}
                  onChange={(e) => setValue('pack_type', e.target.value)}
                >
                  {PACK_TYPES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.value === 'none' ? t('gw_pack_none_option', 'Keins') : t(`gw_pack_${p.value}`, p.label)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="settings-fields-modal-field">
                <label className="input-label" htmlFor="gw-item-pack-size">{t('gw_col_pack_size', 'Packungsgröße')}</label>
                <DecimalInput
                  id="gw-item-pack-size"
                  min="0"
                  className={`input-field${errors.pack_size ? ' error' : ''}`}
                  value={form.pack_type === 'none' ? '1' : form.pack_size}
                  disabled={yearLocked || form.pack_type === 'none'}
                  onChange={(e) => setValue('pack_size', e.target.value)}
                  onFocus={(e) => e.target.select()}
                  aria-invalid={errors.pack_size ? 'true' : undefined}
                />
                {errors.pack_size && <span className="input-error">{errors.pack_size}</span>}
              </div>
              <div className="settings-fields-modal-field wide">
                <label className="input-label" htmlFor="gw-item-planned">{t('gw_col_planned', 'Bedarf')}</label>
                <div className="settings-fields-modal-input">
                  <DecimalInput
                    id="gw-item-planned"
                    min="0"
                    className="input-field"
                    value={form.planned_qty}
                    placeholder="0"
                    onChange={(e) => setValue('planned_qty', e.target.value)}
                    onFocus={(e) => e.target.select()}
                  />
                  <span className="settings-fields-modal-suffix">{form.unit.trim() || 'Stk'}</span>
                </div>
                <span className="settings-fields-modal-hint">
                  {sellable
                    ? t('gw_planned_hint_product', 'Geplante Verkaufsmenge; mit Rezept wird daraus der Zutatenbedarf berechnet.')
                    : t('gw_planned_hint_ingredient', 'Zusätzlicher Bedarf dieser Zutat.')}
                </span>
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
 * Catalog of a Verkaufsaktion (Glühwein and any other action using the gw_* catalog):
 * all items with their terms for the selected scout year.
 * action: SALES_ACTIONS entry (label only; the catalog itself is shared).
 * Items (name/kind/unit/active) are always editable; terms are read-only in a locked year.
 * Products (all kinds except 'ingredient') have a recipe; ingredients have no sell price.
 * search: filters by name.
 */
const GluehweinCatalog = ({ action, year, yearLocked, search = '', onError }) => {
  const t = useT();
  const formatCurrency = useCurrency();
  const { fetchItems, saveItem, deleteItem, saveTerms } = useGluehweinCatalog();
  const [items, setItems] = useState([]);
  const [loadedYear, setLoadedYear] = useState(null);
  const loading = loadedYear !== year;
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState(null); // null | { item: row | null, triggerRef }
  const [recipeFor, setRecipeFor] = useState(null); // product id
  const [toDeactivate, setToDeactivate] = useState(null);
  const addRef = useRef(null);
  // Unsorted = grouped by kind (drink, addon, beer, beer_special, ingredient), then sort_order, name.
  const { sort, toggleSort, sortRows } = useTableSort({ key: null, dir: null });

  const report = useCallback((err) => {
    const msg = err?.message === 'ITEM_IN_USE'
      ? t('gw_err_item_in_use', 'Diese Zutat wird in einem Rezept verwendet und kann nicht deaktiviert werden.')
      : err?.message === 'YEAR_LOCKED'
        ? t('gw_err_year_locked', 'Das Jahr ist gesperrt.')
        : t('gw_save_error', 'Änderung konnte nicht gespeichert werden.');
    onError?.(msg);
  }, [onError, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchItems(year);
        if (!cancelled) setItems(list || []);
      } catch {
        if (!cancelled) onError?.(t('gw_load_error', 'Katalog konnte nicht geladen werden.'));
      } finally {
        if (!cancelled) setLoadedYear(year);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const reload = useCallback(async () => {
    setItems((await fetchItems(year)) || []);
  }, [fetchItems, year]);

  const kindLabel = useCallback((kind) => {
    const k = KINDS.find((x) => x.value === kind);
    return k ? t(`gw_kind_${k.value}`, k.label) : (kind || '');
  }, [t]);
  const packLabel = useCallback((type) => {
    const p = PACK_TYPES.find((x) => x.value === type) || PACK_TYPES[0];
    return p.value === 'none' ? p.label : t(`gw_pack_${p.value}`, p.label);
  }, [t]);

  const grouped = useMemo(() => [...items].sort((a, b) => (
    (KIND_ORDER.get(a.kind) ?? 99) - (KIND_ORDER.get(b.kind) ?? 99)
    || (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
    || String(a.name).localeCompare(String(b.name), LOCALE)
  )), [items]);

  const inactiveCount = items.filter((i) => !i.active).length;
  const q = search.trim().toLowerCase();
  const visible = useMemo(() => grouped.filter((i) => (
    (showInactive || i.active) && (!q || String(i.name).toLowerCase().includes(q))
  )), [grouped, showInactive, q]);

  const sorted = useMemo(() => sortRows(visible, {
    name: (i) => String(i.name).toLowerCase(),
    kind: (i) => KIND_ORDER.get(i.kind) ?? 99,
    sell_price: (i) => (isProduct(i.kind) ? i.sell_price ?? null : null),
    buy_price: (i) => i.buy_price ?? null,
    pack_type: (i) => (i.pack_type && i.pack_type !== 'none' ? packLabel(i.pack_type).toLowerCase() : null),
    pack_size: (i) => (i.pack_type && i.pack_type !== 'none' ? Number(i.pack_size) : null),
    planned_qty: (i) => Number(i.planned_qty) || 0,
  }, { tieBreak: (i) => i.name, locale: LOCALE }), [visible, sortRows, packLabel]);

  // Throws on failure so the popup shows its save error and stays open.
  const handleSave = async ({ item, terms }) => {
    const id = await saveItem(item);
    if (terms && !yearLocked) await saveTerms(year, id || item.id, terms);
    await reload();
    setModal(null);
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
      await saveItem({ id: item.id, name: item.name, kind: item.kind, unit: item.unit, sort_order: item.sort_order, active: 1 });
      await reload();
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

  const money = (v) => (v == null ? <span className="dt-muted">–</span> : formatCurrency(Number(v)));

  return (
    <div className="gw-catalog">
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
        <Button
          ref={addRef}
          variant="primary"
          size="md"
          icon={Plus}
          onClick={() => setModal({ item: null, triggerRef: addRef })}
        >
          {t('gw_item_add', 'Artikel hinzufügen')}
        </Button>
      </div>

      <div className="data-table-container">
        {loading || visible.length === 0 ? (
          <div className="gw-catalog-empty">
            <Package size={36} strokeWidth={1.4} />
            <div className="gw-catalog-empty-title">
              {loading
                ? t('loading', 'Laden…')
                : items.length > 0 && q
                  ? `${t('gw_no_match', 'Keine Artikel gefunden für')} "${search.trim()}"`
                  : `${t('gw_empty', 'Noch keine Artikel im Katalog')}${action?.label ? ` (${action.label})` : ''}`}
            </div>
            {!loading && q && items.length > 0 && (
              <div className="gw-catalog-empty-desc">{t('try_different_search', 'Versuche einen anderen Suchbegriff.')}</div>
            )}
          </div>
        ) : (
          <table className="data-table gw-catalog-table" aria-label={`${t('gw_catalog', 'Katalog')}${action?.label ? ` ${action.label}` : ''}`}>
            <colgroup>
              <col />
              <col className="gw-col-kind" />
              <col className="gw-col-money" />
              <col className="gw-col-money" />
              <col className="gw-col-pack" />
              <col className="gw-col-pack-size" />
              <col className="gw-col-planned" />
              <col className="gw-col-actions" />
            </colgroup>
            <thead>
              <tr>
                {sortTh('name', t('gw_col_name', 'Name'))}
                {sortTh('kind', t('gw_col_kind', 'Art'))}
                {sortTh('sell_price', t('gw_col_sell', 'Verkaufspreis'), 'right')}
                {sortTh('buy_price', t('gw_col_buy', 'Einkaufspreis'), 'right')}
                {sortTh('pack_type', t('gw_col_pack', 'Gebinde'))}
                {sortTh('pack_size', t('gw_col_pack_size', 'Packungsgröße'))}
                {sortTh('planned_qty', t('gw_col_planned', 'Bedarf'))}
                <th aria-label={t('actions', 'Aktionen')} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((i) => {
                const product = isProduct(i.kind);
                const hasPack = i.pack_type && i.pack_type !== 'none';
                const recipeCount = i.recipe?.length || 0;
                return (
                  <tr key={i.id} className={i.active ? undefined : 'gw-row-inactive'}>
                    <td className="gw-name-cell">
                      {i.name}
                      {!i.active && <span className="gw-badge-inactive">{t('gw_inactive', 'inaktiv')}</span>}
                    </td>
                    <td><span className={`gw-kind gw-kind-${i.kind}`}>{kindLabel(i.kind)}</span></td>
                    <td className="num dt-mono">{product ? money(i.sell_price) : <span className="dt-muted">–</span>}</td>
                    <td className="num dt-mono">{money(i.buy_price)}</td>
                    <td>{packLabel(i.pack_type)}</td>
                    <td className="dt-mono">{hasPack ? fmtNum(i.pack_size) : <span className="dt-muted">–</span>}</td>
                    <td className="dt-mono">
                      {fmtNum(Number(i.planned_qty) || 0)} <span className="dt-muted">{i.unit || 'Stk'}</span>
                    </td>
                    <td className="gw-row-actions">
                      {product && (
                        <button
                          type="button"
                          className="gw-recipe-btn"
                          onClick={() => setRecipeFor(i.id)}
                          title={t('gw_recipe_title', 'Rezept')}
                          aria-label={`${t('gw_recipe_title', 'Rezept')}: ${i.name}`}
                        >
                          <BookOpen size={15} />
                          <span>{t('gw_recipe_title', 'Rezept')}{recipeCount ? ` (${recipeCount})` : ''}</span>
                        </button>
                      )}
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

      {modal && (
        <ItemModal
          item={modal.item}
          year={year}
          yearLocked={yearLocked}
          onSave={handleSave}
          onCancel={() => setModal(null)}
          triggerRef={modal.triggerRef}
        />
      )}

      {recipeFor && (
        <RecipeEditor
          productId={recipeFor}
          items={items}
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
