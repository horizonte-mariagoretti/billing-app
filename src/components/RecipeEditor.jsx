import { useState, useRef, useEffect, useMemo } from 'react';
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import { useGluehweinCatalog } from '../hooks/useGluehweinCatalog';
import useFocusTrap from '../hooks/useFocusTrap';
import { useT } from '../hooks/useUiTranslations';
import Button from './Button';
import DecimalInput from './DecimalInput';
import './ClientModal.css'; // shared .modal-overlay / .modal-content / .modal-actions styles
import './RecipeEditor.css';

let rowSeq = 0;
const newKey = () => `r${++rowSeq}`;

/**
 * Recipe of one catalog product (drink, addon, beer, beer_special): which ingredients, how much per sold unit.
 * productId: gw_items id of the product.
 * items: all catalog items (from fetchItems); ingredients = kind 'ingredient'. The product's current recipe
 *   is read from items[].recipe.
 * onClose(): cancel. onSaved(): after a successful saveRecipe (the parent reloads and closes).
 * Blank and duplicate ingredient rows are prevented: each select only offers ingredients not used in another row,
 * and saving checks that every row has an ingredient and a quantity > 0.
 */
const RecipeEditor = ({ productId, items, onClose, onSaved }) => {
  const t = useT();
  const { saveRecipe } = useGluehweinCatalog();
  const product = useMemo(() => items.find((i) => i.id === productId) || null, [items, productId]);
  const [rows, setRows] = useState(() => (product?.recipe || []).map((r) => ({
    key: newKey(),
    ingredient_id: r.ingredient_id,
    qty: r.qty_per_unit == null ? '' : String(r.qty_per_unit),
  })));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const modalRef = useRef(null);
  useFocusTrap(modalRef, { active: true });

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const ingredients = useMemo(
    () => items.filter((i) => i.kind === 'ingredient'),
    [items],
  );
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const used = new Set(rows.map((r) => r.ingredient_id).filter(Boolean));
  // Active ingredients not used in any row yet.
  const free = ingredients.filter((i) => i.active && !used.has(i.id));
  const hasBlank = rows.some((r) => !r.ingredient_id);
  const canAdd = free.length > 0 && !hasBlank;

  const update = (key, patch) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setError(null);
  };

  const addRow = () => {
    if (!canAdd) return;
    // Pre-select the only remaining ingredient so no blank row is left behind.
    setRows((rs) => [...rs, { key: newKey(), ingredient_id: free.length === 1 ? free[0].id : '', qty: '' }]);
    setError(null);
  };

  const removeRow = (key) => {
    setRows((rs) => rs.filter((r) => r.key !== key));
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rows.some((r) => !r.ingredient_id)) {
      setError(t('gw_recipe_err_blank', 'Bitte in jeder Zeile eine Zutat wählen oder die Zeile entfernen.'));
      return;
    }
    if (new Set(rows.map((r) => r.ingredient_id)).size !== rows.length) {
      setError(t('gw_recipe_err_dup', 'Jede Zutat darf nur einmal vorkommen.'));
      return;
    }
    const parsed = rows.map((r) => ({ ingredient_id: r.ingredient_id, qty_per_unit: Number(String(r.qty).replace(',', '.')) }));
    if (parsed.some((r) => !Number.isFinite(r.qty_per_unit) || r.qty_per_unit <= 0)) {
      setError(t('gw_recipe_err_qty', 'Bitte für jede Zutat eine Menge größer 0 eingeben.'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveRecipe(productId, parsed);
      onSaved?.();
    } catch {
      setError(t('gw_save_error', 'Änderung konnte nicht gespeichert werden.'));
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="recipe-editor-title">
      <div className="modal-content recipe-editor" ref={modalRef}>
        <h2 id="recipe-editor-title">
          {t('gw_recipe_title', 'Rezept')}{product ? `: ${product.name}` : ''}
        </h2>
        <p className="recipe-editor-desc">
          {t('gw_recipe_desc', 'Zutaten und Menge pro verkaufter Einheit. Das Rezept gilt für alle Jahre.')}
        </p>
        <form onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="page-error" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {ingredients.length === 0 ? (
            <div className="recipe-editor-empty">
              {t('gw_recipe_no_ingredients', 'Noch keine Zutaten im Katalog. Lege zuerst Artikel der Art „Zutat“ an.')}
            </div>
          ) : (
            <>
              {rows.length === 0 ? (
                <div className="recipe-editor-empty">{t('gw_recipe_empty', 'Noch keine Zutaten im Rezept.')}</div>
              ) : (
                <div className="recipe-editor-rows">
                  <div className="recipe-editor-row recipe-editor-head" aria-hidden="true">
                    <span>{t('gw_recipe_col_ingredient', 'Zutat')}</span>
                    <span>{t('gw_recipe_col_qty', 'Menge pro Einheit')}</span>
                    <span />
                  </div>
                  {rows.map((r, idx) => {
                    const current = r.ingredient_id ? byId.get(r.ingredient_id) : null;
                    // Own ingredient + the free ones (an inactive one stays visible while it is selected).
                    const options = [
                      ...(current ? [current] : []),
                      ...free.filter((i) => i.id !== r.ingredient_id),
                    ];
                    return (
                      <div className="recipe-editor-row" key={r.key}>
                        <select
                          className="input-field"
                          value={r.ingredient_id}
                          aria-label={`${t('gw_recipe_col_ingredient', 'Zutat')} ${idx + 1}`}
                          onChange={(e) => update(r.key, { ingredient_id: e.target.value })}
                        >
                          {!r.ingredient_id && <option value="">{t('gw_recipe_pick', 'Zutat wählen…')}</option>}
                          {options.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name}{i.active ? '' : ` (${t('gw_inactive', 'inaktiv')})`}
                            </option>
                          ))}
                        </select>
                        <div className="recipe-editor-qty">
                          <DecimalInput
                            min="0"
                            className="input-field"
                            value={r.qty}
                            placeholder="0"
                            aria-label={`${t('gw_recipe_col_qty', 'Menge pro Einheit')} ${idx + 1}`}
                            onChange={(e) => update(r.key, { qty: e.target.value })}
                            onFocus={(e) => e.target.select()}
                          />
                          <span className="recipe-editor-unit">{current?.unit || ''}</span>
                        </div>
                        <button
                          type="button"
                          className="recipe-editor-remove"
                          onClick={() => removeRow(r.key)}
                          title={t('gw_recipe_remove', 'Zeile entfernen')}
                          aria-label={`${t('gw_recipe_remove', 'Zeile entfernen')}: ${current?.name || idx + 1}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="recipe-editor-add">
                <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={addRow} disabled={!canAdd}>
                  {t('gw_recipe_add', 'Zutat hinzufügen')}
                </Button>
              </div>
            </>
          )}

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

export default RecipeEditor;
