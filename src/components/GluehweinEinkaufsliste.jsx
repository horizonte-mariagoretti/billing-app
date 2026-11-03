import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ShoppingCart, Lock, Plus, Carrot, BookOpen, ListChecks, ChevronDown, ChevronRight } from 'lucide-react';
import { useGluehweinCatalog } from '../hooks/useGluehweinCatalog';
import { useGluehweinIngredients } from '../hooks/useGluehweinIngredients';
import useCurrency from '../hooks/useCurrency';
import useTableSort from '../hooks/useTableSort';
import { useT } from '../hooks/useUiTranslations';
import { buildShoppingList } from '../utils/gluehweinShoppingList';
import SegmentedToggle from './SegmentedToggle';
import SortableTh from './SortableTh';
import Button from './Button';
import DecimalInput from './DecimalInput';
import { editableRowProps } from './editableRow';
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

/**
 * Computed shopping list, like the Lasagnen Einkaufsliste: two collapsible sections.
 *  - Getränke: every product with Einkauf, by name. A recipe drink has a toggle in its name cell that shows its own
 *    need per ingredient (informational, its cost is already in the Zutaten).
 *  - Zutaten: the actual purchase list, each ingredient once (all drinks + Zusatzbedarf) with an editable Bestand,
 *    packs and cost. The sort headers apply to these rows only.
 */
