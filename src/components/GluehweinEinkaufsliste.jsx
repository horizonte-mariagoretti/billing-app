import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ShoppingCart, Lock, Plus, Carrot, BookOpen, ListChecks } from 'lucide-react';
import { useGluehweinCatalog } from '../hooks/useGluehweinCatalog';
import { useGluehweinIngredients } from '../hooks/useGluehweinIngredients';
import useCurrency from '../hooks/useCurrency';
import useTableSort from '../hooks/useTableSort';
import { useT } from '../hooks/useUiTranslations';
import { buildShoppingList } from '../utils/gluehweinShoppingList';
import SegmentedToggle from './SegmentedToggle';
import SortableTh from './SortableTh';
import Button from './Button';
import RecipeEditor from './RecipeEditor';
import GluehweinIngredientModal from './GluehweinIngredientModal';
import './DataTable.css';
import './GluehweinEinkaufsliste.css';

const LOCALE = 'de-DE';

const PACK_LABELS = { kasten: 'Kasten', flasche: 'Flasche', paket: 'Paket' };
const packLabel = (packType, t) => (PACK_LABELS[packType]
  ? t(`gw_pack_${packType}`, PACK_LABELS[packType])
  : t('gw_pack_none', 'Stk'));

const fmtQty = (n) => (Number(n) || 0).toLocaleString(LOCALE, { maximumFractionDigits: 3 });
const lower = (v) => String(v ?? '').toLowerCase();

const Empty = ({ icon: Icon, title, desc }) => (
  <div className="gw-shop-empty">
    <Icon size={36} strokeWidth={1.4} />
    <div className="gw-shop-empty-title">{title}</div>
    {desc && <div className="gw-shop-empty-desc">{desc}</div>}
  </div>
);

