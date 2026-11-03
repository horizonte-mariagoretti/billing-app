import { useState, useRef, useEffect, useMemo } from 'react';
import { AlertCircle, BookOpen, Plus, Save, Trash2 } from 'lucide-react';
import { useGluehweinCatalog } from '../hooks/useGluehweinCatalog';
import { useGluehweinRecipeLibrary } from '../hooks/useGluehweinRecipeLibrary';
import useFocusTrap from '../hooks/useFocusTrap';
import { useT } from '../hooks/useUiTranslations';
import Button from './Button';
import DecimalInput from './DecimalInput';
import StyledSelect from './StyledSelect';
import { unitModeLabel } from '../utils/gluehweinCatalogMath';
import './ClientModal.css'; // shared .modal-overlay / .modal-content / .modal-actions styles
import './SettingsFieldsModal.css'; // shared field (.settings-fields-modal-*)
import './RecipeEditor.css';

let rowSeq = 0;
const newKey = () => `r${++rowSeq}`;
const norm = (s) => String(s ?? '').trim().toLowerCase();

const BASE_UNITS = ['portion', 'buy', 'liter'];

/**
 * Recipe of one Sortiment product: which ingredients, how much for one recipe base amount (Rezeptmenge, e.g. 1 Becher
 * or 1 l; unit 'portion' | 'buy' | 'liter' like the Sortiment Übrig select). The Einkaufsliste converts the Einkauf
 * into that unit and multiplies the rows by the number of base amounts.
 * Each row takes the ingredient by name. A name that is not in the ingredient list yet is created when the recipe is
 * saved, with the unit typed in the row (default Stk). A known name takes its unit from the ingredient.
 * product: gw_items row from useGluehweinCatalog().fetchItems (its current recipe is product.recipe).
 * ingredients: gw_ingredients rows from useGluehweinIngredients().fetchIngredients (incl. inactive ones).
 * onClose(): cancel. onSaved(): after a successful saveRecipe (the parent reloads and closes).
 */