const ShoppingTable = ({ products, ingredients, yearLocked, onStockSave, t, formatCurrency }) => {
  const { sort, toggleSort, sortRows } = useTableSort({ key: null, dir: null });
  const [collapsed, setCollapsed] = useState(() => new Set()); // section keys whose rows are hidden
  const [openDrinks, setOpenDrinks] = useState(() => new Set()); // recipe drinks showing their ingredients
  const drafts = useRef({}); // ingredient id -> typed Bestand, saved on blur
  const flip = (setter) => (key) => setter((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleSection = flip(setCollapsed);
  const toggleDrink = flip(setOpenDrinks);

  const { drinks, ingRows, total } = useMemo(() => {
    // The shopping list is driven by Einkauf (purchase_qty, buy units). Liter products: sold and bought in liters,
    // a buy unit holds pack_liters. Other products: sold per portion, a buy unit holds pack_size portions.
    const isLiter = (p) => p.plan_unit === 'liter';
    const shopProducts = products.map((p) => (isLiter(p) ? { ...p, unit: 'l' } : p));
    const productTerms = new Map(products.map((p) => [p.id, isLiter(p)
      ? { ...p, pack_size: Number(p.pack_liters) || 1 }
      : p]));
    const ingredientTerms = new Map(ingredients.map((g) => [g.id, g]));
    const recipe = products.flatMap((p) => (p.recipe || []).map((r) => ({ product_id: p.id, ...r })));
    const result = buildShoppingList({ products: shopProducts, ingredients, productTerms, ingredientTerms, recipe });
    // Zutaten unsorted: by name. Drinks keep the util's name order.
    const list = [...result.ingredients].sort((a, b) => a.name.localeCompare(b.name, LOCALE));
    return { drinks: result.drinks, ingRows: list, total: result.total };
  }, [products, ingredients]);

  const sorted = useMemo(() => sortRows(ingRows, {
    name: (r) => lower(r.name),
    need: (r) => r.need,
    stock: (r) => r.stock,
    packs: (r) => r.packs,
    packPrice: (r) => r.packPrice,
    cost: (r) => r.cost,
  }, { tieBreak: (r) => r.name, locale: LOCALE }), [ingRows, sortRows]);

  if (ingRows.length === 0 && drinks.length === 0) {
    return (
      <Empty
        icon={ShoppingCart}
        title={t('gw_shop_empty', 'Noch keine Einkaufsmengen')}
        desc={t('gw_shop_empty_desc3', 'Trage im Sortiment bei einem Produkt eine Einkauf-Menge über 0 ein, oder bei einer Zutat einen Zusatzbedarf.')}
      />
    );
  }

  const th = (key, label, align) => <SortableTh column={key} label={label} align={align} sort={sort} onSort={toggleSort} />;
  const chevron = (open) => (open ? <ChevronDown size={16} /> : <ChevronRight size={16} />);
  // Section header row, like the Lasagnen shops.
  const sectionHeader = (key, label) => (
    <tr className="shop-section">
      <th colSpan={7}>
        <button type="button" className="shop-toggle" aria-expanded={!collapsed.has(key)} onClick={() => toggleSection(key)}>
          {chevron(!collapsed.has(key))}
          <span>{label}</span>
        </button>
      </th>
    </tr>
  );
  const dash = <span className="dt-muted">–</span>;
  const saveStock = (r) => () => {
    if (!(r.id in drafts.current)) return;
    const n = Math.max(0, Number(drafts.current[r.id]) || 0);
    delete drafts.current[r.id];
    if (n !== r.stock) onStockSave(r.id, n);
  };
  return (
    <table className="data-table gw-shop-table">
      <colgroup>
        <col />
        <col className="gw-shop-col-buy" />
        <col className="gw-shop-col-qty" />
        <col className="gw-shop-col-unit" />
        <col className="gw-shop-col-buy" />
        <col className="gw-shop-col-money" />
        <col className="gw-shop-col-money" />
      </colgroup>
      <thead>
        <tr>
          {th('name', t('gw_shop_col_item', 'Artikel'))}
          {th('need', t('gw_shop_col_need', 'Bedarf'))}
          {th('stock', t('gw_col_stock', 'Bestand'), 'right')}
          <th className="shop-unit" aria-hidden="true" />
          {th('packs', t('gw_shop_col_to_buy', 'Zu kaufen (Packungen)'))}
          {th('packPrice', t('gw_shop_col_pack_price2', 'Preis je Packung'), 'right')}
          {th('cost', t('gw_shop_col_cost', 'Kosten'), 'right')}
        </tr>
      </thead>
      {drinks.length > 0 && (
        <tbody>
          {sectionHeader('drinks', t('gw_shop_section_drinks', 'Getränke'))}
          {!collapsed.has('drinks') && drinks.flatMap((d) => {
            const open = openDrinks.has(d.key);
            const unitLabel = d.packLabel || t('gw_pack_none', 'Stk');
            return [
              <tr key={d.key}>
                <td className="gw-shop-name">
                  {d.hasRecipe ? (
                    <button type="button" className="shop-toggle" aria-expanded={open} onClick={() => toggleDrink(d.key)}>
                      {chevron(open)}
                      <span>{d.name}</span>
                    </button>
                  ) : d.name}
                </td>
                <td className="dt-mono">
                  {d.hasRecipe
                    ? <>{fmtQty(d.packs)} <span className="dt-muted">{unitLabel} ({fmtQty(d.need)} {d.unit})</span></>
                    : <>{fmtQty(d.need)} <span className="dt-muted">{d.unit}</span></>}
                </td>
                <td className="num">{dash}</td>
                <td className="shop-unit" />
                <td className="dt-mono">
                  {fmtQty(d.packs)} <span className="dt-muted">{unitLabel}</span>
                  {!d.hasRecipe && d.packSize !== 1 && <span className="dt-muted"> ({fmtQty(d.need)} {d.unit})</span>}
                </td>
                <td className="num dt-mono">{formatCurrency(d.packPrice)}</td>
                <td className="num dt-mono dt-strong">{formatCurrency(d.cost)}</td>
              </tr>,
              // Recipe drink opened: its own need per ingredient (Bedarf only).
              ...(open ? d.lines.map((l) => (
                <tr key={l.key} className="gw-shop-line">
                  <td>{l.name}</td>
                  <td className="dt-mono">{fmtQty(l.need)} <span className="dt-muted">{l.unit}</span></td>
                  <td colSpan={5} />
                </tr>
              )) : []),
            ];
          })}
        </tbody>
      )}
      {ingRows.length > 0 && (
        <tbody>
          {sectionHeader('ingredients', t('gw_ing_title', 'Zutaten'))}
          {!collapsed.has('ingredients') && sorted.map((r) => (
            <tr key={r.key} className={r.packs === 0 ? 'gw-shop-row-covered' : undefined}>
              <td className="gw-shop-name">{r.name}</td>
              <td className="dt-mono">{fmtQty(r.need)} <span className="dt-muted">{r.unit}</span></td>
              <td className="num">
                <DecimalInput
                  min="0"
                  className="shop-stock-input"
                  value={r.stock}
                  disabled={yearLocked}
                  placeholder="0"
                  onChange={(e) => { drafts.current[r.id] = e.target.value; }}
                  onBlur={saveStock(r)}
                  onFocus={(e) => e.target.select()}
                  aria-label={`${t('gw_col_stock', 'Bestand')}: ${r.name}`}
                />
              </td>
              <td className="shop-unit dt-mono dt-muted">{r.unit}</td>
              <td className="dt-mono">
                {fmtQty(r.packs)} <span className="dt-muted">{packLabel(r.packType, t)}</span>
                {r.packType !== 'none' && r.packs > 0 && (
                  <span className="dt-muted"> ({fmtQty(r.packs * r.packSize)} {r.unit})</span>
                )}
              </td>
              <td className="num dt-mono">{formatCurrency(r.packPrice)}</td>
              <td className="num dt-mono dt-strong">{formatCurrency(r.cost)}</td>
            </tr>
          ))}
        </tbody>
      )}
      <tfoot>
        <tr>
          {/* The util's total: Zutaten + drinks without recipe; recipe drinks are already in their ingredients. */}
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
    planned: (p) => Number(p.portions) || 0,
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
          {th('planned', t('gw_col_left', 'Übrig'))}
          <th aria-label={t('actions', 'Aktionen')} />
        </tr>
      </thead>
      <tbody>
        {sorted.map((p) => (
          <tr key={p.id} {...editableRowProps(() => onEdit(p), `${t('gw_recipe_title', 'Rezept')} bearbeiten: ${p.name}`)}>
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
            <td className="dt-mono">{p.portions == null ? '–' : fmtQty(p.portions)} <span className="dt-muted">{p.unit || 'Stk'}</span></td>
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
 *  - Einkaufsliste: computed by buildShoppingList from the Sortiment's Einkauf (per product), its recipes and the
 *    ingredients' Zusatzbedarf and Bestand: section Getränke (recipe drinks open to their own need per ingredient),
 *    section Zutaten (the purchase list: packs and cost; Bestand editable, saved on blur).
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
  const [saveError, setSaveError] = useState(null); // Bestand save failed (list stays visible)
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
  // Bestand typed in the Einkaufsliste: shown at once (Zu kaufen follows), saved with the other terms as stored,
  // then reloaded so the list shows what the DB holds.
  const handleStockSave = async (id, stock) => {
    const g = data.ingredients.find((x) => x.id === id);
    if (!g || yearLocked) return;
    setData((prev) => ({ ...prev, ingredients: prev.ingredients.map((x) => (x.id === id ? { ...x, stock_qty: stock } : x)) }));
    try {
      await saveIngredientTerms(year, id, {
        buy_price: g.buy_price, pack_type: g.pack_type, pack_size: g.pack_size, extra_qty: g.extra_qty, stock_qty: stock,
      });
      setSaveError(null);
    } catch {
      setSaveError(t('gw_shop_save_error', 'Bestand konnte nicht gespeichert werden.'));
    }
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

      {view === 'list' && saveError && <div className="page-error">{saveError}</div>}

      <div className="data-table-container">
        {loading ? (
          <Empty icon={ShoppingCart} title={t('loading', 'Laden…')} />
        ) : error ? (
          <Empty icon={ShoppingCart} title={error} />
        ) : view === 'list' ? (
          <ShoppingTable
            products={data.products}
            ingredients={data.ingredients}
            yearLocked={yearLocked}
            onStockSave={handleStockSave}
            t={t}
            formatCurrency={formatCurrency}
          />
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