/** Computed shopping list (read-only): ingredients from the recipes + Zusatzbedarf, products without recipe. */
const ShoppingTable = ({ products, ingredients, t, formatCurrency }) => {
  const { sort, toggleSort, sortRows } = useTableSort({ key: null, dir: null });

  const { rows, total } = useMemo(() => {
    const productTerms = new Map(products.map((p) => [p.id, p]));
    const ingredientTerms = new Map(ingredients.map((g) => [g.id, g]));
    const recipe = products.flatMap((p) => (p.recipe || []).map((r) => ({ product_id: p.id, ...r })));
    const result = buildShoppingList({ products, ingredients, productTerms, ingredientTerms, recipe });
    // Unsorted: ingredients first, then products, each by name.
    const list = [...result.rows].sort((a, b) => (
      (a.source === b.source ? 0 : a.source === 'ingredient' ? -1 : 1) || a.name.localeCompare(b.name, LOCALE)
    ));
    return { rows: list, total: result.total };
  }, [products, ingredients]);

  const sorted = useMemo(() => sortRows(rows, {
    name: (r) => lower(r.name),
    source: (r) => (r.source === 'ingredient' ? 0 : 1),
    need: (r) => r.need,
    stock: (r) => r.stock,
    packs: (r) => r.packs,
    packPrice: (r) => r.packPrice,
    cost: (r) => r.cost,
  }, { tieBreak: (r) => r.name, locale: LOCALE }), [rows, sortRows]);

  if (rows.length === 0) {
    return (
      <Empty
        icon={ShoppingCart}
        title={t('gw_shop_empty', 'Noch keine geplanten Mengen')}
        desc={t('gw_shop_empty_desc2', 'Trage im Sortiment bei mindestens einem Produkt eine geplante Menge über 0 ein oder bei einer Zutat einen Zusatzbedarf.')}
      />
    );
  }

  const th = (key, label, align) => <SortableTh column={key} label={label} align={align} sort={sort} onSort={toggleSort} />;
  return (
    <table className="data-table gw-shop-table">
      <colgroup>
        <col />
        <col className="gw-shop-col-type" />
        <col className="gw-shop-col-qty" />
        <col className="gw-shop-col-qty" />
        <col className="gw-shop-col-buy" />
        <col className="gw-shop-col-money" />
        <col className="gw-shop-col-money" />
      </colgroup>
      <thead>
        <tr>
          {th('name', t('gw_shop_col_item', 'Artikel'))}
          {th('source', t('gw_shop_col_type', 'Typ'))}
          {th('need', t('gw_shop_col_need', 'Bedarf'))}
          {th('stock', t('gw_col_stock', 'Bestand'))}
          {th('packs', t('gw_shop_col_to_buy', 'Zu kaufen (Packungen)'))}
          {th('packPrice', t('gw_shop_col_pack_price2', 'Preis je Packung'), 'right')}
          {th('cost', t('gw_shop_col_cost', 'Kosten'), 'right')}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.key} className={r.packs === 0 ? 'gw-shop-row-covered' : undefined}>
            <td className="gw-shop-name">{r.name}</td>
            <td>
              <span className={`gw-shop-type ${r.source}`}>
                {r.source === 'ingredient' ? t('gw_shop_type_ingredient', 'Zutat') : t('gw_shop_type_product', 'Produkt')}
              </span>
            </td>
            <td className="dt-mono">{fmtQty(r.need)} <span className="dt-muted">{r.unit}</span></td>
            <td className="dt-mono">
              {r.source === 'ingredient'
                ? <>{fmtQty(r.stock)} <span className="dt-muted">{r.unit}</span></>
                : <span className="dt-muted">–</span>}
            </td>
            <td className="dt-mono">
              {fmtQty(r.packs)} <span className="dt-muted">{r.packLabel || packLabel(r.packType, t)}</span>
              {(r.source === 'product' ? r.packSize !== 1 : r.packType !== 'none') && r.packs > 0 && (
                <span className="dt-muted"> ({fmtQty(r.packs * r.packSize)} {r.unit})</span>
              )}
            </td>
            <td className="num dt-mono">{formatCurrency(r.packPrice)}</td>
            <td className="num dt-mono dt-strong">{formatCurrency(r.cost)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>{t('gw_shop_total', 'Gesamt')}</td>
          <td />
          <td />
          <td />
          <td />
          <td />
          <td className="num dt-mono">{formatCurrency(total)}</td>
        </tr>
      </tfoot>
    </table>
  );
};