const RecipeEditor = ({ product, ingredients = [], onClose, onSaved }) => {
  const t = useT();
  const { saveRecipe } = useGluehweinCatalog();
  const library = useGluehweinRecipeLibrary();
  const byName = useMemo(() => new Map(ingredients.map((i) => [norm(i.name), i])), [ingredients]);
  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);
  const [rows, setRows] = useState(() => (product?.recipe || []).map((r) => {
    const g = byId.get(r.ingredient_id);
    return {
      key: newKey(),
      name: g?.name || '',
      unit: g?.unit || '',
      qty: r.qty_per_unit == null ? '' : String(r.qty_per_unit),
    };
  }));
  const [baseAmount, setBaseAmount] = useState(() => String(product?.recipe_amount ?? 1));
  const [baseUnit, setBaseUnit] = useState(() => (BASE_UNITS.includes(product?.recipe_unit) ? product.recipe_unit : 'portion'));
  const [baseError, setBaseError] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState(null); // null = list closed, [] or [template] = open
  const [templateName, setTemplateName] = useState(null); // null = closed, string = name being typed

  const modalRef = useRef(null);
  useFocusTrap(modalRef, { active: true });

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const update = (key, patch) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setError(null);
  };

  // Typing a known name fills its unit; a new name keeps the unit typed in the row.
  const setName = (key, name) => {
    const known = byName.get(norm(name));
    update(key, known ? { name, unit: known.unit || '' } : { name });
  };

  const addRow = () => setRows((rs) => [...rs, { key: newKey(), name: '', unit: '', qty: '' }]);
  const removeRow = (key) => {
    setRows((rs) => rs.filter((r) => r.key !== key));
    setError(null);
  };

  // Checks the rows and returns them as { name, unit, qty_per_unit }, or null after setting the error.
  const validRows = () => {
    if (rows.some((r) => !r.name.trim())) {
      setError(t('gw_recipe_err_blank', 'Bitte in jeder Zeile einen Namen eingeben oder die Zeile entfernen.'));
      return null;
    }
    if (new Set(rows.map((r) => norm(r.name))).size !== rows.length) {
      setError(t('gw_recipe_err_dup', 'Jede Zutat darf nur einmal vorkommen.'));
      return null;
    }
    const parsed = rows.map((r) => ({
      name: r.name.trim(),
      unit: byName.get(norm(r.name))?.unit || r.unit.trim() || 'Stk',
      qty_per_unit: Number(String(r.qty).replace(',', '.')),
    }));
    if (parsed.some((r) => !Number.isFinite(r.qty_per_unit) || r.qty_per_unit <= 0)) {
      setError(t('gw_recipe_err_qty', 'Bitte für jede Zutat eine Menge größer 0 eingeben.'));
      return null;
    }
    return parsed;
  };

  // Opens the template list; loading one replaces the rows here. Nothing is saved to the product until Speichern.
  const openTemplates = async () => {
    setTemplateName(null);
    try {
      setTemplates(await library.fetchRecipes());
    } catch {
      setError(t('gw_recipe_lib_load_error', 'Rezeptbibliothek konnte nicht geladen werden.'));
    }
  };

  const loadTemplate = (tpl) => {
    setRows(tpl.rows.map((r) => ({
      key: newKey(),
      name: r.name,
      unit: r.unit || '',
      qty: r.qty_per_unit == null ? '' : String(r.qty_per_unit),
    })));
    setTemplates(null);
    setError(null);
  };

  const saveTemplate = async () => {
    const name = (templateName || '').trim();
    if (!name) {
      setError(t('gw_recipe_lib_name_required', 'Bitte einen Namen für die Vorlage eingeben.'));
      return;
    }
    const parsed = validRows();
    if (!parsed) return;
    try {
      await library.saveRecipe(name, parsed);
      setTemplateName(null);
      setError(null);
    } catch {
      setError(t('gw_save_error', 'Änderung konnte nicht gespeichert werden.'));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = Number(String(baseAmount).replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setBaseError(true);
      setError(t('gw_recipe_err_base', 'Bitte eine Rezeptmenge größer 0 eingeben.'));
      return;
    }
    const parsed = validRows();
    if (!parsed) return;
    setSaving(true);
    setError(null);
    try {
      await saveRecipe(product.id, parsed, { amount, unit: baseUnit });
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
          {t('gw_recipe_desc_base', 'Zutaten und Menge für die Rezeptmenge. Das Rezept gilt für alle Jahre.')}
        </p>
        <form onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="page-error" role="alert">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="settings-fields-modal-field recipe-editor-base">
            <label className="input-label" htmlFor="recipe-editor-base-amount">{t('gw_recipe_base', 'Rezeptmenge')}</label>
            <div className="settings-fields-modal-input">
              <DecimalInput
                id="recipe-editor-base-amount"
                min="0"
                className={`input-field${baseError ? ' error' : ''}`}
                value={baseAmount}
                placeholder="1"
                onChange={(e) => { setBaseAmount(e.target.value); setBaseError(false); setError(null); }}
                onFocus={(e) => e.target.select()}
                aria-invalid={baseError ? 'true' : undefined}
              />
              <StyledSelect
                className="recipe-editor-base-unit"
                value={baseUnit}
                onChange={(e) => setBaseUnit(e.target.value)}
              >
                {BASE_UNITS.map((mode) => (
                  <option key={mode} value={mode}>{unitModeLabel(product, mode, t('gw_plan_buy', 'Einkaufseinheit'))}</option>
                ))}
              </StyledSelect>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="recipe-editor-empty">{t('gw_recipe_empty', 'Noch keine Zutaten im Rezept.')}</div>
          ) : (
            <div className="recipe-editor-rows">
              <div className="recipe-editor-row recipe-editor-head" aria-hidden="true">
                <span>{t('gw_recipe_col_ingredient', 'Zutat')}</span>
                <span>{t('gw_recipe_col_qty_base', 'Menge pro Rezeptmenge')}</span>
                <span />
              </div>
              {rows.map((r, idx) => {
                const known = byName.get(norm(r.name));
                const label = `${t('gw_recipe_col_ingredient', 'Zutat')} ${idx + 1}`;
                return (
                  <div className="recipe-editor-row" key={r.key}>
                    <div className="recipe-editor-name">
                      <input
                        className="input-field"
                        list="recipe-editor-ingredients"
                        value={r.name}
                        placeholder={t('gw_recipe_name_placeholder', 'Zutat, z.B. Gin')}
                        aria-label={label}
                        onChange={(e) => setName(r.key, e.target.value)}
                      />
                      {r.name.trim() && !known && (
                        <span className="recipe-editor-new">{t('gw_recipe_new_ingredient', 'neu')}</span>
                      )}
                    </div>
                    <div className="recipe-editor-qty">
                      <DecimalInput
                        min="0"
                        className="input-field"
                        value={r.qty}
                        placeholder="0"
                        aria-label={`${t('gw_recipe_col_qty_base', 'Menge pro Rezeptmenge')} ${idx + 1}`}
                        onChange={(e) => update(r.key, { qty: e.target.value })}
                        onFocus={(e) => e.target.select()}
                      />
                      {known ? (
                        <span className="recipe-editor-unit">{known.unit || ''}</span>
                      ) : (
                        <input
                          className="input-field recipe-editor-unit-input"
                          value={r.unit}
                          placeholder="Stk"
                          aria-label={`${t('gw_recipe_col_unit', 'Einheit')} ${idx + 1}`}
                          onChange={(e) => update(r.key, { unit: e.target.value })}
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      className="recipe-editor-remove"
                      onClick={() => removeRow(r.key)}
                      title={t('gw_recipe_remove', 'Zeile entfernen')}
                      aria-label={`${t('gw_recipe_remove', 'Zeile entfernen')}: ${r.name || idx + 1}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <datalist id="recipe-editor-ingredients">
            {ingredients.filter((i) => i.active).map((i) => <option key={i.id} value={i.name} />)}
          </datalist>
          <div className="recipe-editor-add">
            <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={addRow}>
              {t('gw_recipe_add', 'Zutat hinzufügen')}
            </Button>
          </div>

          <div className="recipe-editor-library">
            <Button variant="secondary" size="sm" type="button" icon={BookOpen} onClick={openTemplates}>
              {t('gw_recipe_load', 'Rezept laden')}
            </Button>
            {templateName === null ? (
              <Button variant="secondary" size="sm" type="button" icon={Save} onClick={() => setTemplateName('')}>
                {t('gw_recipe_save_template', 'Als Vorlage speichern')}
              </Button>
            ) : (
              <div className="recipe-editor-template-save">
                <input
                  className="input-field"
                  value={templateName}
                  placeholder={t('gw_recipe_template_name', 'Name der Vorlage')}
                  aria-label={t('gw_recipe_template_name', 'Name der Vorlage')}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
                <Button variant="primary" size="sm" type="button" onClick={saveTemplate}>{t('btn_save', 'Speichern')}</Button>
                <Button variant="ghost" size="sm" type="button" onClick={() => setTemplateName(null)}>{t('btn_cancel', 'Abbrechen')}</Button>
              </div>
            )}
          </div>
          {templates && (
            <div className="recipe-editor-templates" role="list">
              {templates.length === 0 ? (
                <div className="recipe-editor-empty">{t('gw_recipe_lib_empty', 'Noch keine Vorlagen gespeichert.')}</div>
              ) : templates.map((tpl) => (
                <button key={tpl.id} type="button" role="listitem" className="recipe-editor-template" onClick={() => loadTemplate(tpl)}>
                  <span>{tpl.name}</span>
                  <span className="dt-muted">{tpl.rows.length} {t('gw_recipe_lib_items', 'Zutaten')}</span>
                </button>
              ))}
            </div>
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
