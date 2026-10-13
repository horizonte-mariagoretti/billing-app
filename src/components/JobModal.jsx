import React, { useState, useEffect, useRef, useMemo } from 'react';
import DecimalInput from './DecimalInput';
import useDatabase from '../hooks/useDatabase';
import useJobs from '../hooks/useJobs';
import useHoris from '../hooks/useHoris';
import useFocusTrap from '../hooks/useFocusTrap';
import { useT } from '../hooks/useUiTranslations';
import Button from './Button';
import Input from './Input';
import StyledSelect from './StyledSelect';
import DatePicker from './DatePicker';
import { computeHours } from '../utils/jobHours';
import { AlertCircle, Check } from 'lucide-react';
import './JobModal.css';

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const hoursToInput = (h) => (h === null || h === undefined || h === '' ? '' : String(h));

const EMPTY_FORM = {
  title: '',
  date: todayISO(),
  start_time: '',
  end_time: '',
  open_end: false,
  client_id: '',
  quote_id: '',
  invoice_id: '',
  notes: '',
  status: 'planned',
};

/**
 * Create/edit a job (Arbeit). `jobId` null → new job.
 * Assignments state: { [hori_id]: { planned, actual, plannedEdited } }.
 */
const JobModal = ({ jobId, onSave, onCancel, triggerRef }) => {
  const { query } = useDatabase();
  const { fetchJob, saveJob, fetchDocumentOptions } = useJobs();
  const { fetchHoris } = useHoris();
  const t = useT();

  const [form, setForm] = useState({ ...EMPTY_FORM, date: todayISO() });
  const [assign, setAssign] = useState({});
  const [horis, setHoris] = useState([]);
  const [clients, setClients] = useState([]);
  const [docOptions, setDocOptions] = useState({ quotes: [], invoices: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [errors, setErrors] = useState({});

  const modalRef = useRef(null);
  useFocusTrap(modalRef, { active: !loading, triggerRef });

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [horiRows, clientRows, docs, job] = await Promise.all([
          fetchHoris(),
          query('SELECT id, name FROM clients ORDER BY name'),
          fetchDocumentOptions(),
          jobId ? fetchJob(jobId) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setHoris(horiRows || []);
        setClients(clientRows || []);
        setDocOptions(docs || { quotes: [], invoices: [] });
        if (job) {
          setForm({
            title: job.title || '',
            date: job.date || todayISO(),
            start_time: job.start_time || '',
            end_time: job.end_time || '',
            open_end: !!job.open_end,
            client_id: job.client_id || '',
            quote_id: job.quote_id || '',
            invoice_id: job.invoice_id || '',
            notes: job.notes || '',
            status: job.status || 'planned',
          });
          const computed = computeHours(job.start_time, job.end_time, !!job.open_end);
          const next = {};
          (job.assignments || []).forEach((a) => {
            next[a.hori_id] = {
              planned: hoursToInput(a.planned_hours),
              actual: hoursToInput(a.actual_hours),
              // Treat a stored value that differs from the time-derived one as a manual edit.
              plannedEdited: a.planned_hours !== null && a.planned_hours !== undefined
                && Number(a.planned_hours) !== computed,
            };
          });
          setAssign(next);
        }
      } catch (_err) {
        if (!cancelled) setLoadError(t('arbeiten_modal_load_error', 'Daten konnten nicht geladen werden.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const computedHours = computeHours(form.start_time, form.end_time, form.open_end);

  // Active Horis plus any inactive ones already assigned to this job.
  const visibleHoris = useMemo(
    () => horis.filter((h) => h.active === 1 || h.active === true || assign[h.id]),
    [horis, assign]
  );

  const selectedCount = Object.keys(assign).length;
  const isDone = form.status === 'done';

  /* ── Field updates ── */
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Re-prefill planned hours for every Hori the user hasn't manually overridden.
  const updateTimes = (patch) => {
    const next = { ...form, ...patch };
    const hrs = computeHours(next.start_time, next.end_time, next.open_end);
    setForm(next);
    setAssign((prev) => {
      const out = {};
      Object.entries(prev).forEach(([id, a]) => {
        out[id] = a.plannedEdited ? a : { ...a, planned: hoursToInput(hrs) };
      });
      return out;
    });
  };

  const setStatus = (e) => {
    const status = e.target.value;
    setForm((f) => ({ ...f, status }));
    if (status === 'done') {
      setAssign((prev) => {
        const out = {};
        Object.entries(prev).forEach(([id, a]) => {
          out[id] = a.actual === '' ? { ...a, actual: a.planned } : a;
        });
        return out;
      });
    }
  };

  const setClient = (e) => {
    const client_id = e.target.value;
    setForm((f) => {
      const keep = (list, id) => {
        if (!id || !client_id) return id;
        const doc = list.find((d) => String(d.id) === String(id));
        return doc && doc.client_id && String(doc.client_id) !== String(client_id) ? '' : id;
      };
      return {
        ...f,
        client_id,
        quote_id: keep(docOptions.quotes, f.quote_id),
        invoice_id: keep(docOptions.invoices, f.invoice_id),
      };
    });
  };

  /* ── Hori selection ── */
  const newEntry = () => ({
    planned: hoursToInput(computedHours),
    actual: isDone ? hoursToInput(computedHours) : '',
    plannedEdited: false,
  });

  const toggleHori = (id) => {
    setAssign((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = newEntry();
      return next;
    });
  };

  const selectAll = () => {
    setAssign((prev) => {
      const next = { ...prev };
      visibleHoris.forEach((h) => { if (!next[h.id]) next[h.id] = newEntry(); });
      return next;
    });
  };

  const selectNone = () => setAssign({});

  const setPlanned = (id, value) => setAssign((prev) => ({
    ...prev, [id]: { ...prev[id], planned: value, plannedEdited: value !== '' },
  }));

  const setActual = (id, value) => setAssign((prev) => ({
    ...prev, [id]: { ...prev[id], actual: value },
  }));

  /* ── Document options filtered to client ── */
  const filterDocs = (list, currentId) => list.filter((d) =>
    !form.client_id
    || !d.client_id
    || String(d.client_id) === String(form.client_id)
    || String(d.id) === String(currentId)
  );
  const quoteOptions = filterDocs(docOptions.quotes, form.quote_id);
  const invoiceOptions = filterDocs(docOptions.invoices, form.invoice_id);
  const docLabel = (d) => (d.title ? `${d.number} · ${d.title}` : d.number);

  /* ── Validation + save ── */
  const validate = () => {
    const e = {};
    if (!form.title.trim()) e.title = t('arbeiten_err_title', 'Details sind erforderlich');
    if (!form.date) e.date = t('arbeiten_err_date', 'Datum ist erforderlich');
    if (!form.start_time && (form.end_time || form.open_end)) {
      e.start_time = t('arbeiten_err_start', 'Startzeit angeben, wenn Ende oder offenes Ende gesetzt ist');
    }
    Object.entries(assign).forEach(([id, a]) => {
      if (a.planned !== '' && (Number.isNaN(Number(a.planned)) || Number(a.planned) < 0)) e[`p_${id}`] = true;
      if (a.actual !== '' && (Number.isNaN(Number(a.actual)) || Number(a.actual) < 0)) e[`a_${id}`] = true;
    });
    if (Object.keys(e).some((k) => k.startsWith('p_') || k.startsWith('a_'))) {
      e.hours = t('arbeiten_err_hours', 'Stunden müssen positive Zahlen sein');
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving || !validate()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveJob({
        ...(jobId ? { id: jobId } : {}),
        title: form.title.trim(),
        date: form.date,
        start_time: form.start_time || null,
        end_time: form.open_end ? null : (form.end_time || null),
        open_end: form.open_end,
        client_id: form.client_id || null,
        quote_id: form.quote_id || null,
        invoice_id: form.invoice_id || null,
        notes: form.notes.trim(),
        status: form.status,
        assignments: Object.entries(assign).map(([hori_id, a]) => ({
          hori_id,
          planned_hours: a.planned === '' ? null : Number(a.planned),
          actual_hours: isDone && a.actual !== '' ? Number(a.actual) : null,
        })),
      });
      onSave();
    } catch (_err) {
      setSaveError(t('arbeiten_save_error', 'Speichern fehlgeschlagen. Bitte erneut versuchen.'));
      setSaving(false);
    }
  };

  const heading = jobId
    ? t('arbeiten_edit_title', 'Arbeit bearbeiten')
    : t('arbeiten_add_title', 'Neue Arbeit');

  const totalPlanned = Object.values(assign).reduce((s, a) => s + (Number(a.planned) || 0), 0);
  const totalActual = Object.values(assign).reduce((s, a) => s + (Number(a.actual) || 0), 0);
  const fmt = (n) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 });

  return (
    <div className="job-modal-overlay" role="dialog" aria-modal="true" aria-label={heading}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="job-modal-content" ref={modalRef}>
        <h2>{heading}</h2>

        {loadError && (
          <div className="page-error" role="alert">
            <AlertCircle size={16} />
            <span>{loadError}</span>
          </div>
        )}

        {loading ? (
          <div className="job-modal-loading">{t('loading', 'Laden…')}</div>
        ) : loadError ? (
          <div className="job-modal-actions">
            <Button variant="ghost" type="button" onClick={onCancel}>{t('btn_close', 'Schließen')}</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <Input
              label={t('arbeiten_field_title', 'Details')}
              value={form.title}
              onChange={set('title')}
              placeholder={t('arbeiten_field_title_placeholder', 'z. B. Hochzeit Müller – Service & Bar')}
              error={errors.title}
              required
            />

            <div className="job-modal-row job-modal-row--time">
              <div className="job-modal-field">
                <DatePicker
                  label={t('arbeiten_field_date', 'Datum')}
                  value={form.date}
                  onChange={(v) => setForm((f) => ({ ...f, date: v }))}
                />
                {errors.date && <span className="input-error">{errors.date}</span>}
              </div>
              <Input
                label={t('arbeiten_field_start', 'Beginn')}
                type="time"
                value={form.start_time}
                onChange={(e) => updateTimes({ start_time: e.target.value })}
                error={errors.start_time}
              />
              <Input
                label={t('arbeiten_field_end', 'Ende')}
                type="time"
                value={form.open_end ? '' : form.end_time}
                onChange={(e) => updateTimes({ end_time: e.target.value })}
                disabled={form.open_end}
              />
            </div>

            <div className="job-modal-time-meta">
              <label className="job-modal-checkbox">
                <input
                  type="checkbox"
                  checked={form.open_end}
                  onChange={(e) => updateTimes({ open_end: e.target.checked })}
                />
                <span>{t('arbeiten_field_open_end', 'Offenes Ende')}</span>
              </label>
              <span className="job-modal-duration">
                {computedHours !== null
                  ? `${t('arbeiten_duration', 'Dauer')}: ${fmt(computedHours)} ${t('arbeiten_hours_unit', 'Std.')}`
                  : form.open_end
                    ? t('arbeiten_duration_open', 'Dauer offen – Stunden manuell eintragen')
                    : ''}
              </span>
            </div>

            <div className="job-modal-row">
              <div className="job-modal-field">
                <label className="input-label">{t('arbeiten_field_client', 'Kunde')}</label>
                <StyledSelect value={form.client_id} onChange={setClient} placeholder="—">
                  <option value="">—</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </StyledSelect>
              </div>
              <div className="job-modal-field">
                <label className="input-label">{t('arbeiten_field_status', 'Status')}</label>
                <StyledSelect value={form.status} onChange={setStatus}>
                  <option value="planned">{t('arbeiten_status_planned', 'Geplant')}</option>
                  <option value="done">{t('arbeiten_status_done', 'Gearbeitet')}</option>
                  <option value="cancelled">{t('arbeiten_status_cancelled', 'Abgesagt')}</option>
                </StyledSelect>
              </div>
            </div>

            <div className="job-modal-row">
              <div className="job-modal-field">
                <label className="input-label">{t('arbeiten_field_quote', 'Angebot')}</label>
                <StyledSelect value={form.quote_id} onChange={set('quote_id')} placeholder="—">
                  <option value="">—</option>
                  {quoteOptions.map((d) => <option key={d.id} value={d.id}>{docLabel(d)}</option>)}
                </StyledSelect>
              </div>
              <div className="job-modal-field">
                <label className="input-label">{t('arbeiten_field_invoice', 'Rechnung')}</label>
                <StyledSelect value={form.invoice_id} onChange={set('invoice_id')} placeholder="—">
                  <option value="">—</option>
                  {invoiceOptions.map((d) => <option key={d.id} value={d.id}>{docLabel(d)}</option>)}
                </StyledSelect>
              </div>
            </div>

            {/* ── Helpers ── */}
            <div className="job-modal-horis">
              <div className="job-modal-horis-header">
                <div>
                  <span className="job-modal-horis-title">{t('arbeiten_field_horis', 'Horis')}</span>
                  <span className="job-modal-horis-count">{selectedCount}/{visibleHoris.length}</span>
                </div>
                {visibleHoris.length > 0 && (
                  <div className="job-modal-horis-shortcuts">
                    <button type="button" onClick={selectAll}>{t('arbeiten_select_all', 'Alle auswählen')}</button>
                    <span aria-hidden="true">/</span>
                    <button type="button" onClick={selectNone}>{t('arbeiten_select_none', 'keine')}</button>
                  </div>
                )}
              </div>

              {visibleHoris.length === 0 ? (
                <div className="job-modal-horis-empty">
                  {t('arbeiten_no_horis', 'Noch keine aktiven Horis angelegt.')}
                </div>
              ) : (
                <>
                  <div className="job-modal-hori-head" aria-hidden="true">
                    <span />
                    <span>{t('arbeiten_planned_hours', 'Std. geplant')}</span>
                    <span>{t('arbeiten_actual_hours', 'Std. gearbeitet')}</span>
                  </div>
                  <ul className="job-modal-hori-list">
                    {visibleHoris.map((h) => {
                      const a = assign[h.id];
                      const name = `${h.first_name || ''} ${h.last_name || ''}`.trim();
                      return (
                        <li key={h.id} className={`job-modal-hori${a ? ' selected' : ''}`}>
                          <label className="job-modal-hori-name">
                            <input
                              type="checkbox"
                              checked={!!a}
                              onChange={() => toggleHori(h.id)}
                            />
                            <span className="job-modal-hori-check" aria-hidden="true">
                              {a && <Check size={12} strokeWidth={3} />}
                            </span>
                            <span className="job-modal-hori-label">{name}</span>
                          </label>
                          <DecimalInput
                            min="0"
                            step="0.25"
                            inputMode="decimal"
                            className={`job-modal-hours-input${errors[`p_${h.id}`] ? ' has-error' : ''}`}
                            value={a ? a.planned : ''}
                            onChange={(e) => setPlanned(h.id, e.target.value)}
                            disabled={!a}
                            placeholder={a ? '—' : ''}
                            aria-label={`${t('arbeiten_planned_hours', 'Std. geplant')} ${name}`}
                          />
                          <DecimalInput
                            min="0"
                            step="0.25"
                            inputMode="decimal"
                            className={`job-modal-hours-input${errors[`a_${h.id}`] ? ' has-error' : ''}`}
                            value={a && isDone ? a.actual : ''}
                            onChange={(e) => setActual(h.id, e.target.value)}
                            disabled={!a || !isDone}
                            placeholder={a && isDone ? '—' : ''}
                            title={!isDone ? t('arbeiten_actual_hint', 'Erst bei Status „Gearbeitet“ ausfüllbar') : undefined}
                            aria-label={`${t('arbeiten_actual_hours', 'Std. gearbeitet')} ${name}`}
                          />
                        </li>
                      );
                    })}
                  </ul>
                  {selectedCount > 0 && (
                    <div className="job-modal-hori-total">
                      <span>{t('arbeiten_total', 'Summe')}</span>
                      <span>{fmt(totalPlanned)}</span>
                      <span>{isDone ? fmt(totalActual) : '—'}</span>
                    </div>
                  )}
                </>
              )}
              {errors.hours && <span className="input-error">{errors.hours}</span>}
              {!isDone && selectedCount > 0 && (
                <div className="job-modal-hint">
                  {t('arbeiten_forecast_hint', 'Geplante Stunden sind eine Prognose. Die tatsächlichen Stunden werden nach der Arbeit (Status „Gearbeitet“) eingetragen.')}
                </div>
              )}
            </div>

            <div className="job-modal-field">
              <label className="input-label" htmlFor="job-modal-notes">{t('arbeiten_field_notes', 'Notizen')}</label>
              <textarea
                id="job-modal-notes"
                className="job-modal-textarea"
                rows={3}
                value={form.notes}
                onChange={set('notes')}
                placeholder={t('arbeiten_field_notes_placeholder', 'Ort, Ansprechpartner, Kleiderordnung …')}
              />
            </div>

            {saveError && (
              <div className="page-error" role="alert">
                <AlertCircle size={16} />
                <span>{saveError}</span>
              </div>
            )}

            <div className="job-modal-actions">
              <Button variant="ghost" type="button" onClick={onCancel}>{t('btn_cancel', 'Abbrechen')}</Button>
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? t('arbeiten_saving', 'Speichern…') : t('arbeiten_save', 'Arbeit speichern')}
              </Button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};

export default JobModal;
