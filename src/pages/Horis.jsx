import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import useHoris from '../hooks/useHoris';
import useSettings from '../hooks/useSettings';
import useYear from '../hooks/useYear';
import useCurrency from '../hooks/useCurrency';
import useFocusTrap from '../hooks/useFocusTrap';
import { useT } from '../hooks/useUiTranslations';
import { calcAge, formatTimeRange } from '../utils/jobHours';
import { calcContribution, campRulesFromSettings } from '../utils/campContribution';
import { lasagnaShares, bonusReductionPct, applyBonus, lasagnaBonusFromSettings } from '../utils/lasagnaBonus';
import useDatabase from '../hooks/useDatabase';
import Button from '../components/Button';
import SegmentedToggle from '../components/SegmentedToggle';
import HoriModal from '../components/HoriModal';
import BulkHoriModal from '../components/BulkHoriModal';
import ConfirmDialog from '../components/ConfirmDialog';
import SortableTh from '../components/SortableTh';
import useTableSort from '../hooks/useTableSort';
import { heatColor } from '../utils/heatColor';
import CampBaseDialog from '../components/CampBaseDialog';
import YearSwitcher from '../components/YearSwitcher';
import {
  Plus, ListPlus, Search, Edit2, Trash2, UserX, UserCheck, AlertCircle, Baby, Clock, PiggyBank,
  LayoutList, Grid3x3, X, CalendarDays,
} from 'lucide-react';
import '../components/DataTable.css';
import './Horis.css';

/* ── helpers ─────────────────────────────────────────────── */

const fullName = (h) => `${h.first_name || ''} ${h.last_name || ''}`.trim();
const isActive = (h) => h.active === 1 || h.active === true;
const num = (v) => Number(v) || 0;

