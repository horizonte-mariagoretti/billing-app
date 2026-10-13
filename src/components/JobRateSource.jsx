import { useMemo } from 'react';
import DecimalInput from './DecimalInput';
import { useT } from '../hooks/useUiTranslations';
import { buildJobItems, groupHoriHours, jobItemsTotal, productLabel } from '../utils/jobDocumentLines';
import './JobRateSource.css';

const fmtHours = (h) => Number(h).toLocaleString('de-DE', { maximumFractionDigits: 2 });

/**
 * Product/manual switch + live preview of the grouped Hori-hours lines.
 * Presentational: state comes from useJobRateSource() (src/hooks) as `rs`.
 */
const JobRateSource = ({ rs, job, type, idPrefix = 'job-rate' }) => {
  const t = useT();
  const clockSuffix = t('jobdoc_clock_suffix', 'Uhr');
  const openPrefix = t('jobs_open_prefix', 'ab');

  const items = useMemo(
    () => (job ? buildJobItems({ job, type, name: rs.name, rate: rs.rate, clockSuffix, openPrefix }) : []),
    [job, type, rs.name, rs.rate, clockSuffix, openPrefix]
  );
  const hasHoriHours = useMemo(() => groupHoriHours(job?.assignments, type).length > 0, [job, type]);
  const fmtMoney = (v) => (Number(v) || 0).toLocaleString('de-DE', { style: 'currency', currency: rs.currency });

  const modes = [
    { key: 'product', label: t('jobdoc_rate_source_product', 'Aus Produkt') },
    { key: 'manual', label: t('jobdoc_rate_source_manual', 'Manuell') },
  ];

  return (
    <div className="job-rate">
      <div className="job-rate-field">
        <span className="input-label" id={`${idPrefix}-mode-label`}>
          {t('jobdoc_rate_source', 'Stundenlohn aus')}
        </span>
        <div className="job-rate-switch" role="group" aria-labelledby={`${idPrefix}-mode-label`}>
          {modes.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`job-rate-switch-btn${rs.mode === m.key ? ' active' : ''}`}
              aria-pressed={rs.mode === m.key}
              onClick={() => rs.setMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {rs.mode === 'product' ? (
        <div className="job-rate-row">
          <div className="job-rate-field">
            <label className="input-label" htmlFor={`${idPrefix}-product`}>
              {t('jobdoc_field_product', 'Leistung / Produkt')}
            </label>
            <select
              id={`${idPrefix}-product`}
              className="input-field job-rate-select"
              value={rs.selectedProductId}
              onChange={(e) => rs.setProductId(e.target.value)}
            >
              <option value="">{t('jobdoc_product_none', '— Produkt wählen —')}</option>
              {rs.products.map((p) => (
                <option key={p.id} value={p.id}>{productLabel(p)}</option>
              ))}
            </select>
            {rs.products.length === 0 && (
              <small className="job-rate-note">
                {t('jobdoc_no_products', 'Keine Produkte vorhanden – Stundenlohn manuell eingeben.')}
              </small>
            )}
          </div>
          <div className="job-rate-field job-rate-field--rate">
            <span className="input-label">{t('jobdoc_field_rate', 'Stundensatz')}</span>
            <strong className="job-rate-value">{fmtMoney(rs.rate)}</strong>
          </div>
        </div>
      ) : (
        <div className="job-rate-row">
          <div className="job-rate-field">
            <label className="input-label" htmlFor={`${idPrefix}-name`}>
              {t('jobdoc_field_line_name', 'Positionsname')}
            </label>
            <input
              id={`${idPrefix}-name`}
              type="text"
              className="input-field"
              value={rs.manualName}
              onChange={(e) => rs.setManualName(e.target.value)}
            />
          </div>
          <div className="job-rate-field job-rate-field--wage">
            <label className="input-label" htmlFor={`${idPrefix}-wage`}>
              {t('jobdoc_field_wage', 'Stundenlohn')}
            </label>
            <DecimalInput
              id={`${idPrefix}-wage`}
              className="input-field"
              min="0"
              placeholder="0,00"
              value={rs.manualRate}
              onChange={(e) => rs.setManualRate(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="job-rate-preview" aria-live="polite">
        <div className="job-rate-preview-head">
          <span className="input-label">{t('jobdoc_preview', 'Vorschau der Positionen')}</span>
          <small>
            {type === 'invoice'
              ? t('jobdoc_basis_actual', 'Gearbeitete Stunden je Hori (sonst geplante)')
              : t('jobdoc_basis_planned', 'Geplante Stunden je Hori')}
          </small>
        </div>
        {!hasHoriHours && (
          <p className="job-rate-note">
            {t('jobdoc_preview_fallback', 'Keine Hori-Stunden erfasst – es wird eine Position mit der Dauer der Arbeit angelegt.')}
          </p>
        )}
        <ul className="job-rate-lines">
          {items.map((it, i) => (
            <li key={i} className="job-rate-line">
              <div className="job-rate-line-main">
                <span className="job-rate-line-name">{it.name}</span>
                <span className="job-rate-line-calc">
                  {it.qty} × {fmtHours(it.duration)} h × {fmtMoney(it.rate)}
                </span>
                <strong className="job-rate-line-amount">{fmtMoney(it.qty * it.duration * it.rate)}</strong>
              </div>
              {it.description && <span className="job-rate-line-desc">{it.description}</span>}
            </li>
          ))}
        </ul>
        <div className="job-rate-total">
          <span>{t('jobdoc_total', 'Summe (netto)')}</span>
          <strong>{fmtMoney(jobItemsTotal(items))}</strong>
        </div>
      </div>
    </div>
  );
};

export default JobRateSource;
