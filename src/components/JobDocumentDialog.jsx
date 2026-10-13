import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle } from 'lucide-react';
import DecimalInput from './DecimalInput';
import StyledSelect from './StyledSelect';
import Button from './Button';
import useDatabase from '../hooks/useDatabase';
import useSettings from '../hooks/useSettings';
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
 * Collects one service line (description, optional product, rate, hours)
 * and hands it to onConfirm({ description, product, rate, hours }).
 * Only job title/date/time end up on the document — never Hori names.
 */
const JobDocumentDialog = ({ job, type, onConfirm, onCancel }) => {
  const { query } = useDatabase();
  const { loadSettings } = useSettings();
  const t = useT();
  const isQuote = type === 'quote';

  const [products, setProducts] = useState([]);
  const [currency, setCurrency] = useState('EUR');
  const [productId, setProductId] = useState('');
  const [description, setDescription] = useState(() => jobServiceLine(job, t('jobs_open_prefix', 'ab')));
  const [rate, setRate] = useState('');
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
        const list = rows || [];
        setProducts(list);
        setCurrency(s?.default_currency || 'EUR');
        const hourly = list.find((p) => p.unit === 'hour');
        if (hourly) {
          setProductId(hourly.id);
          setRate(String(Number(hourly.rate) || 0));
        } else {
          const fallback = parseFloat(String(s?.default_hourly_rate ?? '').replace(',', '.'));
          setRate(String(Number.isFinite(fallback) ? fallback : 0));
        }
      } catch (_e) {
        if (!cancelled) setRate('0');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const product = useMemo(
    () => products.find((p) => String(p.id) === String(productId)) || null,
    [products, productId]
  );

  const pickProduct = (e) => {
    const id = e.target.value;
    setProductId(id);
    const p = products.find((x) => String(x.id) === String(id));
    if (p) setRate(String(Number(p.rate) || 0));
  };

  const rateNum = Number(rate);
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
    if (!Number.isFinite(rateNum) || rate === '' || rateNum < 0) { setError(t('jobdoc_err_rate', 'Stundensatz muss eine positive Zahl sein')); return; }
    if (!Number.isFinite(hoursNum) || hours === '' || hoursNum <= 0) { setError(t('jobdoc_err_hours', 'Stunden müssen größer als 0 sein')); return; }
    setError(null);
    setBusy(true);
    try {
      await onConfirm({
        description: description.trim(),
        product: product ? { id: product.id, name: productLabel(product) } : null,
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

            <div className="job-doc-field">
              <span className="input-label">{t('jobdoc_field_product', 'Leistung / Produkt')}</span>
              <StyledSelect value={productId} onChange={pickProduct}>
                <option value="">{t('jobdoc_product_manual', '— manuell —')}</option>
                {products.map((p) => <option key={p.id} value={p.id}>{productLabel(p)}</option>)}
              </StyledSelect>
            </div>

            <div className="job-doc-row">
              <div className="job-doc-field">
                <label className="input-label" htmlFor="job-doc-rate">{t('jobdoc_field_rate', 'Stundensatz')}</label>
                <DecimalInput
                  id="job-doc-rate"
                  className="input-field"
                  min="0"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                />
              </div>
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
