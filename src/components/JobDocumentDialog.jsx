import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle } from 'lucide-react';
import DecimalInput from './DecimalInput';
import Button from './Button';
import useDatabase from '../hooks/useDatabase';
import useSettings from '../hooks/useSettings';
import { HORI_HOURS_PRODUCT } from '../constants';
import useFocusTrap from '../hooks/useFocusTrap';
import { useT } from '../hooks/useUiTranslations';
import { formatTimeRange } from '../utils/jobHours';
import './JobDocumentDialog.css';

const sum = (list, key) => (list || []).reduce((s, a) => s + (Number(a?.[key]) || 0), 0);
const round2 = (n) => Math.round(n * 100) / 100;

const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return d && m && y ? `${d}.${m}.${y}` : String(iso);
};

const productLabel = (p) => p.name_de || p.name_fr || p.name || '';

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const isHoriProduct = (p) => [p.name, p.name_de, p.name_fr].some((n) => norm(n) === norm(HORI_HOURS_PRODUCT));

/** Hours to prefill: offer = planned; invoice = actual if > 0, else planned; fallback 1. */
const jobDocumentHours = (job, type) => {
  const planned = sum(job?.assignments, 'planned_hours');
  const actual = sum(job?.assignments, 'actual_hours');
  const h = type === 'invoice' && actual > 0 ? actual : planned;
  return h > 0 ? round2(h) : 1;
};

/** "<title> – <dd.MM.yyyy>, <time range>" */
const jobServiceLine = (job, openPrefix = 'ab') => {
  const time = formatTimeRange(job?.start_time, job?.end_time, !!job?.open_end, openPrefix);
  const date = fmtDate(job?.date);
  const head = [job?.title?.trim(), date].filter(Boolean).join(' – ');
  return time ? `${head}, ${time}` : head;
};

/**
 * Small confirm dialog shown before creating an offer/invoice from a job.
 * Collects one service line and hands it to onConfirm({ description, product, rate, hours }).
 * Name and hourly rate always come from the product "Hori Arbeitsstunden"
 * (Produkte); only the description and hours can be adjusted here. Without
 * that product the line is still created (rate 0) and the rate is set in the editor.
 * Only job title/date/time end up on the document — never Hori names.
 */
const JobDocumentDialog = ({ job, type, onConfirm, onCancel }) => {
  const { query } = useDatabase();
  const { loadSettings } = useSettings();
  const t = useT();
  const isQuote = type === 'quote';

  const [product, setProduct] = useState(null);
  const [currency, setCurrency] = useState('EUR');
  const [description, setDescription] = useState(() => jobServiceLine(job, t('jobs_open_prefix', 'ab')));
  const [hours, setHours] = useState(() => String(jobDocumentHours(job, type)));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const boxRef = useRef(null);
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
    (async () => {
      try {
        const [rows, s] = await Promise.all([
          query('SELECT id, name, name_de, name_fr, rate, unit FROM products ORDER BY name'),
          loadSettings().catch(() => ({})),
        ]);
        if (cancelled) return;
        setProduct((rows || []).find(isHoriProduct) || null);
        setCurrency(s?.default_currency || 'EUR');
      } catch (_e) {
        if (!cancelled) setError(t('jobdoc_err_failed', 'Dokument konnte nicht vorbereitet werden.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rateNum = Number(product?.rate) || 0;
  const hoursNum = Number(hours);
  const total = (Number.isFinite(rateNum) ? rateNum : 0) * (Number.isFinite(hoursNum) ? hoursNum : 0);
  const fmtMoney = (v) => v.toLocaleString('de-DE', { style: 'currency', currency });

  const title = isQuote
    ? t('jobdoc_title_quote', 'Angebot aus Arbeit erstellen')
    : t('jobdoc_title_invoice', 'Rechnung aus Arbeit erstellen');
  const confirmLabel = isQuote
    ? t('jobdoc_create_quote', 'Angebot erstellen')
    : t('jobdoc_create_invoice', 'Rechnung erstellen');

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation(); // dialog is portalled: don't submit a parent form
    if (busy) return;
    if (!description.trim()) { setError(t('jobdoc_err_description', 'Beschreibung ist erforderlich')); return; }
    if (!Number.isFinite(hoursNum) || hours === '' || hoursNum <= 0) { setError(t('jobdoc_err_hours', 'Stunden müssen größer als 0 sein')); return; }
    setError(null);
    setBusy(true);
    try {
      await onConfirm({
        description: description.trim(),
        // No product yet: still name the line after it; the rate (0) is filled in the editor.
        product: { id: product?.id ?? null, name: product ? productLabel(product) : HORI_HOURS_PRODUCT },
        rate: round2(rateNum),
        hours: round2(hoursNum),
      });
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
      <div className="job-doc-box" ref={boxRef}>
        <h3 id="job-doc-title">{title}</h3>
        <p className="job-doc-hint">
          {t('jobdoc_hint', 'Eine Leistungsposition wird aus der Arbeit übernommen. Alles Weitere kannst du danach im Dokument anpassen.')}
        </p>

        {loading ? (
          <div className="job-doc-loading">{t('loading', 'Laden…')}</div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="job-doc-field">
              <label className="input-label" htmlFor="job-doc-desc">{t('jobdoc_field_description', 'Leistungsbeschreibung')}</label>
              <textarea
                id="job-doc-desc"
                className="job-doc-textarea"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {product ? (
              <div className="job-doc-product" aria-label={t('jobdoc_field_product', 'Leistung / Produkt')}>
                <div>
                  <span className="input-label">{t('jobdoc_field_product', 'Leistung / Produkt')}</span>
                  <strong>{productLabel(product)}</strong>
                </div>
                <div className="job-doc-product-rate">
                  <span className="input-label">{t('jobdoc_field_rate', 'Stundensatz')}</span>
                  <strong>{fmtMoney(rateNum)}</strong>
                  <small>{t('jobdoc_rate_from_product', 'aus dem Produkt')}</small>
                </div>
              </div>
            ) : null}

            <div className="job-doc-field">
              <label className="input-label" htmlFor="job-doc-hours">{t('jobdoc_field_hours', 'Stunden')}</label>
              <DecimalInput
                id="job-doc-hours"
                className="input-field"
                min="0"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>

            <div className="job-doc-total" aria-live="polite">
              <span>{t('jobdoc_total', 'Summe (netto)')}</span>
              <strong>{fmtMoney(total)}</strong>
            </div>

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
      </div>
    </div>,
    document.body
  );
};

export default JobDocumentDialog;
