import React, { useState, useRef, useEffect, useMemo } from 'react';
import useHoris from '../hooks/useHoris';
import useFocusTrap from '../hooks/useFocusTrap';
import { useT } from '../hooks/useUiTranslations';
import { parseHoriLines } from '../utils/horiImport';
import Button from './Button';
import { AlertCircle, Check } from 'lucide-react';
import './ClientModal.css'; // shared .modal-overlay / .modal-content / .modal-actions styles
import './HoriModal.css';
import './DataTable.css'; // .dt-mono
import './BulkHoriModal.css';

const BulkHoriModal = ({ existing, onSave, onCancel, triggerRef }) => {
  const { saveHorisBulk } = useHoris();
  const t = useT();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const modalRef = useRef(null);
  useFocusTrap(modalRef, { active: true, triggerRef });

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const rows = useMemo(() => parseHoriLines(text, existing), [text, existing]);
  const valid = rows.filter((r) => r.status === 'ok');
  const skipped = rows.length - valid.length;

  const statusLabel = {
    ok: t('horis_bulk_status_ok', 'Wird importiert'),
    duplicate: t('horis_bulk_status_duplicate', 'Bereits vorhanden'),
    no_date: t('horis_bulk_status_no_date', 'Geburtsdatum fehlt'),
    bad_date: t('horis_bulk_status_bad_date', 'Ungültiges Datum'),
    no_last_name: t('horis_bulk_status_no_last_name', 'Nachname fehlt'),
  };

  const handleImport = async () => {
    if (!valid.length) return;
    setSaving(true);
    setSaveError(null);
    try {
      const n = await saveHorisBulk(valid);
      onSave(n);
    } catch (err) {
      console.error('Bulk Hori import failed:', err);
      setSaveError(t('horis_bulk_error', 'Import fehlgeschlagen. Es wurde nichts gespeichert.'));
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bulk-hori-title">
      <div className="modal-content horis-modal bulk-hori-modal" ref={modalRef}>
        <h2 id="bulk-hori-title">{t('horis_bulk_title', 'Mehrere Horis hinzufügen')}</h2>
        <p className="bulk-hori-help">
          {t('horis_bulk_help', 'Pro Zeile ein Hori: Vorname Nachname und Geburtsdatum, z. B. Anna Muster 14.03.2011. Kann direkt aus einer Tabelle eingefügt werden.')}
        </p>
        {saveError && (
          <div className="page-error" role="alert">
            <AlertCircle size={16} />
            <span>{saveError}</span>
          </div>
        )}
        <textarea
          className="input-field bulk-hori-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Anna Muster\t14.03.2011\nBen Beispiel\t02.11.2010'}
          aria-label={t('horis_bulk_title', 'Mehrere Horis hinzufügen')}
          rows={6}
          autoFocus
          spellCheck={false}
        />

        {rows.length > 0 && (
          <div className="bulk-hori-preview">
            <table className="bulk-hori-table">
              <thead>
                <tr>
                  <th>{t('horis_field_first_name', 'Vorname')}</th>
                  <th>{t('horis_field_last_name', 'Nachname')}</th>
                  <th>{t('horis_field_birth_date', 'Geburtsdatum')}</th>
                  <th>{t('horis_age_label', 'Alter')}</th>
                  <th>{t('horis_bulk_col_status', 'Status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className={r.status === 'ok' ? '' : 'bulk-hori-row-bad'}>
                    <td>{r.first_name || '—'}</td>
                    <td>{r.last_name || '—'}</td>
                    <td className="dt-mono">{r.birth_date ? r.birth_date.split('-').reverse().join('.') : '—'}</td>
                    <td>{r.age ?? '—'}</td>
                    <td>
                      <span className={`bulk-hori-status ${r.status}`}>
                        {r.status === 'ok' && <Check size={13} aria-hidden="true" />}
                        {statusLabel[r.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="modal-actions">
          {rows.length > 0 && (
            <span className="bulk-hori-summary">
              {valid.length} {t('horis_bulk_summary_import', 'werden importiert')}
              {skipped > 0 && `, ${skipped} ${t('horis_bulk_summary_skipped', 'übersprungen')}`}
            </span>
          )}
          <Button variant="ghost" type="button" onClick={onCancel}>{t('btn_cancel', 'Abbrechen')}</Button>
          <Button variant="primary" type="button" onClick={handleImport} disabled={saving || valid.length === 0}>
            {saving
              ? t('horis_saving', 'Speichern…')
              : `${valid.length || ''} ${t('horis_bulk_import', 'Horis importieren')}`.trim()}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default BulkHoriModal;
