import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, Lock } from 'lucide-react';
import { useGluehweinCatalog } from '../hooks/useGluehweinCatalog';
import useCurrency from '../hooks/useCurrency';
import { useT } from '../hooks/useUiTranslations';
import { buildShoppingList } from '../utils/gluehweinShoppingList';
import './DataTable.css';
import './GluehweinEinkaufsliste.css';

// Sort order of the item kinds (gw_items.kind), then by name.
const KIND_ORDER = ['drink', 'addon', 'beer', 'beer_special', 'ingredient'];
const kindRank = (kind) => {
  const i = KIND_ORDER.indexOf(kind);
  return i === -1 ? KIND_ORDER.length : i;
};

const PACK_LABELS = { kasten: 'Kasten', flasche: 'Flasche', paket: 'Paket' };
const packLabel = (packType, t) => (PACK_LABELS[packType]
  ? t(`gw_pack_${packType}`, PACK_LABELS[packType])
  : t('gw_pack_none', 'Stk'));

const fmtQty = (n, locale) => (Number(n) || 0).toLocaleString(locale, { maximumFractionDigits: 2 });

/**
 * Read-only Einkaufsliste of a Verkaufsaktion (generic on `action`): what to buy for the planned
 * quantities of the scout year. Items + per-year terms + recipes come from useGluehweinCatalog().fetchItems(year);
 * the list itself is computed by buildShoppingList. No stock, no editing. A locked year only shows a note.
 */
const GluehweinEinkaufsliste = ({ action, year, yearLocked }) => {
  const t = useT();
  const formatCurrency = useCurrency();
  const locale = 'de-DE';
  const { fetchItems } = useGluehweinCatalog();
  const [items, setItems] = useState([]);
  const [loadedYear, setLoadedYear] = useState(null);
  const [error, setError] = useState(false);
  const loading = loadedYear !== year;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchItems(year);
        if (!cancelled) { setItems(list || []); setError(false); }
      } catch {
        if (!cancelled) { setItems([]); setError(true); }
      } finally {
        if (!cancelled) setLoadedYear(year);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const { rows, total } = useMemo(() => {
    const terms = new Map();
    const recipe = [];
    for (const it of items) {
      terms.set(it.id, {
        sell_price: it.sell_price,
        buy_price: it.buy_price,
        pack_type: it.pack_type || 'none',
        pack_size: it.pack_size,
        planned_qty: it.planned_qty,
      });
      for (const r of it.recipe || []) {
        recipe.push({ product_id: it.id, ingredient_id: r.ingredient_id, qty_per_unit: r.qty_per_unit });
      }
    }
    const result = buildShoppingList({ items, terms, recipe });
    const byId = new Map(items.map((it) => [it.id, it]));
    const list = (result?.rows || []).map((r) => {
      const id = r.item?.id ?? r.item;
      const item = byId.get(id) || r.item || {};
      const term = terms.get(id) || {};
      const packSize = Number(term.pack_size) > 0 ? Number(term.pack_size) : 1;
      return {
        id,
        name: item.name || '',
        kind: item.kind,
        unit: item.unit || 'Stk',
        packType: term.pack_type || 'none',
        need: Number(r.need) || 0,
        packs: Number(r.packs) || 0,
        packPrice: packSize * (Number(term.buy_price) || 0),
        cost: Number(r.cost) || 0,
      };
    });
    list.sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.name.localeCompare(b.name, locale));
    return { rows: list, total: Number(result?.total) || 0 };
  }, [items]);

  const hasPlan = items.some((it) => Number(it.planned_qty) > 0);
  const actionLabel = action?.label || '';

  return (
    <div className="gw-shop" role="region" data-action={action?.key} aria-label={`${t('gw_shop_title', 'Einkaufsliste')}${actionLabel ? ` ${actionLabel}` : ''}`}>
      {yearLocked && (
        <div className="gw-shop-locked">
          <Lock size={14} />
          <span>{t('gw_shop_locked', 'Dieses Jahr ist abgeschlossen. Die Liste ist nur zur Ansicht.')}</span>
        </div>
      )}

      <div className="data-table-container">
        {loading || error || !hasPlan || rows.length === 0 ? (
          <div className="gw-shop-empty">
            <ShoppingCart size={36} strokeWidth={1.4} />
            <div className="gw-shop-empty-title">
              {loading
                ? t('loading', 'Laden…')
                : error
                  ? t('gw_shop_load_error', 'Einkaufsliste konnte nicht geladen werden.')
                  : t('gw_shop_empty', 'Noch keine geplanten Mengen')}
            </div>
            {!loading && !error && (
              <div className="gw-shop-empty-desc">
                {t('gw_shop_empty_desc', 'Trage bei mindestens einem Produkt eine geplante Menge über 0 ein.')}
              </div>
            )}
          </div>
        ) : (
          <table className="data-table gw-shop-table">
            <colgroup>
              <col />
              <col className="gw-shop-col-qty" />
              <col className="gw-shop-col-qty" />
              <col className="gw-shop-col-money" />
              <col className="gw-shop-col-money" />
            </colgroup>
            <thead>
              <tr>
                <th>{t('gw_shop_col_item', 'Artikel')}</th>
                <th>{t('gw_shop_col_need', 'Bedarf')}</th>
                <th>{t('gw_shop_col_packs', 'Packungen')}</th>
                <th className="num">{t('gw_shop_col_pack_price', 'Einkaufspreis je Packung')}</th>
                <th className="num">{t('gw_shop_col_cost', 'Kosten')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="gw-shop-name">{r.name}</td>
                  <td className="dt-mono">{fmtQty(r.need, locale)} <span className="dt-muted">{r.unit}</span></td>
                  <td className="dt-mono">{fmtQty(r.packs, locale)} <span className="dt-muted">{packLabel(r.packType, t)}</span></td>
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
                <td className="num dt-mono">{formatCurrency(total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
};

export default GluehweinEinkaufsliste;