function formatDateShort(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y.slice(2)}`;
}

function formatDateLong(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

/* ── Detail modal: one Hori's jobs ───────────────────────── */

const HoriDetail = ({ hori, year, locked, fmtHours, onClose, onEdit }) => {
  const { fetchHoriJobs } = useHoris();
  const t = useT();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const ref = useRef(null);
  useFocusTrap(ref, { active: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchHoriJobs(hori.id, year);
        if (!cancelled) setJobs(rows || []);
      } catch {
        if (!cancelled) setError(t('horis_jobs_load_error', 'Arbeiten konnten nicht geladen werden.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hori.id, year]);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const totals = jobs.reduce((acc, j) => ({
    planned: acc.planned + num(j.planned_hours),
    actual:  acc.actual + num(j.actual_hours),
  }), { planned: 0, actual: 0 });

  const age = hori.birth_date ? calcAge(hori.birth_date) : null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="horis-detail-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content horis-detail" ref={ref}>
        <div className="horis-detail-header">
          <div>
            <h2 id="horis-detail-title">{fullName(hori)}</h2>
            <div className="horis-detail-meta">
              {age != null && <span>{age} {t('horis_years', 'Jahre')}</span>}
              {hori.birth_date && <span>* {formatDateLong(hori.birth_date)}</span>}
              {!isActive(hori) && <span className="horis-badge-inactive">{t('horis_inactive', 'Inaktiv')}</span>}
            </div>
          </div>
          <button type="button" className="horis-icon-btn" onClick={onClose}
            aria-label={t('horis_close', 'Schließen')} title={t('horis_close', 'Schließen')}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="page-error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {!error && (loading || jobs.length === 0) ? (
          <div className="horis-empty">
            <CalendarDays size={32} strokeWidth={1.4} />
            <div className="horis-empty-title">
              {loading ? t('loading', 'Laden…') : t('horis_no_jobs', 'Noch keinen Arbeiten zugeteilt')}
            </div>
          </div>
        ) : !error && (
          <div className="horis-detail-table-wrap">
            <table className="horis-detail-table">
              <thead>
                <tr>
                  <th>{t('horis_col_date', 'Datum')}</th>
                  <th>{t('horis_col_job', 'Arbeit')}</th>
                  <th>{t('horis_col_time', 'Zeit')}</th>
                  <th className="num">{t('horis_col_planned_short', 'Geplant')}</th>
                  <th className="num">{t('horis_col_actual_short', 'Gearbeitet')}</th>
                  <th>{t('horis_col_status', 'Status')}</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(j => {
                  const worked = j.actual_hours != null && j.actual_hours !== '';
                  return (
                    <tr key={j.job_id}>
                      <td className="dt-mono">{formatDateLong(j.date)}</td>
                      <td className="horis-detail-title-cell">{j.title || '—'}</td>
                      <td className="dt-mono">{formatTimeRange(j.start_time, j.end_time, j.open_end, t('jobs_open_prefix', 'ab')) || '—'}</td>
                      <td className="num dt-mono">{j.planned_hours != null ? fmtHours(j.planned_hours) : '—'}</td>
                      <td className="num dt-mono">{worked ? fmtHours(j.actual_hours) : '—'}</td>
                      <td>
                        <span className={`horis-status ${worked ? 'worked' : 'planned'}`}>
                          {worked ? t('horis_status_worked', 'Gearbeitet') : t('horis_status_planned', 'Geplant')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>{t('horis_total', 'Gesamt')}</td>
                  <td className="num dt-mono">{fmtHours(totals.planned)}</td>
                  <td className="num dt-mono">{fmtHours(totals.actual)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={onClose}>{t('horis_close', 'Schließen')}</Button>
          {!locked && (
            <Button variant="secondary" type="button" icon={Edit2} onClick={() => onEdit(hori)}>
              {t('btn_edit', 'Bearbeiten')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── Page ─────────────────────────────────────────────────── */

const Horis = () => {
  const { fetchHoriStats, fetchMatrix, deleteHori, saveHori } = useHoris();
  const { loadYearSettings, saveYearSettings } = useSettings();
  const { selectedYear, isLocked: yearLocked } = useYear();
  const { query } = useDatabase();
  const t = useT();

  const [settings, setSettings] = useState(null);
  const [lasagnaRows, setLasagnaRows] = useState([]); // [{ hori_id, active, bolo, veggie }]
  const [stats, setStats] = useState([]);
  const [matrix, setMatrix] = useState({ jobs: [], horis: [], assignments: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('overview'); // 'overview' | 'matrix'
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [countInactive, setCountInactive] = useState(false); // include inactive Horis in totals + Anteil
  // Shared table sort: none → asc → desc → none. Default Name A→Z. Keys: name|age|actual|share|contribution
  const { sort, toggleSort, sortRows } = useTableSort({ key: 'name', dir: 'asc' });
  const [showModal, setShowModal] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const bulkBtnRef = useRef(null);
  const [editingHori, setEditingHori] = useState(null);
  const [confirm, setConfirm] = useState(null);   // { id, name }
  const [detailHori, setDetailHori] = useState(null);
  const [showCampBase, setShowCampBase] = useState(false);
  const campBaseBtnRef = useRef(null);
  const closeCampBase = useCallback(() => setShowCampBase(false), []);
  const handleCampBaseSaved = (patch) => {
    setSettings((s) => ({ ...(s || {}), ...patch }));
    setShowCampBase(false);
  };

  const openBtnRef = useRef(null);
  const formatCurrency = useCurrency(settings);
  const locale = settings?.locale || 'de-DE';
  const fmtHours = useCallback(
    (v) => num(v).toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    [locale]
  );
  const fmtPct = useCallback(
    (v) => `${num(v).toLocaleString(locale, { maximumFractionDigits: 1 })} %`,
    [locale]
  );

  const fetchAll = async () => {
    try {
      const [s, st, mx, lo] = await Promise.all([
        loadYearSettings(selectedYear), fetchHoriStats(selectedYear), fetchMatrix(selectedYear),
        // Lasagne counts per Hori for the bonus; an older DB without the table just means no bonus.
        query(`
          SELECT h.id AS hori_id, h.active,
            COALESCE(o.bolo, 0) AS bolo, COALESCE(o.veggie, 0) AS veggie
          FROM horis h
          LEFT JOIN lasagna_orders o ON o.hori_id = h.id AND o.year = ?
        `, [selectedYear]).catch((err) => {
          // Keep the page usable; log so a real query failure is not silent.
          console.warn('Lasagnen-Bonus übersprungen:', err);
          return [];
        }),
      ]);
      setSettings(s);
      setStats(st || []);
      setLasagnaRows(lo || []);
      setMatrix({
        jobs: mx?.jobs || [],
        horis: mx?.horis || [],
        assignments: mx?.assignments || [],
      });
    } catch {
      setError(t('horis_load_error', 'Horis konnten nicht geladen werden. Bitte die App neu starten.'));
    } finally {
      setLoading(false);
    }
  };
  const load = () => {
    setLoading(true);
    setError(null);
    return fetchAll();
  };

  const [loadedYear, setLoadedYear] = useState(selectedYear);
  if (loadedYear !== selectedYear) {
    setLoadedYear(selectedYear);
    setLoading(true);
    setError(null);
  }

  // The loader is async: its setState calls run after the await. The lint rule can't see that,
  // so it flags the synchronous call here. Left as is on purpose.
  /* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
  useEffect(() => { fetchAll(); }, [selectedYear]);
  /* eslint-enable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

  const baseContribution = num(settings?.camp_base_contribution);
  const campRules = campRulesFromSettings(settings);
  const lasagnaBonus = lasagnaBonusFromSettings(settings);
  const lasagnaShareMap = useMemo(() => lasagnaShares(lasagnaRows), [lasagnaRows]);
  // Lagerbeitrag before and after the (optional) lasagne bonus. Everything on this
  // page that shows or sorts by the contribution goes through contributionInfo.
  const contributionInfo = (h) => {
    const original = calcContribution({ ...campRules, sharePct: h.share_pct });
    const reductionPct = bonusReductionPct({
      sharePct: lasagnaShareMap.get(h.id)?.sharePct ?? 0,
      enabled: lasagnaBonus.enabled,
      factor: lasagnaBonus.factor,
    });
    const final = applyBonus(original, reductionPct);
    return { original, final, reduced: lasagnaBonus.enabled && reductionPct > 0 && final !== original };
  };
  const contributionFor = (h) => contributionInfo(h).final;

  const matchesSearch = useCallback((h) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return fullName(h).toLowerCase().includes(q);
  }, [search]);

  // Shares are computed here (not in the hook) so "Inaktive mitzählen" can switch the basis:
  // off = inactive Horis are left out of the total and of everyone's Anteil, on = they count like actives.
  const shareStats = useMemo(() => {
    const counts = (h) => isActive(h) || countInactive;
    const sum = stats.reduce((s, h) => (counts(h) ? s + num(h.total_actual_hours) : s), 0);
    return stats.map((h) => ({
      ...h,
      share_pct: counts(h) && sum > 0 ? Math.round((10000 * num(h.total_actual_hours)) / sum) / 100 : 0,
    }));
  }, [stats, countInactive]);

  const visibleStats = useMemo(
    () => shareStats.filter(h => (showInactive || isActive(h)) && matchesSearch(h)),
    [shareStats, showInactive, matchesSearch]
  );

  const countedShares = visibleStats.filter(h => isActive(h) || countInactive).map(h => num(h.share_pct));
  const maxShare = Math.max(0, ...countedShares);
  const minShare = countedShares.length ? Math.min(...countedShares) : 0;
  // Missing values (e.g. no birth date) always sink to the bottom, whatever the direction.
  const sortedStats = sortRows(visibleStats, {
    name: (h) => fullName(h).toLowerCase(),
    age: (h) => (h.birth_date ? calcAge(h.birth_date) : null),
    actual: (h) => num(h.total_actual_hours),
    share: (h) => num(h.share_pct),
    contribution: (h) => contributionFor(h),
  }, { tieBreak: fullName, locale });
  const sortTh = (key, label, align = 'left') => (
    <SortableTh column={key} label={label} align={align} sort={sort} onSort={toggleSort} />
  );

  const countedStats = shareStats.filter(h => isActive(h) || countInactive);
  // Inactive Horis are left out of every total unless "Inaktive mitzählen" is on.
  const totalActualHours = countedStats.reduce((s, h) => s + num(h.total_actual_hours), 0);
  const visibleActualHours = visibleStats.filter(h => isActive(h) || countInactive).reduce((s, h) => s + num(h.total_actual_hours), 0);
  const avgContribution = countedStats.length
    ? countedStats.reduce((s, h) => s + contributionFor(h), 0) / countedStats.length
    : 0;

  /* ── handlers ── */

  const handleNew = () => { setEditingHori(null); setShowModal(true); };
  const handleEdit = (h) => { setDetailHori(null); setEditingHori(h); setShowModal(true); };
  const closeModal = useCallback(() => { setShowModal(false); setEditingHori(null); }, []);
  const closeBulk = useCallback(() => setShowBulk(false), []);
  const handleBulkSave = () => { setShowBulk(false); load(); };
  const handleModalSave = () => { setShowModal(false); setEditingHori(null); load(); };
  const closeDetail = useCallback(() => setDetailHori(null), []);

  const toggleActive = async (h) => {
    try {
      await saveHori({
        id: h.id,
        first_name: h.first_name,
        last_name: h.last_name,
        birth_date: h.birth_date,
        active: isActive(h) ? 0 : 1,
      });
      await load();
    } catch {
      setError(t('horis_save_error', 'Hori konnte nicht gespeichert werden.'));
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!confirm) return;
    const target = confirm;
    setConfirm(null);
    try {
      await deleteHori(target.id);
      load();
    } catch (err) {
      if (err?.message === 'HORI_HAS_ASSIGNMENTS') {
        setError(`"${target.name}" ${t('horis_delete_has_assignments', 'ist bereits Arbeiten zugeteilt und kann nicht gelöscht werden. Setze den Hori stattdessen auf inaktiv.')}`);
      } else if (String(err?.message || '').startsWith('HORI_HAS_LASAGNA_ORDERS')) {
        setError(t('horis_delete_has_lasagna_orders', 'Hori hat Lasagnen-Bestellungen. Bitte stattdessen auf inaktiv setzen.'));
      } else {
        setError(t('horis_delete_error', 'Hori konnte nicht gelöscht werden.'));
      }
    }
  };

  /* ── matrix data ── */

  const matrixData = useMemo(() => {
    const jobs = [...matrix.jobs].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    const horis = matrix.horis
      .filter(matchesSearch)
      .sort((a, b) => fullName(a).localeCompare(fullName(b)));
    const cell = new Map();
    matrix.assignments.forEach(a => cell.set(`${a.hori_id}|${a.job_id}`, a));

    const allActual = matrix.assignments.reduce((s, a) => s + num(a.actual_hours), 0);
    const rowTotals = new Map();
    horis.forEach(h => {
      const sum = matrix.assignments
        .filter(a => a.hori_id === h.id)
        .reduce((s, a) => s + num(a.actual_hours), 0);
      rowTotals.set(h.id, { hours: sum, pct: allActual > 0 ? (sum / allActual) * 100 : 0 });
    });
    const colTotals = new Map();
    jobs.forEach(j => {
      const list = matrix.assignments.filter(a => a.job_id === j.id);
      colTotals.set(j.id, {
        actual: list.reduce((s, a) => s + num(a.actual_hours), 0),
        hasActual: list.some(a => a.actual_hours != null && a.actual_hours !== ''),
        planned: list.reduce((s, a) => s + num(a.planned_hours), 0),
        count: list.length,
      });
    });
    return { jobs, horis, cell, rowTotals, colTotals, allActual };
  }, [matrix, matchesSearch]);

  /* ── render ── */

  const renderEmpty = (title, desc) => (
    <div className="horis-empty">
      <Baby size={36} strokeWidth={1.4} />
      <div className="horis-empty-title">{title}</div>
      {desc && <div className="horis-empty-desc">{desc}</div>}
    </div>
  );

  const renderOverview = () => {
    if (!error && (loading || visibleStats.length === 0)) {
      return (
        <div className="data-table-container">
          {loading
            ? renderEmpty(t('loading', 'Laden…'))
            : search
              ? renderEmpty(`${t('horis_no_match', 'Keine Horis gefunden für')} "${search}"`, t('try_different_search', 'Versuche einen anderen Suchbegriff.'))
              : stats.length > 0
                ? renderEmpty(t('horis_no_active', 'Keine aktiven Horis'), t('horis_no_active_hint', 'Aktiviere „Inaktive anzeigen“, um alle Horis zu sehen.'))
                : renderEmpty(t('horis_no_horis', 'Noch keine Horis'), t('horis_no_horis_hint', 'Füge den ersten Hori hinzu, um ihn Arbeiten zuzuteilen.'))}
        </div>
      );
    }
    if (error && stats.length === 0) return null;

    return (
      <div className="data-table-container">
        <table className="data-table horis-table">
          <thead>
            <tr>
              {sortTh('name', t('horis_col_name', 'Name'))}
              {sortTh('age', t('horis_col_age', 'Alter'))}
              {sortTh('actual', t('horis_col_actual', 'Stunden'))}
              {sortTh('share', t('horis_col_share', 'Anteil %'))}
              {sortTh('contribution', t('horis_col_contribution', 'Lagerbeitrag'), 'right')}
              <th className="num" aria-label={t('col_actions', 'Aktionen')} />
            </tr>
          </thead>
          <tbody>
            {sortedStats.map(h => {
              const active = isActive(h);
              const age = h.birth_date ? calcAge(h.birth_date) : null;
              const counted = active || countInactive;
              const share = Math.max(0, Math.min(100, num(h.share_pct)));
              // Colour spans lowest -> highest share of the rows shown; a single row (or all equal) is green.
              const heat = heatColor(maxShare > minShare ? (share - minShare) / (maxShare - minShare) : 1);
              return (
                <tr
                  key={h.id}
                  className={`horis-row${active ? '' : ' inactive'}`}
                  onClick={() => setDetailHori(h)}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') setDetailHori(h); }}
                  aria-label={`${t('horis_show_details', 'Details anzeigen')}: ${fullName(h)}`}
                >
                  <td className="horis-name-cell">
                    <span>{fullName(h)}</span>
                  </td>
                  <td>{age ?? '—'}</td>
                  <td className={`dt-mono ${counted ? 'dt-strong' : 'dt-muted'}`}>{fmtHours(h.total_actual_hours)}</td>
                  <td>
                    {counted ? (
                      <div className="dt-heat">
                        <span className="dt-mono">{fmtPct(share)}</span>
                        <div className="dt-heat-bar" aria-hidden="true">
                          <i style={{ width: `${maxShare > 0 ? (share / maxShare) * 100 : 0}%`, background: active ? heat : 'var(--color-text-dark-tertiary)' }} />
                        </div>
                      </div>
                    ) : <span className="dt-muted">—</span>}
                  </td>
                  <td className="num dt-mono dt-strong">{counted ? (() => {
                    const c = contributionInfo(h);
                    return c.reduced ? (
                      <span className="horis-contribution" title={t('horis_lasagna_bonus_tooltip', 'Reduziert durch Lasagnen-Bonus')}>
                        <s className="horis-contribution-orig">{formatCurrency(c.original)}</s>
                        {formatCurrency(c.final)}
                      </span>
                    ) : formatCurrency(c.final);
                  })() : <span className="dt-muted">—</span>}</td>
                  <td className="num horis-actions">
                    {!yearLocked && <div className="action-btns">
                      <button
                        type="button"
                        title={t('btn_edit', 'Bearbeiten')}
                        aria-label={`${t('btn_edit', 'Bearbeiten')} ${fullName(h)}`}
                        onClick={(e) => { e.stopPropagation(); handleEdit(h); }}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        type="button"
                        title={active ? t('horis_action_deactivate', 'Auf inaktiv setzen') : t('horis_action_activate', 'Aktivieren')}
                        aria-label={`${active ? t('horis_action_deactivate', 'Auf inaktiv setzen') : t('horis_action_activate', 'Aktivieren')}: ${fullName(h)}`}
                        onClick={(e) => { e.stopPropagation(); toggleActive(h); }}
                      >
                        {active ? <UserX size={16} /> : <UserCheck size={16} />}
                      </button>
                      <button
                        type="button"
                        title={t('btn_delete', 'Löschen')}
                        aria-label={`${t('btn_delete', 'Löschen')} ${fullName(h)}`}
                        onClick={(e) => { e.stopPropagation(); setConfirm({ id: h.id, name: fullName(h) }); }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>{t('horis_total', 'Gesamt')}</td>
              <td className="dt-mono">{fmtHours(search.trim() ? visibleActualHours : totalActualHours)}</td>
              <td />
              <td className="num dt-mono" title={t('horis_avg_contribution_tooltip', 'Durchschnittlicher Lagerbeitrag der aktiven Horis')}>
                <span className="horis-foot-label">{t('horis_avg_short', 'Ø')}</span> {formatCurrency(avgContribution)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  const renderMatrix = () => {
    const { jobs, horis, cell, rowTotals, colTotals, allActual } = matrixData;
    if (!error && (loading || horis.length === 0 || jobs.length === 0)) {
      return (
        <div className="data-table-container">
          {loading
            ? renderEmpty(t('loading', 'Laden…'))
            : search && horis.length === 0
              ? renderEmpty(`${t('horis_no_match', 'Keine Horis gefunden für')} "${search}"`, t('try_different_search', 'Versuche einen anderen Suchbegriff.'))
              : horis.length === 0
                ? renderEmpty(t('horis_no_active', 'Keine aktiven Horis'), t('horis_no_horis_hint', 'Füge den ersten Hori hinzu, um ihn Arbeiten zuzuteilen.'))
                : renderEmpty(t('horis_matrix_no_jobs', 'Noch keine Arbeiten'), t('horis_matrix_no_jobs_hint', 'Sobald Arbeiten angelegt sind, erscheinen sie hier als Spalten.'))}
        </div>
      );
    }
    if (error && horis.length === 0) return null;

    return (
      <>
        <div className="horis-legend" aria-hidden="true">
          <span><i className="horis-legend-swatch worked" /> {t('horis_legend_worked', 'Gearbeitet (Std.)')}</span>
          <span><i className="horis-legend-swatch planned" /> {t('horis_legend_planned', 'Zugeteilt (geplante Std.)')}</span>
        </div>
        <div className="horis-matrix-scroll" role="region" aria-label={t('horis_view_matrix', 'Matrix')} tabIndex={0}>
          <table className="horis-matrix">
            <thead>
              <tr>
                <th className="horis-matrix-sticky">{t('horis_col_name', 'Name')}</th>
                {jobs.map(j => (
                  <th key={j.id} className="horis-matrix-job" title={`${formatDateLong(j.date)} — ${j.title || ''}`}>
                    <span className="horis-matrix-date">{formatDateShort(j.date)}</span>
                    <span className="horis-matrix-title">{j.title || ''}</span>
                  </th>
                ))}
                <th className="horis-matrix-total">{t('horis_matrix_hours', 'Std.')}</th>
                <th className="horis-matrix-total">%</th>
              </tr>
            </thead>
            <tbody>
              {horis.map(h => {
                const rt = rowTotals.get(h.id) || { hours: 0, pct: 0 };
                return (
                  <tr key={h.id}>
                    <th scope="row" className="horis-matrix-sticky horis-matrix-name">
                      <button type="button" onClick={() => setDetailHori(h)}
                        aria-label={`${t('horis_show_details', 'Details anzeigen')}: ${fullName(h)}`}>
                        {fullName(h)}
                      </button>
                    </th>
                    {jobs.map(j => {
                      const a = cell.get(`${h.id}|${j.id}`);
                      if (!a) return <td key={j.id} className="horis-cell" />;
                      const worked = a.actual_hours != null && a.actual_hours !== '';
                      const label = worked
                        ? `${fullName(h)} — ${j.title || ''}: ${fmtHours(a.actual_hours)} ${t('horis_matrix_hours', 'Std.')} ${t('horis_status_worked', 'Gearbeitet').toLowerCase()}`
                        : `${fullName(h)} — ${j.title || ''}: ${t('horis_status_planned', 'Geplant')} ${a.planned_hours != null ? `${fmtHours(a.planned_hours)} ${t('horis_matrix_hours', 'Std.')}` : ''}`;
                      return (
                        <td key={j.id} className={`horis-cell ${worked ? 'worked' : 'planned'}`} title={label} aria-label={label}>
                          {worked
                            ? fmtHours(a.actual_hours)
                            : <small>{a.planned_hours != null ? fmtHours(a.planned_hours) : '•'}</small>}
                        </td>
                      );
                    })}
                    <td className="horis-matrix-total dt-mono">{fmtHours(rt.hours)}</td>
                    <td className="horis-matrix-total dt-mono">{fmtPct(rt.pct)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="horis-matrix-sticky">{t('horis_total', 'Gesamt')}</th>
                {jobs.map(j => {
                  const ct = colTotals.get(j.id);
                  return (
                    <td key={j.id} className="dt-mono">
                      {ct?.hasActual
                        ? fmtHours(ct.actual)
                        : ct?.count ? <small className="dt-muted">{fmtHours(ct.planned)}</small> : '—'}
                    </td>
                  );
                })}
                <td className="horis-matrix-total dt-mono">{fmtHours(allActual)}</td>
                <td className="horis-matrix-total dt-mono">{allActual > 0 ? fmtPct(100) : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </>
    );
  };

  return (
    <div className="horis-page">
      <div className="page-header">
        <div className="search-bar">
          <Search size={18} />
          <input
            type="text"
            placeholder={t('horis_search', 'Horis suchen…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('horis_search', 'Horis suchen…')}
          />
        </div>
        <div className="page-header-end">
          <Button
            ref={bulkBtnRef}
            variant="outline"
            size="md"
            icon={ListPlus}
            className="horis-header-icon-btn"
            onClick={() => setShowBulk(true)}
            disabled={yearLocked}
            aria-label={t('horis_bulk_add', 'Mehrere hinzufügen')}
            title={t('horis_bulk_add', 'Mehrere hinzufügen')}
          />
          <Button
            ref={openBtnRef}
            variant="primary"
            size="md"
            icon={Plus}
            className="horis-header-icon-btn"
            onClick={handleNew}
            disabled={yearLocked}
            aria-label={t('horis_add', 'Hori hinzufügen')}
            title={t('horis_add', 'Hori hinzufügen')}
          />
          <YearSwitcher />
        </div>
      </div>

      {error && (
        <div className="page-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="horis-toolbar">
        <SegmentedToggle
          className="seg-toggle-fill"
          ariaLabel={t('horis_view_label', 'Ansicht')}
          value={view}
          onChange={setView}
          options={[
            { value: 'overview', label: t('horis_view_overview', 'Übersicht'), icon: <LayoutList size={15} /> },
            { value: 'matrix', label: t('horis_view_matrix', 'Matrix'), icon: <Grid3x3 size={15} /> },
          ]}
        />
        {view === 'overview' && (
          <div className="horis-toggles">
            <label className="horis-inactive-toggle">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              <span>{t('horis_show_inactive', 'Inaktive anzeigen')}</span>
            </label>
            <label className="horis-inactive-toggle">
              <input type="checkbox" checked={countInactive} onChange={(e) => setCountInactive(e.target.checked)} />
              <span>{t('horis_count_inactive', 'Inaktive mitzählen')}</span>
            </label>
          </div>
        )}
      </div>

      {view === 'overview' && (
        <>
          <div className="horis-summary">
            <div className="horis-summary-card">
              <div className="horis-summary-icon indigo"><Baby size={20} /></div>
              <div>
                <div className="horis-summary-label">{t('horis_summary_count', 'Horis')}</div>
                <div className="horis-summary-value">
                  {countedStats.length}
                </div>
              </div>
            </div>
            <div className="horis-summary-card">
              <div className="horis-summary-icon green"><Clock size={20} /></div>
              <div>
                <div className="horis-summary-label">{t('horis_summary_hours', 'Stunden gesamt')}</div>
                <div className="horis-summary-value">{fmtHours(totalActualHours)} h</div>
              </div>
            </div>
            <button
              type="button"
              ref={campBaseBtnRef}
              className="horis-summary-card horis-summary-card-btn"
              onClick={() => setShowCampBase(true)}
              disabled={!settings || yearLocked}
              aria-haspopup="dialog"
              title={t('horis_summary_base_edit', 'Lagerbeitrag bearbeiten')}
            >
              <div className="horis-summary-icon amber"><PiggyBank size={20} /></div>
              <div className="horis-summary-body">
                <div className="horis-summary-label">{t('horis_summary_base', 'Basis-Lagerbeitrag')}</div>
                <div className="horis-summary-value">{formatCurrency(baseContribution)}</div>
              </div>
            </button>
          </div>
          {renderOverview()}
        </>
      )}

      {view === 'matrix' && renderMatrix()}

      {showModal && (
        <HoriModal
          editingHori={editingHori}
          onSave={handleModalSave}
          onCancel={closeModal}
          triggerRef={openBtnRef}
        />
      )}

      {showBulk && (
        <BulkHoriModal
          existing={stats}
          onSave={handleBulkSave}
          onCancel={closeBulk}
          triggerRef={bulkBtnRef}
        />
      )}

      {detailHori && !showModal && !showBulk && (
        <HoriDetail hori={detailHori} year={selectedYear} locked={yearLocked} fmtHours={fmtHours} onClose={closeDetail} onEdit={handleEdit} />
      )}

      <CampBaseDialog
        open={showCampBase}
        settings={settings}
        onClose={closeCampBase}
        onSaved={handleCampBaseSaved}
        triggerRef={campBaseBtnRef}
        saveFn={(patch) => saveYearSettings(selectedYear, patch)}
      />

      {confirm && (
        <ConfirmDialog
          title={t('horis_delete_title', 'Hori löschen?')}
          message={`"${confirm.name}" ${t('horis_delete_body', 'wird endgültig gelöscht. Horis mit zugeteilten Arbeiten können nicht gelöscht werden.')}`}
          confirmLabel={t('btn_delete', 'Löschen')}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
};

export default Horis;
