import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Search, Users } from 'lucide-react';
import OverlayScrollArea, { OverlayScrollBox } from './OverlayScrollArea';
import Button from './Button';
import JobRateSource from './JobRateSource';
import useJobRateSource from '../hooks/useJobRateSource';
import useJobs from '../hooks/useJobs';
import useFocusTrap from '../hooks/useFocusTrap';
import { useT } from '../hooks/useUiTranslations';
import { formatTimeRange } from '../utils/jobHours';
import { buildJobItems } from '../utils/jobDocumentLines';
import './JobDocumentDialog.css';
import './JobLinesDialog.css';

const fmtDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  return d && m && y ? `${d}.${m}.${y}` : String(iso);
};

const dayNumber = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000 : null;
};

/**
 * "Aus Arbeit laden…" in the document editor: pick a job, choose where the
 * hourly wage comes from, and append the grouped Hori-hours lines to the
 * current document. `type` is the document's type (quote → planned hours,
 * invoice → actual hours, else planned). onConfirm({ job, items }).
 */
const JobLinesDialog = ({ type, onConfirm, onCancel }) => {
  const t = useT();
  const { fetchJobs, fetchJob } = useJobs();
  const rs = useJobRateSource();

  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [job, setJob] = useState(null); // full job incl. assignments
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const boxRef = useRef(null);
  const loading = jobsLoading || rs.loading;
  useFocusTrap(boxRef, { active: !loading });

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  useEffect(() => {
    let cancelled = false;
    fetchJobs()
      .then((rows) => { if (!cancelled) setJobs(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setError(t('joblines_err_load', 'Arbeiten konnten nicht geladen werden.')); })
      .finally(() => { if (!cancelled) setJobsLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Closest to today first (upcoming and recent jobs on top), later date on ties.
  const visibleJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000;
    const dist = (j) => { const d = dayNumber(j.date); return d === null ? Infinity : Math.abs(d - today); };
    return jobs
      .filter((j) => !q || [j.title, j.client_name, j.notes, fmtDate(j.date)]
        .some((v) => v && String(v).toLowerCase().includes(q)))
      .sort((a, b) => dist(a) - dist(b)
        || (b.date || '').localeCompare(a.date || '')
        || (a.start_time || '').localeCompare(b.start_time || ''));
  }, [jobs, search]);

  const selectJob = async (id) => {
    setSelectedId(id);
    setError(null);
    try {
      const full = await fetchJob(id);
      setJob(full || null);
    } catch (_e) {
      setJob(null);
      setError(t('joblines_err_load', 'Arbeiten konnten nicht geladen werden.'));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation(); // portalled: don't submit the editor's form
    if (busy || !job) return;
    setBusy(true);
    try {
      const items = buildJobItems({
        job,
        type,
        name: rs.name,
        rate: rs.rate,
        clockSuffix: t('jobdoc_clock_suffix', 'Uhr'),
        openPrefix: t('jobs_open_prefix', 'ab'),
      });
      await onConfirm({ job, items });
    } catch (_err) {
      setError(t('jobdoc_err_failed', 'Dokument konnte nicht vorbereitet werden.'));
      setBusy(false);
    }
  };

  const openPrefix = t('jobs_open_prefix', 'ab');

  return createPortal(
    <div
      className="job-doc-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="job-lines-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <OverlayScrollBox className="job-doc-box job-lines-box" innerRef={boxRef}>
        <h3 id="job-lines-title">{t('joblines_title', 'Positionen aus Arbeit laden')}</h3>
        <p className="job-doc-hint">
          {t('joblines_hint', 'Wähle eine Arbeit: je Stundenanzahl der Horis wird eine Position angehängt (Menge = Anzahl Horis, Dauer = Stunden).')}
        </p>

        {loading ? (
          <div className="job-doc-loading">{t('loading', 'Laden…')}</div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="job-doc-field">
              <span className="input-label" id="job-lines-list-label">{t('joblines_pick_job', 'Arbeit')}</span>
              <div className="job-lines-search">
                <Search size={14} aria-hidden="true" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('joblines_search', 'Arbeit suchen…')}
                  aria-label={t('joblines_search', 'Arbeit suchen…')}
                />
              </div>
              <OverlayScrollArea as="ul" className="job-lines-list" aria-labelledby="job-lines-list-label">
                {visibleJobs.length === 0 ? (
                  <li className="job-lines-empty">{t('joblines_empty', 'Keine Arbeiten gefunden')}</li>
                ) : visibleJobs.map((j) => {
                  const selected = j.id === selectedId;
                  const time = formatTimeRange(j.start_time, j.end_time, !!j.open_end, openPrefix);
                  return (
                    <li key={j.id}>
                      <button
                        type="button"
                        className={`job-lines-item${selected ? ' selected' : ''}`}
                        aria-pressed={selected}
                        onClick={() => selectJob(j.id)}
                      >
                        <span className="job-lines-item-date">{fmtDate(j.date)}</span>
                        <span className="job-lines-item-main">
                          <span className="job-lines-item-title">{j.title || '—'}</span>
                          <span className="job-lines-item-sub">
                            {[j.client_name, time].filter(Boolean).join(' · ') || '—'}
                          </span>
                        </span>
                        <span
                          className="job-lines-item-people"
                          aria-label={`${j.people_count || 0} ${t('joblines_people', 'Personen')}`}
                        >
                          <Users size={13} aria-hidden="true" />
                          {j.people_count || 0}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </OverlayScrollArea>
            </div>

            {job && <JobRateSource rs={rs} job={job} type={type} idPrefix="job-lines" />}

            {error && (
              <div className="page-error" role="alert">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="job-doc-actions">
              <Button variant="ghost" type="button" onClick={onCancel}>{t('btn_cancel', 'Abbrechen')}</Button>
              <Button variant="primary" type="submit" disabled={busy || !job}>{t('joblines_add', 'Hinzufügen')}</Button>
            </div>
          </form>
        )}
      </OverlayScrollBox>
    </div>,
    document.body
  );
};

export default JobLinesDialog;
