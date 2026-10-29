import { useState, useEffect, useCallback } from 'react';
import { Wallet, Save, CheckCircle2, Lock } from 'lucide-react';
import { useSalesKasse } from '../hooks/useSalesKasse';
import useCurrency from '../hooks/useCurrency';
import DecimalInput from './DecimalInput';
import ConfirmDialog from './ConfirmDialog';
import Button from './Button';
import './Input.css';
import './GluehweinKasse.css';

// Error codes thrown by useSalesKasse -> German messages for onError.
const KASSE_ERRORS = {
  KASSE_TAKEN: 'Die Kasse wurde bereits übernommen und kann nicht mehr geändert werden.',
  ALREADY_TAKEN: 'Die Kasse wurde bereits übernommen.',
  KASSE_EMPTY: 'Bitte zuerst einen Bargeldbetrag größer als 0 eintragen.',
  YEAR_LOCKED: 'Dieses Jahr ist gesperrt. Die Kasse kann nicht geändert werden.',
  INVALID_AMOUNT: 'Ungültiger Betrag. Bitte eine Zahl ab 0 eingeben.',
};
const kasseErrorMessage = (err, fallback) => KASSE_ERRORS[err?.message] || fallback;

const toInputValue = (v) => (v == null ? '' : String(v));

/**
 * Kasse (Bargeld) of a Verkaufsaktion: one counted cash total per event (action + scout year).
 * "Kasse übernehmen" books it once as an Einnahme; afterwards the Kasse is read-only.
 * action: SALES_ACTIONS entry (or its key). The Einnahme itself is listed in the Finanzen tab.
 */
const GluehweinKasse = ({ action, year, yearLocked, onError }) => {
  const actionKey = typeof action === 'string' ? action : action?.key;
  const { fetchKasse, saveKasse, takeOverKasse } = useSalesKasse(actionKey);
  const formatCurrency = useCurrency();
  const [kasse, setKasse] = useState(null); // { id, counted_cash, entry_id } | null
  const [value, setValue] = useState('');   // dot-number string from DecimalInput
  const [loadedYear, setLoadedYear] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const loading = loadedYear !== year;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const k = await fetchKasse(year);
        if (cancelled) return;
        setKasse(k || null);
        setValue(toInputValue(k?.counted_cash));
      } catch (err) {
        if (!cancelled) onError?.(kasseErrorMessage(err, 'Kasse konnte nicht geladen werden.'));
      } finally {
        if (!cancelled) setLoadedYear(year);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, actionKey]);

  const taken = !!kasse?.entry_id;
  const readOnly = yearLocked || !kasse || loading;
  const disabled = readOnly || taken || saving;
  const stored = kasse?.counted_cash ?? null;
  const dirty = value.trim() !== toInputValue(stored);

  const reload = useCallback(async () => {
    const k = await fetchKasse(year);
    setKasse(k || null);
    setValue(toInputValue(k?.counted_cash));
  }, [fetchKasse, year]);

  const handleSave = async () => {
    if (disabled || !dirty) return;
    setSaving(true);
    try {
      await saveKasse(year, value.trim());
      await reload();
    } catch (err) {
      onError?.(kasseErrorMessage(err, 'Kasse konnte nicht gespeichert werden.'));
    } finally {
      setSaving(false);
    }
  };

  const handleTakeOver = async () => {
    setConfirmOpen(false);
    if (disabled) return;
    setSaving(true);
    try {
      if (dirty) await saveKasse(year, value.trim());
      await takeOverKasse(year);
      await reload();
    } catch (err) {
      onError?.(kasseErrorMessage(err, 'Kasse konnte nicht übernommen werden.'));
      try { await reload(); } catch { /* keep current state */ }
    } finally {
      setSaving(false);
    }
  };

  const inputId = `kasse-counted-${actionKey || 'action'}`;
  const pending = Number(String(value).replace(',', '.')) || 0;

  return (
    <div className="card gw-kasse">
      <div className="gw-kasse-header">
        <div className="gw-kasse-icon"><Wallet size={20} /></div>
        <h3 className="gw-kasse-title">Kasse (Bargeld)</h3>
        {taken && (
          <span className="gw-kasse-badge" title={`Einnahme verknüpft (ID ${kasse.entry_id})`}>
            <CheckCircle2 size={14} /> übernommen
          </span>
        )}
      </div>

      {loading ? (
        <div className="gw-kasse-note">Laden…</div>
      ) : (
        <>
          <div className="gw-kasse-row">
            <div className="input-group gw-kasse-field">
              <label className="input-label" htmlFor={inputId}>Gezählter Bargeldbetrag gesamt</label>
              <DecimalInput
                id={inputId}
                className="input-field gw-kasse-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={handleSave}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                disabled={disabled}
                placeholder="0,00"
              />
            </div>
            {!readOnly && !taken && (
              <Button variant="secondary" size="md" icon={Save} onClick={handleSave} disabled={saving || !dirty}>
                Speichern
              </Button>
            )}
          </div>

          <div className="gw-kasse-amount">
            <span className="gw-kasse-amount-label">Aktueller Betrag</span>
            <span className="gw-kasse-amount-value">{stored == null ? '–' : formatCurrency(Number(stored))}</span>
          </div>

          {taken ? (
            <div className="gw-kasse-note gw-kasse-note-ok">
              <CheckCircle2 size={16} />
              <span>Kasse übernommen: als Einnahme gebucht (verknüpfte Einnahme ID {kasse.entry_id}). Löschen dieser Einnahme im Tab Finanzen gibt die Kasse wieder frei.</span>
            </div>
          ) : readOnly ? (
            <div className="gw-kasse-note">
              <Lock size={16} />
              <span>{yearLocked ? 'Dieses Jahr ist gesperrt. Die Kasse ist schreibgeschützt.' : 'Für dieses Jahr gibt es keine Kasse. Sie ist schreibgeschützt.'}</span>
            </div>
          ) : (
            <div className="gw-kasse-actions">
              <Button
                variant="primary"
                size="md"
                icon={CheckCircle2}
                onClick={() => setConfirmOpen(true)}
                disabled={saving || pending <= 0}
              >
                Kasse übernehmen
              </Button>
            </div>
          )}
        </>
      )}

      {confirmOpen && (
        <ConfirmDialog
          title="Kasse übernehmen?"
          message={`Der gezählte Bargeldbetrag (${formatCurrency(pending)}) wird einmalig als Einnahme gebucht. Das macht man am Ende der Aktion. Danach ist die Kasse gesperrt.`}
          confirmLabel="Übernehmen"
          onConfirm={handleTakeOver}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
};

export default GluehweinKasse;
