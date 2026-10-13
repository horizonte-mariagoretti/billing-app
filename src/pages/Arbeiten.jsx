import React, { useState, useEffect, useRef, useMemo } from 'react';
import useJobs from '../hooks/useJobs';
import { useT } from '../hooks/useUiTranslations';
import Button from '../components/Button';
import ConfirmDialog from '../components/ConfirmDialog';
import JobModal from '../components/JobModal';
import JobCalendar from '../components/JobCalendar';
import { formatTimeRange } from '../utils/jobHours';
import {
  Plus, Search, Edit2, Trash2, AlertCircle, CalendarClock,
  FileText, Receipt, Users, LayoutList, CalendarDays,
} from 'lucide-react';
import './Arbeiten.css';

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const formatHours = (h) => {
  if (h === null || h === undefined || h === '' || Number.isNaN(Number(h))) return null;
  return Number(h).toLocaleString('de-DE', { maximumFractionDigits: 2 });
};

const Arbeiten = () => {
  const { fetchJobs, deleteJob } = useJobs();
  const t = useT();
  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState('');
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('arbeiten_view') === 'calendar' ? 'calendar' : 'list'; } catch (_e) { return 'list'; }
  }); // 'list' | 'calendar'
  const [newDate, setNewDate] = useState(null); // preset date for a new job (calendar day click)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [confirm, setConfirm] = useState(null); // { id, title }

  const openBtnRef = useRef(null);

  const weekdays = t('arbeiten_weekdays_short', 'So,Mo,Di,Mi,Do,Fr,Sa').split(',');

  const formatDate = (iso) => {
    if (!iso) return { weekday: '', date: '—' };
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return {
      weekday: weekdays[dt.getDay()] || '',
      date: `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`,
    };
  };

  const loadJobs = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchJobs();
      setJobs(Array.isArray(data) ? data : []);
    } catch (_err) {
      setError(t('arbeiten_load_error', 'Arbeiten konnten nicht geladen werden. Bitte die App neu starten.'));
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadJobs(); }, []);

  const changeView = (v) => {
    setView(v);
    try { localStorage.setItem('arbeiten_view', v); } catch (_e) { /* storage unavailable: view just won't persist */ }
  };
  const handleNew = () => { setEditingId(null); setNewDate(null); setShowModal(true); };
  const handleNewOnDate = (iso) => { setEditingId(null); setNewDate(iso); setShowModal(true); };
  const handleEdit = (job) => { setEditingId(job.id); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditingId(null); setNewDate(null); };
  const handleModalSave = () => { closeModal(); loadJobs(); };

  const handleDeleteConfirmed = async () => {
    if (!confirm) return;
    try {
      await deleteJob(confirm.id);
    } catch (_err) {
      setError(t('arbeiten_delete_error', 'Löschen fehlgeschlagen.'));
    }
    setConfirm(null);
    loadJobs();
  };

  const { upcoming, past, filtered, today } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = todayISO();
    const match = (j) => !q || [j.title, j.client_name, j.notes, j.quote_number, j.invoice_number]
      .some((v) => v && String(v).toLowerCase().includes(q));
    const filtered = jobs.filter(match);
    const byDateTime = (a, b) =>
      (a.date || '').localeCompare(b.date || '') || (a.start_time || '').localeCompare(b.start_time || '');
    return {
      filtered,
      today,
      upcoming: filtered.filter((j) => (j.date || '') >= today).sort(byDateTime),
      past: filtered.filter((j) => (j.date || '') < today).sort((a, b) => byDateTime(b, a)),
    };
  }, [jobs, search]);

  // One merged list: what's coming up first (soonest first), then what's behind us (latest first).
  const rows = [...upcoming, ...past];

  const statusLabel = (s) => {
    if (s === 'done') return t('arbeiten_status_done', 'Gearbeitet');
    if (s === 'cancelled') return t('arbeiten_status_cancelled', 'Abgesagt');
    return t('arbeiten_status_planned', 'Geplant');
  };

  const renderHours = (job) => {
    const planned = Number(job.planned_hours_total) > 0 ? formatHours(job.planned_hours_total) : null;
    const actual = Number(job.actual_hours_total) > 0 ? formatHours(job.actual_hours_total) : null;
    if (job.status === 'done' && actual !== null) {
      return (
        <div className="arbeiten-hours">
          <span className="arbeiten-hours-main">{actual}</span>
          {planned !== null && planned !== actual && (
            <span className="arbeiten-hours-sub" title={t('arbeiten_hours_planned_hint', 'Prognose')}>
              {t('arbeiten_hours_plan_prefix', 'Plan')} {planned}
            </span>
          )}
        </div>
      );
    }
    if (planned === null) return <span className="arbeiten-muted">—</span>;
    return (
      <div className="arbeiten-hours">
        <span className="arbeiten-hours-main arbeiten-hours-forecast" title={t('arbeiten_hours_planned_hint', 'Prognose')}>
          ~{planned}
        </span>
      </div>
    );
  };

  const emptyTitle = loading
    ? t('loading', 'Laden…')
    : search
      ? `${t('arbeiten_no_match', 'Keine Treffer für')} "${search}"`
      : t('arbeiten_empty_all', 'Noch keine Arbeiten');

  return (
    <div className="arbeiten-page">
      <div className="page-header">
        <div className="search-bar">
          <Search size={18} />
          <input
            type="text"
            placeholder={t('arbeiten_search', 'Arbeiten suchen...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('arbeiten_search', 'Arbeiten suchen...')}
          />
        </div>
        <Button ref={openBtnRef} variant="primary" icon={Plus} onClick={handleNew}>
          {t('arbeiten_add', 'Auftrag/Arbeit hinzufügen')}
        </Button>
      </div>

      <div className="arbeiten-tabs" role="tablist" aria-label={t('arbeiten_view_label', 'Ansicht')}>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'list'}
          className={`arbeiten-tab${view === 'list' ? ' active' : ''}`}
          onClick={() => changeView('list')}
        >
          <LayoutList size={15} aria-hidden="true" />
          {t('arbeiten_view_list', 'Liste')}
          <span className="arbeiten-tab-count">{filtered.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'calendar'}
          className={`arbeiten-tab${view === 'calendar' ? ' active' : ''}`}
          onClick={() => changeView('calendar')}
        >
          <CalendarDays size={15} aria-hidden="true" />
          {t('arbeiten_view_calendar', 'Kalender')}
        </button>
      </div>
      {error && (
        <div className="page-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {view === 'calendar' && !error && (
        <JobCalendar jobs={filtered} onOpenJob={handleEdit} onNewOnDate={handleNewOnDate} />
      )}

      {view === 'list' && (
      <div className="arbeiten-table-container">
        {!error && rows.length === 0 ? (
          <div className="arbeiten-empty">
            <CalendarClock size={36} strokeWidth={1.4} />
            <div className="arbeiten-empty-title">{emptyTitle}</div>
            <div className="arbeiten-empty-desc">
              {!loading && !search && t('arbeiten_empty_hint', 'Lege den nächsten Arbeitstermin an, um Helfer und Stunden zu planen.')}
              {!loading && search && t('try_different_search', 'Versuche einen anderen Suchbegriff.')}
            </div>
          </div>
        ) : (
          <table className="arbeiten-table">
            <thead>
              <tr>
                <th>{t('arbeiten_col_date', 'Datum')}</th>
                <th>{t('arbeiten_col_details', 'Details')}</th>
                <th>{t('arbeiten_col_time', 'Zeit')}</th>
                <th>{t('arbeiten_col_client', 'Kunde')}</th>
                <th>{t('arbeiten_col_people', 'Personen')}</th>
                <th>{t('arbeiten_col_hours', 'Std.')}</th>
                <th>{t('arbeiten_col_documents', 'Dokumente')}</th>
                <th>{t('arbeiten_col_status', 'Status')}</th>
                <th>{t('col_actions', 'Aktionen')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((job, idx) => {
                const { weekday, date } = formatDate(job.date);
                const cancelled = job.status === 'cancelled';
                const group = (job.date || '') >= today ? 'upcoming' : 'past';
                const prevGroup = idx > 0 ? ((rows[idx - 1].date || '') >= today ? 'upcoming' : 'past') : null;
                return (
                  <React.Fragment key={job.id}>
                  {group !== prevGroup && (
                    <tr className="arbeiten-group-row">
                      <td colSpan={9}>
                        {group === 'upcoming' ? t('arbeiten_tab_upcoming', 'Kommend') : t('arbeiten_tab_past', 'Vergangen')}
                        <span className="arbeiten-tab-count">{group === 'upcoming' ? upcoming.length : past.length}</span>
                      </td>
                    </tr>
                  )}
                  <tr
                    className={`arbeiten-row${cancelled ? ' arbeiten-row--cancelled' : ''}`}
                    onClick={() => handleEdit(job)}
                  >
                    <td className="arbeiten-date-cell">
                      <span className="arbeiten-weekday">{weekday}</span>
                      <span className="arbeiten-date">{date}</span>
                    </td>
                    <td className="arbeiten-title-cell">
                      <span className="arbeiten-title">{job.title || '—'}</span>
                      {job.notes && <span className="arbeiten-notes">{job.notes}</span>}
                    </td>
                    <td className="arbeiten-time-cell">
                      {formatTimeRange(job.start_time, job.end_time, !!job.open_end, t('jobs_open_prefix', 'ab'))
                        || <span className="arbeiten-muted">—</span>}
                    </td>
                    <td className="arbeiten-client-cell">
                      {job.client_name || <span className="arbeiten-muted">—</span>}
                    </td>
                    <td className="arbeiten-people-cell">
                      <span className="arbeiten-people">
                        <Users size={14} />
                        {job.people_count || 0}
                      </span>
                    </td>
                    <td className="arbeiten-hours-cell">{renderHours(job)}</td>
                    <td className="arbeiten-docs-cell">
                      {job.quote_number || job.invoice_number ? (
                        <div className="arbeiten-doc-chips">
                          {job.quote_number && (
                            <span className="arbeiten-doc-chip arbeiten-doc-chip--quote" title={t('arbeiten_quote', 'Angebot')}>
                              <FileText size={12} />{job.quote_number}
                            </span>
                          )}
                          {job.invoice_number && (
                            <span className="arbeiten-doc-chip arbeiten-doc-chip--invoice" title={t('arbeiten_invoice', 'Rechnung')}>
                              <Receipt size={12} />{job.invoice_number}
                            </span>
                          )}
                        </div>
                      ) : <span className="arbeiten-muted">—</span>}
                    </td>
                    <td className="arbeiten-status-cell">
                      <span className={`arbeiten-status arbeiten-status--${job.status || 'planned'}`}>
                        {statusLabel(job.status)}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <div className="action-btns">
                        <button
                          type="button"
                          title={t('btn_edit', 'Bearbeiten')}
                          aria-label={`${t('btn_edit', 'Bearbeiten')} ${job.title || ''}`}
                          onClick={(e) => { e.stopPropagation(); handleEdit(job); }}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          type="button"
                          title={t('btn_delete', 'Löschen')}
                          aria-label={`${t('btn_delete', 'Löschen')} ${job.title || ''}`}
                          onClick={(e) => { e.stopPropagation(); setConfirm({ id: job.id, title: job.title || date }); }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      )}

      {showModal && (
        <JobModal
          jobId={editingId}
          defaultDate={newDate}
          onSave={handleModalSave}
          onCancel={closeModal}
          triggerRef={openBtnRef}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={t('arbeiten_delete_title', 'Arbeit löschen?')}
          message={`"${confirm.title}" ${t('arbeiten_delete_body', 'wird dauerhaft gelöscht, inklusive aller Helfer-Zuordnungen und Stunden.')}`}
          confirmLabel={t('btn_delete', 'Löschen')}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
};

export default Arbeiten;
