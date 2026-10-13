import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import useHoris from '../hooks/useHoris';
import useSettings from '../hooks/useSettings';
import useCurrency from '../hooks/useCurrency';
import useFocusTrap from '../hooks/useFocusTrap';
import { useT } from '../hooks/useUiTranslations';
import { calcAge, formatTimeRange } from '../utils/jobHours';
import { calcContribution, campRulesFromSettings } from '../utils/campContribution';
import Button from '../components/Button';
import HoriModal from '../components/HoriModal';
import BulkHoriModal from '../components/BulkHoriModal';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  Plus, ListPlus, Search, Edit2, Trash2, AlertCircle, Baby, Clock, PiggyBank,
  LayoutList, Grid3x3, X, CalendarDays, ArrowUp, ArrowDown, ChevronsUpDown,
} from 'lucide-react';
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

const HoriDetail = ({ hori, fmtHours, onClose, onEdit }) => {
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
        const rows = await fetchHoriJobs(hori.id);
        if (!cancelled) setJobs(rows || []);
      } catch {
        if (!cancelled) setError(t('horis_jobs_load_error', 'Arbeiten konnten nicht geladen werden.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hori.id]);

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
                      <td className="horis-mono">{formatDateLong(j.date)}</td>
                      <td className="horis-detail-title-cell">{j.title || '—'}</td>
                      <td className="horis-mono">{formatTimeRange(j.start_time, j.end_time, j.open_end, t('jobs_open_prefix', 'ab')) || '—'}</td>
                      <td className="num horis-mono">{j.planned_hours != null ? fmtHours(j.planned_hours) : '—'}</td>
                      <td className="num horis-mono">{worked ? fmtHours(j.actual_hours) : '—'}</td>
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
                  <td className="num horis-mono">{fmtHours(totals.planned)}</td>
                  <td className="num horis-mono">{fmtHours(totals.actual)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={onClose}>{t('horis_close', 'Schließen')}</Button>
          <Button variant="secondary" type="button" icon={Edit2} onClick={() => onEdit(hori)}>
            {t('btn_edit', 'Bearbeiten')}
          </Button>
        </div>
      </div>
    </div>
  );
};

/* ── Page ─────────────────────────────────────────────────── */

const Horis = () => {
  const { fetchHoriStats, fetchMatrix, deleteHori } = useHoris();
  const { loadSettings } = useSettings();
  const t = useT();

  const [settings, setSettings] = useState(null);
  const [stats, setStats] = useState([]);
  const [matrix, setMatrix] = useState({ jobs: [], horis: [], assignments: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('overview'); // 'overview' | 'matrix'
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' }); // key: name|age|jobs|actual|share|planned|contribution
  const [showModal, setShowModal] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const bulkBtnRef = useRef(null);
  const [editingHori, setEditingHori] = useState(null);
  const [confirm, setConfirm] = useState(null);   // { id, name }
  const [detailHori, setDetailHori] = useState(null);

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

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const [s, st, mx] = await Promise.all([loadSettings(), fetchHoriStats(), fetchMatrix()]);
      setSettings(s);
      setStats(st || []);
      setMatrix({
        jobs: mx?.jobs || [],
        horis: mx?.horis || [],
        assignments: mx?.assignments || [],
      });
    } catch (err) {
      setError(t('horis_load_error', 'Horis konnten nicht geladen werden. Bitte die App neu starten.'));
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const baseContribution = num(settings?.camp_base_contribution);
  const campRules = campRulesFromSettings(settings);
  const contributionFor = (h) => calcContribution({ ...campRules, sharePct: h.share_pct });

  const matchesSearch = useCallback((h) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return fullName(h).toLowerCase().includes(q);
  }, [search]);

  const visibleStats = useMemo(
    () => stats.filter(h => (showInactive || isActive(h)) && matchesSearch(h)),
    [stats, showInactive, matchesSearch]
  );

  const sortValue = (h, key) => {
    switch (key) {
      case 'name': return fullName(h).toLowerCase();
      case 'age': return h.birth_date ? calcAge(h.birth_date) : null;
      case 'jobs': return num(h.job_count);
      case 'actual': return num(h.total_actual_hours);
      case 'share': return num(h.share_pct);
      case 'planned': return num(h.planned_hours_upcoming);
      case 'contribution': return contributionFor(h);
      default: return 0;
    }
  };
  // Missing values (e.g. no birth date) always sink to the bottom, whatever the direction.
  const sortedStats = [...visibleStats].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const cmp = typeof va === 'string' ? va.localeCompare(vb, locale) : va - vb;
    const dirCmp = sort.dir === 'asc' ? cmp : -cmp;
    return dirCmp || fullName(a).localeCompare(fullName(b), locale);
  });
  const toggleSort = (key) => setSort((p) => (p.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  const sortTh = (key, label, { className = '', title } = {}) => {
    const active = sort.key === key;
    const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th
        className={className}
        title={title}
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button type="button" className={`horis-sort-btn${active ? ' active' : ''}`} onClick={() => toggleSort(key)}>
          <span>{label}</span>
          <Icon size={13} aria-hidden="true" />
        </button>
      </th>
    );
  };

  const activeStats = stats.filter(isActive);
  const totalActualHours = stats.reduce((s, h) => s + num(h.total_actual_hours), 0);
  const visibleActualHours = visibleStats.reduce((s, h) => s + num(h.total_actual_hours), 0);
  const visiblePlannedHours = visibleStats.reduce((s, h) => s + num(h.planned_hours_upcoming), 0);
  const avgContribution = activeStats.length
    ? activeStats.reduce((s, h) => s + contributionFor(h), 0) / activeStats.length
    : 0;

  /* ── handlers ── */

  const handleNew = () => { setEditingHori(null); setShowModal(true); };
  const handleEdit = (h) => { setDetailHori(null); setEditingHori(h); setShowModal(true); };
  const closeModal = useCallback(() => { setShowModal(false); setEditingHori(null); }, []);
  const closeBulk = useCallback(() => setShowBulk(false), []);
  const handleBulkSave = () => { setShowBulk(false); load(); };
  const handleModalSave = () => { setShowModal(false); setEditingHori(null); load(); };
  const closeDetail = useCallback(() => setDetailHori(null), []);

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
        <div className="horis-table-container">
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
      <div className="horis-table-container">
        <table className="horis-table">
          <thead>
            <tr>
              {sortTh('name', t('horis_col_name', 'Name'))}
              {sortTh('age', t('horis_col_age', 'Alter'), { className: 'num' })}
              {sortTh('jobs', t('horis_col_jobs', 'Jobs'), { className: 'num' })}
              {sortTh('actual', t('horis_col_actual', 'Gearbeitete Std.'), { className: 'num' })}
              {sortTh('share', t('horis_col_share', 'Anteil %'))}
              {sortTh('planned', t('horis_col_planned', 'Geplant'), { className: 'num', title: t('horis_col_planned_tooltip', 'Geplante Stunden für kommende Arbeiten') })}
              {sortTh('contribution', t('horis_col_contribution', 'Lagerbeitrag'), { className: 'num' })}
              <th className="num">{t('col_actions', 'Aktionen')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedStats.map(h => {
              const active = isActive(h);
              const age = h.birth_date ? calcAge(h.birth_date) : null;
              const share = Math.max(0, Math.min(100, num(h.share_pct)));
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
                    {!active && <span className="horis-badge-inactive">{t('horis_inactive', 'Inaktiv')}</span>}
                  </td>
                  <td className="num">{age ?? '—'}</td>
                  <td className="num horis-mono">{num(h.job_count)}</td>
                  <td className="num horis-mono horis-strong">{fmtHours(h.total_actual_hours)}</td>
                  <td>
                    <div className="horis-share">
                      <div className="horis-share-track" aria-hidden="true">
                        <div className="horis-share-fill" style={{ width: `${share}%` }} />
                      </div>
                      <span className="horis-mono">{fmtPct(share)}</span>
                    </div>
                  </td>
                  <td className="num horis-mono horis-muted">{fmtHours(h.planned_hours_upcoming)}</td>
                  <td className="num horis-mono horis-strong">{formatCurrency(contributionFor(h))}</td>
                  <td className="num">
                    <div className="action-btns">
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
                        title={t('btn_delete', 'Löschen')}
                        aria-label={`${t('btn_delete', 'Löschen')} ${fullName(h)}`}
                        onClick={(e) => { e.stopPropagation(); setConfirm({ id: h.id, name: fullName(h) }); }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>{t('horis_total', 'Gesamt')}</td>
              <td className="num horis-mono">{fmtHours(visibleActualHours)}</td>
              <td />
              <td className="num horis-mono">{fmtHours(visiblePlannedHours)}</td>
              <td className="num horis-mono" title={t('horis_avg_contribution_tooltip', 'Durchschnittlicher Lagerbeitrag der aktiven Horis')}>
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
        <div className="horis-table-container">
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
                    <td className="horis-matrix-total horis-mono">{fmtHours(rt.hours)}</td>
                    <td className="horis-matrix-total horis-mono">{fmtPct(rt.pct)}</td>
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
                    <td key={j.id} className="horis-mono">
                      {ct?.hasActual
                        ? fmtHours(ct.actual)
                        : ct?.count ? <small className="horis-muted">{fmtHours(ct.planned)}</small> : '—'}
                    </td>
                  );
                })}
                <td className="horis-matrix-total horis-mono">{fmtHours(allActual)}</td>
                <td className="horis-matrix-total horis-mono">{allActual > 0 ? fmtPct(100) : '—'}</td>
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
        <div className="horis-header-actions">
          <Button ref={bulkBtnRef} variant="outline" icon={ListPlus} onClick={() => setShowBulk(true)}>
            {t('horis_bulk_add', 'Mehrere hinzufügen')}
          </Button>
          <Button ref={openBtnRef} variant="primary" icon={Plus} onClick={handleNew}>
            {t('horis_add', 'Hori hinzufügen')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="page-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="horis-toolbar">
        <div className="horis-segmented" role="tablist" aria-label={t('horis_view_label', 'Ansicht')}>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'overview'}
            className={view === 'overview' ? 'active' : ''}
            onClick={() => setView('overview')}
          >
            <LayoutList size={15} /> {t('horis_view_overview', 'Übersicht')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'matrix'}
            className={view === 'matrix' ? 'active' : ''}
            onClick={() => setView('matrix')}
          >
            <Grid3x3 size={15} /> {t('horis_view_matrix', 'Matrix')}
          </button>
        </div>
        {view === 'overview' && (
          <label className="horis-inactive-toggle">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            <span>{t('horis_show_inactive', 'Inaktive anzeigen')}</span>
          </label>
        )}
      </div>

      {view === 'overview' && (
        <>
          <div className="horis-summary">
            <div className="horis-summary-card">
              <div className="horis-summary-icon indigo"><Baby size={20} /></div>
              <div>
                <div className="horis-summary-label">{t('horis_summary_count', 'Aktive Horis')}</div>
                <div className="horis-summary-value">
                  {activeStats.length}
                  {stats.length > activeStats.length && (
                    <small> / {stats.length}</small>
                  )}
                </div>
              </div>
            </div>
            <div className="horis-summary-card">
              <div className="horis-summary-icon green"><Clock size={20} /></div>
              <div>
                <div className="horis-summary-label">{t('horis_summary_hours', 'Gearbeitete Stunden gesamt')}</div>
                <div className="horis-summary-value">{fmtHours(totalActualHours)} <small>{t('horis_matrix_hours', 'Std.')}</small></div>
              </div>
            </div>
            <div className="horis-summary-card">
              <div className="horis-summary-icon amber"><PiggyBank size={20} /></div>
              <div>
                <div className="horis-summary-label">{t('horis_summary_base', 'Basis-Lagerbeitrag')}</div>
                <div className="horis-summary-value">{formatCurrency(baseContribution)}</div>
              </div>
            </div>
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
        <HoriDetail hori={detailHori} fmtHours={fmtHours} onClose={closeDetail} onEdit={handleEdit} />
      )}

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