/** Ingredient management: all ingredients with their terms of the year; a row click opens the popup. */
const IngredientsTable = ({ ingredients, showInactive, onOpen, t, formatCurrency }) => {
  const { sort, toggleSort, sortRows } = useTableSort({ key: null, dir: null });
  const visible = useMemo(() => ingredients.filter((g) => showInactive || g.active), [ingredients, showInactive]);
  const hasPack = (g) => g.pack_type && g.pack_type !== 'none';
  const sorted = useMemo(() => sortRows(visible, {
    name: (g) => lower(g.name),
    unit: (g) => lower(g.unit || 'Stk'),
    pack_type: (g) => (hasPack(g) ? lower(packLabel(g.pack_type, t)) : null),
    pack_size: (g) => (hasPack(g) ? Number(g.pack_size) : null),
    buy_price: (g) => g.buy_price ?? null,
    extra_qty: (g) => Number(g.extra_qty) || 0,
    stock_qty: (g) => Number(g.stock_qty) || 0,
  }, { tieBreak: (g) => g.name, locale: LOCALE }), [visible, sortRows, t]);

  if (visible.length === 0) {
    return (
      <Empty
        icon={Carrot}
        title={t('gw_ing_empty', 'Noch keine Zutaten')}
        desc={t('gw_ing_empty_desc', 'Lege Zutaten wie Wein, Gewürz oder Becher an und verwende sie in den Rezepten.')}
      />
    );
  }

  const th = (key, label, align) => <SortableTh column={key} label={label} align={align} sort={sort} onSort={toggleSort} />;
  const open = (g) => (e) => {
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onOpen(g, e.currentTarget);
  };
  return (
    <table className="data-table gw-ing-table">
      <colgroup>
        <col />
        <col className="gw-ing-col-unit" />
        <col className="gw-ing-col-pack" />
        <col className="gw-ing-col-qty" />
        <col className="gw-shop-col-money" />
        <col className="gw-ing-col-qty" />
        <col className="gw-ing-col-qty" />
      </colgroup>
      <thead>
        <tr>
          {th('name', t('gw_col_name', 'Name'))}
          {th('unit', t('gw_col_unit', 'Einheit'))}
          {th('pack_type', t('gw_col_pack_type', 'Packungsart'))}
          {th('pack_size', t('gw_col_pack_size', 'Packungsgröße'))}
          {th('buy_price', t('gw_col_buy', 'Einkaufspreis'), 'right')}
          {th('extra_qty', t('gw_col_extra_qty', 'Zusatzbedarf'))}
          {th('stock_qty', t('gw_col_stock', 'Bestand'))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((g) => (
          <tr
            key={g.id}
            className={`gw-ing-row${g.active ? '' : ' gw-shop-row-inactive'}`}
            tabIndex={0}
            onClick={open(g)}
            onKeyDown={open(g)}
            aria-label={`${t('btn_edit', 'Bearbeiten')}: ${g.name}`}
          >
            <td className="gw-shop-name">
              {g.name}
              {!g.active && <span className="gw-shop-badge-inactive">{t('gw_inactive', 'inaktiv')}</span>}
            </td>
            <td>{g.unit || 'Stk'}</td>
            <td>{hasPack(g) ? packLabel(g.pack_type, t) : <span className="dt-muted">–</span>}</td>
            <td className="dt-mono">
              {hasPack(g) ? <>{fmtQty(g.pack_size)} <span className="dt-muted">{g.unit || 'Stk'}</span></> : <span className="dt-muted">–</span>}
            </td>
            <td className="num dt-mono">{g.buy_price == null ? <span className="dt-muted">–</span> : formatCurrency(Number(g.buy_price))}</td>
            <td className="dt-mono">{fmtQty(g.extra_qty)} <span className="dt-muted">{g.unit || 'Stk'}</span></td>
            <td className="dt-mono">{fmtQty(g.stock_qty)} <span className="dt-muted">{g.unit || 'Stk'}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

/** Recipes of the active Sortiment products; the button opens the RecipeEditor. */
const RecipesTable = ({ products, ingredients, onEdit, t }) => {
  const { sort, toggleSort, sortRows } = useTableSort({ key: null, dir: null });
  const byId = useMemo(() => new Map(ingredients.map((g) => [g.id, g])), [ingredients]);
  const visible = useMemo(() => products.filter((p) => p.active), [products]);
  const sorted = useMemo(() => sortRows(visible, {
    name: (p) => lower(p.name),
    count: (p) => p.recipe?.length || 0,
    planned: (p) => Number(p.planned_qty) || 0,
  }, { tieBreak: (p) => p.name, locale: LOCALE }), [visible, sortRows]);

  if (visible.length === 0) {
    return <Empty icon={BookOpen} title={t('gw_empty_sortiment', 'Noch keine Artikel im Sortiment')} />;
  }

  const th = (key, label) => <SortableTh column={key} label={label} sort={sort} onSort={toggleSort} />;
  return (
    <table className="data-table gw-recipes-table">
      <colgroup>
        <col className="gw-recipes-col-name" />
        <col />
        <col className="gw-ing-col-qty" />
        <col className="gw-recipes-col-action" />
      </colgroup>
      <thead>
        <tr>
          {th('name', t('gw_recipes_col_product', 'Produkt'))}
          {th('count', t('gw_recipes_col_ingredients', 'Zutaten pro Einheit'))}
          {th('planned', t('gw_col_planned_qty', 'Geplant'))}
          <th aria-label={t('actions', 'Aktionen')} />
        </tr>
      </thead>
      <tbody>
        {sorted.map((p) => (
          <tr key={p.id}>
            <td className="gw-shop-name">{p.name}</td>
            <td className="gw-recipes-parts">
              {p.recipe?.length
                ? p.recipe.map((r, i) => {
                  const g = byId.get(r.ingredient_id);
                  return (
                    <span key={r.ingredient_id} className={g?.active ? undefined : 'gw-recipes-inactive'}>
                      {i > 0 && ', '}
                      {g?.name || t('gw_recipe_unknown', 'Unbekannte Zutat')}
                      {' '}<span className="dt-mono dt-muted">{fmtQty(r.qty_per_unit)} {g?.unit || ''}</span>
                      {!g?.active && ` (${t('gw_inactive', 'inaktiv')})`}
                    </span>
                  );
                })
                : <span className="dt-muted">{t('gw_recipe_none_buy', 'Kein Rezept – wird selbst eingekauft')}</span>}
            </td>
            <td className="dt-mono">{fmtQty(p.planned_qty)} <span className="dt-muted">{p.unit || 'Stk'}</span></td>
            <td className="gw-recipes-action">
              <button
                type="button"
                className="gw-recipes-btn"
                onClick={() => onEdit(p)}
                aria-label={`${t('gw_recipe_title', 'Rezept')}: ${p.name}`}
              >
                <BookOpen size={15} />
                <span>{t('gw_recipe_title', 'Rezept')}</span>
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

/**
 * Einkaufsliste of a Verkaufsaktion (generic on `action`), three sub-views:
 *  - Einkaufsliste: computed by buildShoppingList from the Sortiment's planned quantities + recipes, the ingredients'
 *    Zusatzbedarf and Bestand (read-only).
 *  - Zutaten: ingredient management (useGluehweinIngredients); row click opens GluehweinIngredientModal.
 *  - Rezepte: recipe per Sortiment product (RecipeEditor).
 * Locked year: terms (price, pack, Zusatzbedarf, Bestand) read-only; names/units and recipes stay editable.
 */
const GluehweinEinkaufsliste = ({ action, year, yearLocked }) => {
  const t = useT();
  const formatCurrency = useCurrency();
  const { fetchItems } = useGluehweinCatalog();
  const { fetchIngredients, saveIngredient, saveIngredientTerms, deleteIngredient } = useGluehweinIngredients();
  const [view, setView] = useState('list');
  const [data, setData] = useState({ year: null, products: [], ingredients: [] });
  const [error, setError] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState(null); // null | { ingredient: row | null, triggerRef }
  const [recipeFor, setRecipeFor] = useState(null); // product row
  const addRef = useRef(null);
  const rowTriggerRef = useRef(null);
  const loading = data.year !== year;

  const load = useCallback(async (y) => {
    const [products, ingredients] = await Promise.all([fetchItems(y), fetchIngredients(y)]);
    setData({ year: y, products: products || [], ingredients: ingredients || [] });
  }, [fetchItems, fetchIngredients]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [products, ingredients] = await Promise.all([fetchItems(year), fetchIngredients(year)]);
        if (!cancelled) { setData({ year, products: products || [], ingredients: ingredients || [] }); setError(null); }
      } catch {
        if (!cancelled) {
          setData({ year, products: [], ingredients: [] });
          setError(t('gw_shop_load_error', 'Einkaufsliste konnte nicht geladen werden.'));
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const reloadSafe = async () => {
    try {
      await load(year);
    } catch {
      setError(t('gw_shop_load_error', 'Einkaufsliste konnte nicht geladen werden.'));
    }
  };

  // Throws on failure so the popup shows its error and stays open.
  const handleSave = async ({ ingredient, terms }) => {
    const id = await saveIngredient(ingredient);
    if (terms && !yearLocked) await saveIngredientTerms(year, id || ingredient.id, terms);
    setModal(null);
    await reloadSafe();
  };
  const handleDeactivate = async () => {
    await deleteIngredient(modal.ingredient.id);
    setModal(null);
    await reloadSafe();
  };
  const handleReactivate = async () => {
    const g = modal.ingredient;
    await saveIngredient({ id: g.id, name: g.name, unit: g.unit, active: 1 });
    setModal(null);
    await reloadSafe();
  };
  const handleRecipeSaved = async () => {
    setRecipeFor(null);
    await reloadSafe();
  };

  const openIngredient = (ingredient, el) => {
    rowTriggerRef.current = el;
    setModal({ ingredient, triggerRef: rowTriggerRef });
  };

  const inactiveCount = data.ingredients.filter((g) => !g.active).length;
  const actionLabel = action?.label || '';
  const views = [
    { value: 'list', label: t('gw_shop_title', 'Einkaufsliste'), icon: <ListChecks size={15} /> },
    { value: 'ingredients', label: t('gw_ing_title', 'Zutaten'), icon: <Carrot size={15} />, count: data.ingredients.filter((g) => g.active).length },
    { value: 'recipes', label: t('gw_recipes_title', 'Rezepte'), icon: <BookOpen size={15} /> },
  ];

  return (
    <div className="gw-shop" role="region" data-action={action?.key} aria-label={`${t('gw_shop_title', 'Einkaufsliste')}${actionLabel ? ` ${actionLabel}` : ''}`}>
      <div className="gw-shop-toolbar">
        <div className="gw-shop-toolbar-left">
          <SegmentedToggle ariaLabel={t('gw_shop_view', 'Ansicht Einkaufsliste')} value={view} onChange={setView} options={views} />
          {yearLocked && (
            <span className="gw-shop-locked">
              <Lock size={14} />
              <span>
                {view === 'list'
                  ? t('gw_shop_locked', 'Dieses Jahr ist abgeschlossen. Die Liste ist nur zur Ansicht.')
                  : t('gw_ing_locked', 'Jahr gesperrt: Preise, Zusatzbedarf und Bestand sind schreibgeschützt.')}
              </span>
            </span>
          )}
          {view === 'ingredients' && inactiveCount > 0 && (
            <label className="gw-shop-inactive-toggle">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              {t('gw_show_inactive', 'Inaktive anzeigen')} ({inactiveCount})
            </label>
          )}
        </div>
        {view === 'ingredients' && (
          <Button ref={addRef} variant="primary" size="md" icon={Plus} onClick={() => setModal({ ingredient: null, triggerRef: addRef })}>
            {t('gw_ing_add', 'Zutat hinzufügen')}
          </Button>
        )}
      </div>

      <div className="data-table-container">
        {loading ? (
          <Empty icon={ShoppingCart} title={t('loading', 'Laden…')} />
        ) : error ? (
          <Empty icon={ShoppingCart} title={error} />
        ) : view === 'list' ? (
          <ShoppingTable products={data.products} ingredients={data.ingredients} t={t} formatCurrency={formatCurrency} />
        ) : view === 'ingredients' ? (
          <IngredientsTable
            ingredients={data.ingredients}
            showInactive={showInactive}
            onOpen={openIngredient}
            t={t}
            formatCurrency={formatCurrency}
          />
        ) : (
          <RecipesTable products={data.products} ingredients={data.ingredients} onEdit={setRecipeFor} t={t} />
        )}
      </div>

      {modal && (
        <GluehweinIngredientModal
          ingredient={modal.ingredient}
          year={year}
          yearLocked={yearLocked}
          onSave={handleSave}
          onDeactivate={handleDeactivate}
          onReactivate={handleReactivate}
          onCancel={() => setModal(null)}
          triggerRef={modal.triggerRef}
        />
      )}

      {recipeFor && (
        <RecipeEditor
          product={recipeFor}
          ingredients={data.ingredients}
          onClose={() => setRecipeFor(null)}
          onSaved={handleRecipeSaved}
        />
      )}
    </div>
  );
};

export default GluehweinEinkaufsliste;
