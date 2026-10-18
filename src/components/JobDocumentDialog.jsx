import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle } from 'lucide-react';
import { OverlayScrollBox } from './OverlayScrollArea';
import Button from './Button';
import JobRateSource from './JobRateSource';
import useJobRateSource from '../hooks/useJobRateSource';
import useFocusTrap from '../hooks/useFocusTrap';
import { useT } from '../hooks/useUiTranslations';
import { formatTimeRange } from '../utils/jobHours';
import './JobDocumentDialog.css';

const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return d && m && y ? `${d}.${m}.${y}` : String(iso);
};

/**
 * Confirm dialog shown before creating an offer/invoice from a job.
 * The document gets one line per distinct Hori-hours value (Menge = number
 * of Horis, Dauer = hours, Bemerkung = start time + hours). Here the user
 * only picks where name + hourly wage come from (a product or manual) and
 * sees a live preview; onConfirm({ name, rate, productId }) — App re-fetches
 * the job and builds the lines with buildJobItems.
 * Only job title/time end up on the document — never Hori names.
 */
const JobDocumentDialog = ({ job, type, onConfirm, onCancel }) => {
  const t = useT();
  const rs = useJobRateSource();
  const isQuote = type === 'quote';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const boxRef = useRef(null);
  useFocusTrap(boxRef, { active: !rs.loading });

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const title = isQuote
    ? t('jobdoc_title_quote', 'Angebot aus Arbeit erstellen')
    : t('jobdoc_title_invoice', 'Rechnung aus Arbeit erstellen');
  const confirmLabel = isQuote
    ? t('jobdoc_create_quote', 'Angebot erstellen')
    : t('jobdoc_create_invoice', 'Rechnung erstellen');

  const time = formatTimeRange(job?.start_time, job?.end_time, !!job?.open_end, t('jobs_open_prefix', 'ab'));
  const jobLine = [job?.title?.trim(), fmtDate(job?.date), time].filter(Boolean).join(' · ');

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation(); // dialog is portalled: don't submit a parent form
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await onConfirm({ name: rs.name, rate: rs.rate, productId: rs.productId });
    } catch (_err) {
      setError(t('jobdoc_err_failed', 'Dokument konnte nicht vorbereitet werden.'));
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="job-doc-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="job-doc-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <OverlayScrollBox className="job-doc-box" innerRef={boxRef}>
        <h3 id="job-doc-title">{title}</h3>
        {jobLine && <p className="job-doc-job">{jobLine}</p>}
        <p className="job-doc-hint">
          {t('jobdoc_hint_grouped', 'Je Stundenanzahl der Horis entsteht eine Position (Menge = Anzahl Horis, Dauer = Stunden). Alles Weitere kannst du danach im Dokument anpassen.')}
        </p>

        {rs.loading ? (
          <div className="job-doc-loading">{t('loading', 'Laden…')}</div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <JobRateSource rs={rs} job={job} type={type} idPrefix="job-doc" />

            {error && (
              <div className="page-error" role="alert">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="job-doc-actions">
              <Button variant="ghost" type="button" onClick={onCancel}>{t('btn_cancel', 'Abbrechen')}</Button>
              <Button variant="primary" type="submit" disabled={busy}>{confirmLabel}</Button>
            </div>
          </form>
        )}
      </OverlayScrollBox>
    </div>,
    document.body
  );
};

export default JobDocumentDialog;
