import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import useLasagnen from '../hooks/useLasagnen';
import useSettings from '../hooks/useSettings';
import useCurrency from '../hooks/useCurrency';
import useYear from '../hooks/useYear';
import { useT } from '../hooks/useUiTranslations';
import DecimalInput from '../components/DecimalInput';
import YearSwitcher from '../components/YearSwitcher';
import SegmentedToggle from '../components/SegmentedToggle';
import SettingsFieldsModal from '../components/SettingsFieldsModal';
import SortableTh from '../components/SortableTh';
import useTableSort from '../hooks/useTableSort';
import { heatColor } from '../utils/heatColor';
import { Search, AlertCircle, UtensilsCrossed, Tag, Beef, Leaf, LayoutList, ShoppingCart, Lock, ChevronDown, ChevronRight } from 'lucide-react';
import { lasagnaShares, bonusReductionPct, lasagnaBonusFromSettings } from '../utils/lasagnaBonus';
import { SHOP_STORES, shoppingList, itemToBuy, displayUnit, stockSettingKey } from '../utils/lasagnaShoppingList';
import '../components/DataTable.css';
import './Lasagnen.css';

const fullName = (h) => `${h.first_name || ''} ${h.last_name || ''}`.trim();
const isActive = (h) => h.active === 1 || h.active === true;
const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const toCount = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
// '' / null -> null (not entered), otherwise a finite number or NaN (invalid).
const parseFinal = (v) => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
const round2 = (n) => Math.round(n * 100) / 100;

const toRowState = (r) => {
  const saved = parseFinal(r.final_amount);
  const savedFinal = Number.isFinite(saved) ? saved : null;
  return {
    ...r,
    bolo: String(toCount(r.bolo)),
    veggie: String(toCount(r.veggie)),
    paid: r.paid ? 1 : 0,
    savedFinal,                                           // last persisted value
    final: savedFinal === null ? '' : String(savedFinal), // what's in the input (dot decimal)
  };
};

/* ── Einkaufsliste: ingredient totals for the Veggie lasagnes shown (per-container amounts × count) ── */

// qty is in the item's base unit (see itemNeed / itemToBuy); shown in the row's display unit.
const fmtShopAmount = (item, qty, locale, display) => {
  const fmt = (n, digits) => n.toLocaleString(locale, { maximumFractionDigits: digits });
  if (display.factor > 1) return `${fmt(qty / display.factor, 2)} ${display.unit}`;
  if (item.unit === 'TL') {
    const tl = `${fmt(qty, 2)} TL`;
    return item.gramsPerTl ? `${tl} (${fmt(Math.round(qty * item.gramsPerTl), 0)} g)` : tl;
  }
  return `${fmt(qty, 0)} ${item.unit}`; // Stk., Bund, Packungen: whole units
};

/* ── Page ─────────────────────────────────────────────────── */

const Lasagnen = () => {
  const { fetchOrders, saveOrder } = useLasagnen();
  const { loadYearSettings, saveYearSettings } = useSettings();
  const { selectedYear, isLocked: yearLocked } = useYear();
  const t = useT();

  const [settings, setSettings] = useState(null);
  const [rows, setRows] = useState([]);
  const [loadedYear, setLoadedYear] = useState(null);
  const loading = loadedYear !== selectedYear;
  const [error, setError] = useState(null);
  const [view, setView] = useState('overview'); // 'overview' | 'shopping'
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  // Shared table sort: none → asc → desc → none. Default: Name A→Z.
  const { sort, toggleSort, sortRows } = useTableSort({ key: 'name', dir: 'asc' });
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [collapsedStores, setCollapsedStores] = useState(() => new Set()); // Einkaufsliste sections folded away
  const priceBtnRef = useRef(null);

  const formatCurrency = useCurrency(settings);

  // Load per year: reruns when the selected year changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, o] = await Promise.all([loadYearSettings(selectedYear), fetchOrders(selectedYear)]);
        if (cancelled) return;
        setSettings(s);
        setRows((o || []).map(toRowState));
      } catch {
        if (!cancelled) setError(t('lasagnen_load_error', 'Lasagnen konnten nicht geladen werden.'));
      } finally {
        if (!cancelled) setLoadedYear(selectedYear);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear]);

  // One price per lasagne for all styles. Missing/empty keys (e.g. older data) simply read as 0.
  const price = num(settings?.lasagna_price);
  // Optional volume discount: from N lasagnes per Hori (Bolo + Veggie), EVERY lasagne of that
  // Hori costs the discount price of its type. Empty/0 threshold = no discount; empty/0 discount
  // price for a type = that type keeps its base price.
  const discountFrom = toCount(settings?.lasagna_discount_from);
  const discountPrice = num(settings?.lasagna_discount_price);
  const hasDiscount = discountFrom > 0 && discountPrice > 0;

  // Betrag min = (Bolo + Veggie) × applicable price (discounted once the threshold is reached).
  // Betrag final is entered by the user; below Betrag min it is only highlighted.
  const amountsFor = (r) => {
    const n = toCount(r.bolo) + toCount(r.veggie);
    const discounted = hasDiscount && n >= discountFrom;
    return { min: round2(n * (discounted ? discountPrice : price)), discounted };
  };

  // Lasagnen bonus: share over ALL active Horis (independent of search / "Inaktive anzeigen").
  const bonus = lasagnaBonusFromSettings(settings);
  const shares = useMemo(() => lasagnaShares(rows), [rows]);
  const locale = settings?.locale || 'de-DE';
  const fmtPct = (v) => `${(Number(v) || 0).toLocaleString(locale, { maximumFractionDigits: 1 })} %`;
  // null = ok (or empty), otherwise an error message for the Betrag final field.
  const finalError = (r, min) => {
    const v = parseFinal(r.final);
    if (v === null) return null;
    if (Number.isNaN(v) || v < 0) return t('lasagnen_final_invalid', 'Ungültiger Betrag');
    if (round2(v) < min) return t('lasagnen_final_below_min', 'Unter dem Mindestbetrag');
    return null;
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (showInactive || isActive(r)) && (!q || fullName(r).toLowerCase().includes(q)));
  }, [rows, search, showInactive]);

  // Heat range over the shares of the rows shown (like the Horis page).
  const shownShares = visible.map((r) => shares.get(r.hori_id)?.sharePct).filter((v) => v > 0);
  const maxShare = Math.max(0, ...shownShares);
  const minShare = shownShares.length ? Math.min(...shownShares) : 0;

  // Persists savedFinal (last parseable Betrag final). Values below Betrag min are saved too; they are only highlighted.
  const persist = useCallback(async (row) => {
    try {
      await saveOrder(selectedYear, { ...row, final_amount: row.savedFinal });
    } catch {
      setError(t('lasagnen_save_error', 'Änderung konnte nicht gespeichert werden.'));
    }
  }, [saveOrder, selectedYear, t]);

  const updateRow = (horiId, patch) => {
    setRows((prev) => prev.map((r) => (r.hori_id === horiId ? { ...r, ...patch } : r)));
  };

  // Paid rows are locked: their inputs are disabled, and these handlers ignore them as well.
  const handleCountChange = (row, field) => (e) => {
    if (row.paid || yearLocked) return;
    updateRow(row.hori_id, { [field]: e.target.value.replace(/\D/g, '') });
  };
  const handleCountBlur = (row, field) => () => {
    if (row.paid || yearLocked) return;
    const normalised = String(toCount(row[field]));
    updateRow(row.hori_id, { [field]: normalised });
    persist({ ...row, [field]: normalised });
  };
  const handleFinalChange = (row) => (e) => {
    if (row.paid || yearLocked) return;
    updateRow(row.hori_id, { final: e.target.value });
  };
  const handleFinalBlur = (row) => () => {
    if (row.paid || yearLocked) return;
    const v = parseFinal(row.final);
    if (Number.isNaN(v) || v < 0) return; // unparseable: keep the last saved value (DecimalInput already blocks this)
    const savedFinal = v === null ? null : round2(v);
    updateRow(row.hori_id, { savedFinal });
    persist({ ...row, savedFinal });
  };
  const handlePaidChange = (row) => (e) => {
    if (yearLocked) return;
    const paid = e.target.checked ? 1 : 0;
    // Locking drops any unsaved (invalid) Betrag final text back to the saved value.
    const patch = paid
      ? { paid, final: row.savedFinal === null ? '' : String(row.savedFinal) }
      : { paid };
    updateRow(row.hori_id, patch);
    persist({ ...row, paid });
  };

  const totals = visible.reduce((acc, r) => {
    const a = amountsFor(r);
    acc.bolo += toCount(r.bolo);
    acc.veggie += toCount(r.veggie);
    acc.amountMin += a.min;
    acc.amountFinal += num(r.savedFinal);
    if (r.paid) acc.paid += 1;
    return acc;
  }, { bolo: 0, veggie: 0, amountMin: 0, amountFinal: 0, paid: 0 });

  const tierText = hasDiscount
    ? `${t('lasagnen_discount_from', 'ab')} ${discountFrom} ${t('lasagnen_pieces', 'Stk.')}: ${formatCurrency(discountPrice)}`
    : t('lasagnen_discount_none', 'kein Mengenrabatt');

  /* ── render ── */

  const renderEmpty = (title, desc) => (
    <div className="lasagnen-empty">
      <UtensilsCrossed size={36} strokeWidth={1.4} />
      <div className="lasagnen-empty-title">{title}</div>
      {desc && <div className="lasagnen-empty-desc">{desc}</div>}
    </div>
  );

  const emptyState = () => {
    if (loading) return renderEmpty(t('loading', 'Laden…'));
    if (search) return renderEmpty(`${t('horis_no_match', 'Keine Horis gefunden für')} "${search}"`, t('try_different_search', 'Versuche einen anderen Suchbegriff.'));
    return renderEmpty(t('lasagnen_no_horis', 'Noch keine aktiven Horis'));
  };

  const renderSummary = () => (
    <div className="lasagnen-summary">
      <button
        type="button"
        ref={priceBtnRef}
        className="lasagnen-summary-card lasagnen-summary-card-btn"
        onClick={() => setShowPriceModal(true)}
        disabled={!settings || yearLocked}
        title={t('lasagnen_price_edit', 'Preise bearbeiten')}
        aria-label={`${t('lasagnen_price_edit', 'Preise bearbeiten')}: ${formatCurrency(price)}, ${tierText}`}
      >
        <div className="lasagnen-summary-icon amber"><Tag size={20} /></div>
        <div className="lasagnen-summary-body">
          <div className="lasagnen-summary-label">{t('lasagnen_price_card', 'Lasagnen-Preis')}</div>
          <div className="lasagnen-summary-value">
            {formatCurrency(price)}
            {hasDiscount && <> / {formatCurrency(discountPrice)}</>}
          </div>
        </div>
      </button>
      <div className="lasagnen-summary-card">
        <div className="lasagnen-summary-icon bolo"><Beef size={20} /></div>
        <div>
          <div className="lasagnen-summary-label">{t('lasagnen_total_bolo', 'Total Bolo')}</div>
          <div className="lasagnen-summary-value">{totals.bolo} {t('lasagnen_pieces', 'Stk.')}</div>
        </div>
      </div>
      <div className="lasagnen-summary-card">
        <div className="lasagnen-summary-icon veggie"><Leaf size={20} /></div>
        <div>
          <div className="lasagnen-summary-label">{t('lasagnen_total_veggie', 'Total Veggie')}</div>
          <div className="lasagnen-summary-value">{totals.veggie} {t('lasagnen_pieces', 'Stk.')}</div>
        </div>
      </div>
    </div>
  );

  /* ── sorting: shared hook + header (same as the Horis table) ── */
  // Sorts the visible (filtered) rows only. Missing values sink to the bottom; ties fall back to name.
  const sortedRows = sortRows(visible, {
    name: (r) => fullName(r).toLowerCase(),
    bolo: (r) => toCount(r.bolo),
    veggie: (r) => toCount(r.veggie),
    share: (r) => shares.get(r.hori_id)?.sharePct ?? null, // inactive: no share
    min: (r) => amountsFor(r).min,
    final: (r) => r.savedFinal, // null = not entered
    paid: (r) => (r.paid ? 1 : 0),
  }, { tieBreak: fullName, locale });
  const sortTh = (key, label, align = 'left') => (
    <SortableTh column={key} label={label} align={align} sort={sort} onSort={toggleSort} />
  );

  const renderTable = () => {
    if (loading || visible.length === 0) return <div className="data-table-container">{emptyState()}</div>;
    return (
      <div className="data-table-container">
        <table className="data-table lasagnen-table">
          <thead>
            <tr>
              {sortTh('name', t('horis_col_name', 'Name'))}
              {sortTh('bolo', t('lasagnen_col_bolo', 'Bolo'))}
              {sortTh('veggie', t('lasagnen_col_veggie', 'Veggie'))}
              {sortTh('share', t('lasagnen_col_share', 'Anteil %'))}
              {bonus.enabled && <th>{t('lasagnen_col_bonus', 'Bonus %')}</th>}
              {sortTh('min', t('lasagnen_col_amount_min', 'Betrag min'), 'right')}
              {sortTh('final', t('lasagnen_col_amount_final', 'Betrag final'), 'right')}
              {sortTh('paid', t('lasagnen_col_paid', 'Bezahlt'))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => {
              const a = amountsFor(r);
              const name = fullName(r);
              const share = shares.get(r.hori_id); // undefined for inactive Horis
              const locked = !!r.paid || yearLocked;
              const err = finalError(r, a.min); // below min: red highlight only, value is still saved
              const lockTitle = yearLocked
                ? t('lasagnen_year_locked', 'Dieses Jahr ist gesperrt (nur Lesen).')
                : locked ? t('lasagnen_paid_locked', 'Bezahlt – zum Bearbeiten Haken entfernen') : undefined;
              return (
                <tr
                  key={r.hori_id}
                  className={`lasagnen-row${isActive(r) ? '' : ' inactive'}${r.paid ? ' paid' : ''}`}
                >
                  <td className="lasagnen-name-cell">
                    <span>{name}</span>
                    {locked && <Lock size={13} className="lasagnen-lock" aria-label={lockTitle} />}
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="lasagnen-count"
                      value={r.bolo}
                      disabled={locked}
                      readOnly={locked}
                      title={lockTitle}
                      onChange={handleCountChange(r, 'bolo')}
                      onBlur={handleCountBlur(r, 'bolo')}
                      onFocus={(e) => e.target.select()}
                      aria-label={`${t('lasagnen_col_bolo', 'Bolo')}: ${name}`}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="lasagnen-count"
                      value={r.veggie}
                      disabled={locked}
                      readOnly={locked}
                      title={lockTitle}
                      onChange={handleCountChange(r, 'veggie')}
                      onBlur={handleCountBlur(r, 'veggie')}
                      onFocus={(e) => e.target.select()}
                      aria-label={`${t('lasagnen_col_veggie', 'Veggie')}: ${name}`}
                    />
                  </td>
                  <td>
                    {share && share.sharePct > 0 ? (
                      <div className="dt-heat">
                        <span className="dt-mono">{fmtPct(share.sharePct)}</span>
                        <div className="dt-heat-bar" aria-hidden="true">
                          <i
                            style={{
                              width: `${maxShare > 0 ? (share.sharePct / maxShare) * 100 : 0}%`,
                              background: heatColor(maxShare > minShare ? (share.sharePct - minShare) / (maxShare - minShare) : 1),
                            }}
                          />
                        </div>
                      </div>
                    ) : <span className="dt-muted">—</span>}
                  </td>
                  {bonus.enabled && (
                    <td className="dt-mono lasagnen-bonus">
                      {share ? fmtPct(bonusReductionPct({ sharePct: share.sharePct, ...bonus })) : <span className="dt-muted">—</span>}
                    </td>
                  )}
                  <td
                    className={`num dt-mono ${a.discounted ? 'lasagnen-discounted' : 'dt-muted'}`}
                    title={a.discounted ? t('lasagnen_discount_applied', 'Mengenrabatt angewendet') : undefined}
                  >
                    {formatCurrency(a.min)}
                  </td>
                  <td className="num">
                    <DecimalInput
                      min="0"
                      className={`lasagnen-final${err ? ' invalid' : ''}`}
                      value={r.final}
                      disabled={locked}
                      readOnly={locked}
                      onChange={handleFinalChange(r)}
                      onBlur={handleFinalBlur(r)}
                      onFocus={(e) => e.target.select()}
                      placeholder={formatCurrency(a.min)}
                      aria-invalid={err ? 'true' : undefined}
                      aria-label={`${t('lasagnen_col_amount_final', 'Betrag final')}: ${name}`}
                      title={err ? `${err} (${formatCurrency(a.min)})` : lockTitle}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      className="lasagnen-paid"
                      checked={!!r.paid}
                      disabled={yearLocked}
                      title={yearLocked ? lockTitle : undefined}
                      onChange={handlePaidChange(r)}
                      aria-label={`${t('lasagnen_col_paid', 'Bezahlt')}: ${name}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>{t('horis_total', 'Gesamt')}</td>
              <td className="dt-mono">{totals.bolo}</td>
              <td className="dt-mono">{totals.veggie}</td>
              <td />
              {bonus.enabled && <td />}
              <td className="num dt-mono">{formatCurrency(totals.amountMin)}</td>
              <td className="num dt-mono">{formatCurrency(totals.amountFinal)}</td>
              <td className="dt-mono">{totals.paid} / {visible.length}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  const toggleStore = (key) => {
    setCollapsedStores((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Stock on hand is saved as a setting per ingredient in the base unit; the box shows the row's display unit.
  const stockInputValue = (raw, factor) => (raw === undefined || raw === null || raw === '' ? '' : String(num(raw) / factor));
  const handleStockChange = (key, factor) => (e) => {
    const typed = e.target.value;
    const base = typed === '' ? '' : String(Math.round(num(typed) * factor * 1e4) / 1e4);
    setSettings((prev) => ({ ...prev, [key]: base }));
  };
  const handleStockBlur = (key) => () => {
    const n = Math.max(0, num(settings?.[key]));
    setSettings((prev) => ({ ...prev, [key]: String(n) }));
    if (yearLocked) return;
    saveYearSettings(selectedYear, { [key]: n }).catch(() => {
      setError(t('lasagnen_save_error', 'Änderung konnte nicht gespeichert werden.'));
    });
  };

  // Einkaufsliste grouped by shop. Same visible Horis as the Übersicht totals.
  const renderShoppingList = () => {
    if (loading || visible.length === 0) return <div className="data-table-container">{emptyState()}</div>;
    const items = shoppingList({ veggie: totals.veggie, bolo: totals.bolo });
    return (
      <div className="data-table-container">
        <table className="data-table lasagnen-shop-table">
          <thead>
            <tr>
              <th>{t('lasagnen_shop_col_item', 'Zutat')}</th>
              <th className="num">{t('lasagnen_shop_col_total', 'Menge gesamt')}</th>
              <th className="num">{t('lasagnen_shop_col_stock', 'Vorrat')}</th>
              <th className="lasagnen-shop-unit" aria-hidden="true" />
              <th className="num">{t('lasagnen_shop_col_buy', 'Einkaufen')}</th>
            </tr>
          </thead>
          {SHOP_STORES.map((store) => {
            const open = !collapsedStores.has(store.key);
            return (
            <tbody key={store.key}>
              <tr className="lasagnen-shop-section">
                <th colSpan={5}>
                  <button
                    type="button"
                    className="lasagnen-shop-toggle"
                    aria-expanded={open}
                    onClick={() => toggleStore(store.key)}
                  >
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span>{store.label}</span>
                  </button>
                </th>
              </tr>
              {open && items.filter((item) => item.store === store.key).map((item) => {
                const key = stockSettingKey(item);
                const stock = num(settings?.[key]);
                const display = displayUnit(item, item.need);
                return (
                  <tr key={item.key}>
                    <td>{t(`lasagnen_shop_${item.key}`, item.label)}</td>
                    <td className="num dt-mono">{fmtShopAmount(item, item.need, locale, display)}</td>
                    <td className="num">
                      <DecimalInput
                        min="0"
                        className="lasagnen-shop-stock-input"
                        value={stockInputValue(settings?.[key], display.factor)}
                        disabled={!settings || yearLocked}
                        placeholder="0"
                        onChange={handleStockChange(key, display.factor)}
                        onBlur={handleStockBlur(key)}
                        onFocus={(e) => e.target.select()}
                        aria-label={`${t('lasagnen_shop_col_stock', 'Vorrat')}: ${t(`lasagnen_shop_${item.key}`, item.label)}`}
                      />
                    </td>
                    <td className="lasagnen-shop-unit dt-mono dt-muted">{display.unit}</td>
                    <td className="num dt-mono dt-strong">{fmtShopAmount(item, itemToBuy(item, item.need, stock), locale, display)}</td>
                  </tr>
                );
              })}
            </tbody>
            );
          })}
          <tfoot>
            <tr>
              <td>{t('lasagnen_shop_count', 'Veggie-Lasagnen')}</td>
              <td className="num dt-mono">{totals.veggie} {t('lasagnen_pieces', 'Stk.')}</td>
              <td />
              <td />
              <td />
            </tr>
            <tr>
              <td>{t('lasagnen_shop_count_bolo', 'Bolo-Lasagnen')}</td>
              <td className="num dt-mono">{totals.bolo} {t('lasagnen_pieces', 'Stk.')}</td>
              <td />
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  return (
    <div className="lasagnen-page">
      <div className="page-header">
        <div className="search-bar">
          <Search size={18} />
          <input
            type="text"
            placeholder={t('lasagnen_search', 'Horis suchen…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('lasagnen_search', 'Horis suchen…')}
          />
        </div>
        <YearSwitcher />
      </div>

      {error && (
        <div className="page-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="lasagnen-toolbar">
        <SegmentedToggle
          className="seg-toggle-fill"
          ariaLabel={t('horis_view_label', 'Ansicht')}
          value={view}
          onChange={setView}
          options={[
            { value: 'overview', label: t('horis_view_overview', 'Übersicht'), icon: <LayoutList size={15} /> },
            { value: 'shopping', label: t('lasagnen_view_shopping', 'Einkaufsliste'), icon: <ShoppingCart size={15} /> },
          ]}
        />
        <label className="lasagnen-toggle">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          <span>{t('horis_show_inactive', 'Inaktive anzeigen')}</span>
        </label>
      </div>

      {yearLocked && (
        <div className="lasagnen-year-banner" role="status">
          <Lock size={16} />
          <span>{t('lasagnen_year_locked', 'Dieses Jahr ist gesperrt (nur Lesen).')}</span>
        </div>
      )}

      {view === 'overview' && (
        <>
          {renderSummary()}
          {renderTable()}
        </>
      )}

      {view === 'shopping' && renderShoppingList()}

      {showPriceModal && settings && !yearLocked && (
        <SettingsFieldsModal
          title={t('lasagnen_price_card', 'Lasagnen-Preis')}
          description={t('lasagnen_price_modal_desc', 'Grundpreise pro Lasagne und optionaler Mengenrabatt pro Hori.')}
          values={settings}
          saveFn={(patch) => saveYearSettings(selectedYear, patch)}
          triggerRef={priceBtnRef}
          onCancel={() => setShowPriceModal(false)}
          onSaved={(patch) => { setSettings((prev) => ({ ...prev, ...patch })); setShowPriceModal(false); }}
          fields={[
            { key: 'lasagna_price', kind: 'decimal', wide: true, label: t('settings_lasagna_price', 'Preis pro Lasagne'), hint: t('settings_lasagna_price_hint', 'Gilt für Bolo und Veggie.') },
            { key: 'lasagna_discount_from', kind: 'count', allowEmpty: true, wide: true, label: t('settings_lasagna_discount_from', 'Mengenrabatt ab (Lasagnen pro Hori)'), hint: t('settings_lasagna_discount_from_hint', 'Ab dieser Anzahl (Bolo + Veggie) gilt für alle Lasagnen des Horis der Rabattpreis. Leer oder 0 = kein Rabatt.') },
            { key: 'lasagna_discount_price', kind: 'decimal', allowEmpty: true, wide: true, label: t('settings_lasagna_discount_price', 'Rabattpreis pro Lasagne'), hint: t('settings_lasagna_discount_price_hint', 'Leer oder 0 = kein Rabatt.') },
            { key: 'lasagna_bonus_enabled', kind: 'checkbox', label: t('settings_lasagna_bonus_enabled', 'Lasagnen-Bonus aktiv'), hint: t('settings_lasagna_bonus_enabled_hint', 'Der Lasagnen-Anteil eines Horis senkt seinen Lagerbeitrag.') },
            { key: 'lasagna_bonus_factor', kind: 'count', allowEmpty: true, max: 100, suffix: '%', label: t('settings_lasagna_bonus_factor', 'Bonus-Faktor'), placeholder: '100', hint: t('settings_lasagna_bonus_factor_hint', 'Wie viel vom Lasagnen-Anteil als Reduktion gilt: 100 % = voller Anteil, 50 % = halber Anteil.') },
          ]}
        />
      )}
    </div>
  );
};

export default Lasagnen;
