import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Wallet, CreditCard, Coins, CheckCircle2, Lock, LockOpen } from 'lucide-react';
import { useSalesKasse } from '../hooks/useSalesKasse';
import useCurrency from '../hooks/useCurrency';
import { DENOMS, kasseCash } from '../utils/gluehweinFinance';
import DecimalInput from './DecimalInput';
import Button from './Button';
import './Input.css';
import './DataTable.css';
import './GluehweinKasse.css';

// Error codes thrown by useSalesKasse -> German messages for onError.
const KASSE_ERRORS = {
  KASSE_LOCKED: 'Die Kasse ist übernommen und gesperrt. Zum Ändern zuerst „Kasse entsperren“.',
  YEAR_LOCKED: 'Dieses Jahr ist gesperrt. Die Kasse kann nicht geändert werden.',
  INVALID_AMOUNT: 'Ungültiger Betrag. Bitte eine Zahl ab 0 eingeben.',
  INVALID_COUNT: 'Ungültige Anzahl. Bitte eine ganze Zahl ab 0 eingeben.',
};
const kasseErrorMessage = (err, fallback) => KASSE_ERRORS[err?.message] || fallback;

const AUTOSAVE_MS = 400;
const PHASES = ['start', 'end'];

const toInputValue = (v) => (v == null ? '' : String(v));
// Count map { [cents]: qty } -> input strings ('' for 0 / missing).
const toCountInputs = (map) => Object.fromEntries(DENOMS.map((c) => [c, map?.[c] ? String(map[c]) : '']));
const toCountMap = (inputs) => Object.fromEntries(DENOMS.map((c) => [c, Number(inputs?.[c]) || 0]));

const denomLabel = (cents) => `${(cents / 100).toLocaleString('de-DE', {
  minimumFractionDigits: cents < 100 ? 2 : 0,
  maximumFractionDigits: 2,
})} €`;

/**
 * Kasse of a Verkaufsaktion (action + scout year): Kartenzahlung + Bargeldkasse (count per denomination at
 * Start and Ende; the cash taken is Ende − Start). Both count live in Finanzen and the Saldo (each input is
 * saved on blur and after a short pause). "Kasse übernehmen" locks the inputs; "Kasse entsperren" reopens them.
 * action: SALES_ACTIONS entry (or its key).
 */
const GluehweinKasse = ({ action, year, yearLocked, onError }) => {
  const actionKey = typeof action === 'string' ? action : action?.key;
  const { fetchKasse, saveCard, saveCount, lockKasse, unlockKasse } = useSalesKasse(actionKey);
  const formatCurrency = useCurrency();
  const [kasse, setKasse] = useState(null);    // fetchKasse shape | null
  const [card, setCard] = useState('');        // dot-number string from DecimalInput
  const [counts, setCounts] = useState({ start: toCountInputs(), end: toCountInputs() });
  const [loadedYear, setLoadedYear] = useState(null);
  const [busy, setBusy] = useState(false);     // lock / unlock running
  const loading = loadedYear !== year;

  // Pending autosaves per cell ('start:50' -> timer) and one queue so writes land in order.
  const timers = useRef(new Map());
  const queue = useRef(Promise.resolve());
  const countsRef = useRef(counts);
  useEffect(() => { countsRef.current = counts; }, [counts]);

  const apply = useCallback((k) => {
    setKasse(k || null);
    setCard(toInputValue(k?.card_amount));
    setCounts({ start: toCountInputs(k?.start), end: toCountInputs(k?.end) });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const k = await fetchKasse(year);
        if (!cancelled) apply(k);
      } catch (err) {
        if (!cancelled) onError?.(kasseErrorMessage(err, 'Kasse konnte nicht geladen werden.'));
      } finally {
        if (!cancelled) setLoadedYear(year);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, actionKey]);

  const reload = useCallback(async () => {
    apply(await fetchKasse(year));
  }, [fetchKasse, year, apply]);

  const enqueue = useCallback((fn) => {
    const p = queue.current.then(fn);
    queue.current = p.catch(() => {});
    return p;
  }, []);

  const saveCell = useCallback((phase, cents) => {
    const key = `${phase}:${cents}`;
    clearTimeout(timers.current.get(key));
    timers.current.delete(key);
    const qty = Number(countsRef.current[phase][cents]) || 0;
    return enqueue(() => saveCount(year, phase, cents, qty)).catch(async (err) => {
      onError?.(kasseErrorMessage(err, 'Kasse konnte nicht gespeichert werden.'));
      try { await reload(); } catch { /* keep current state */ }
    });
  }, [enqueue, saveCount, year, onError, reload]);

  // Saves every pending cell now (before lock, on unmount).
  const flushCells = useCallback(() => {
    const keys = [...timers.current.keys()];
    return Promise.all(keys.map((key) => {
      const [phase, cents] = key.split(':');
      return saveCell(phase, Number(cents));
    }));
  }, [saveCell]);

  const flushRef = useRef(flushCells);
  useEffect(() => { flushRef.current = flushCells; }, [flushCells]);
  useEffect(() => () => { flushRef.current(); }, []);

  const locked = !!kasse?.locked;
  const readOnly = yearLocked || !kasse?.id || loading;
  const disabled = readOnly || locked || busy;

  const handleCountChange = (phase, cents, raw) => {
    const value = String(raw).replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 5);
    setCounts((prev) => ({ ...prev, [phase]: { ...prev[phase], [cents]: value } }));
    const key = `${phase}:${cents}`;
    clearTimeout(timers.current.get(key));
    timers.current.set(key, setTimeout(() => saveCell(phase, cents), AUTOSAVE_MS));
  };

  const handleCountBlur = (phase, cents) => {
    if (timers.current.has(`${phase}:${cents}`)) saveCell(phase, cents);
  };

  const storedCard = toInputValue(kasse?.card_amount);
  const cardDirty = card.trim() !== storedCard;

  const persistCard = useCallback(async () => {
    const value = card.trim();
    await enqueue(() => saveCard(year, value));
    setKasse((k) => (k ? { ...k, card_amount: value === '' ? null : Math.round(Number(value) * 100) / 100 } : k));
  }, [card, enqueue, saveCard, year]);

  const handleCardBlur = async () => {
    if (disabled || !cardDirty) return;
    try {
      await persistCard();
    } catch (err) {
      onError?.(kasseErrorMessage(err, 'Kartenzahlung konnte nicht gespeichert werden.'));
      try { await reload(); } catch { /* keep current state */ }
    }
  };

  const handleLock = async (lock) => {
    if (readOnly || busy) return;
    setBusy(true);
    try {
      if (lock) {
        await flushCells();
        if (cardDirty) await persistCard();
        await enqueue(() => lockKasse(year));
      } else {
        await enqueue(() => unlockKasse(year));
      }
      await reload();
    } catch (err) {
      onError?.(kasseErrorMessage(err, lock ? 'Kasse konnte nicht übernommen werden.' : 'Kasse konnte nicht entsperrt werden.'));
      try { await reload(); } catch { /* keep current state */ }
    } finally {
      setBusy(false);
    }
  };

  const cash = useMemo(() => kasseCash({
    start: toCountMap(counts.start),
    end: toCountMap(counts.end),
    legacy: kasse?.counted_cash,
  }), [counts, kasse?.counted_cash]);
  const cardAmount = Math.round((Number(card) || 0) * 100) / 100;
  const grandTotal = Math.round((cash.total + cardAmount) * 100) / 100;
  const showLegacy = cash.legacy !== 0;

  const cardId = `kasse-card-${actionKey || 'action'}`;

  return (
    <div className="gw-kasse-wrap">
      {loading ? (
        <div className="card gw-kasse"><div className="gw-kasse-note">Laden…</div></div>
      ) : (
        <>
          <div className="card gw-kasse">
            <div className="gw-kasse-header">
              <div className="gw-kasse-icon card-pay"><CreditCard size={20} /></div>
              <h3 className="gw-kasse-title">Kartenzahlung</h3>
              {locked && (
                <span className="gw-kasse-badge"><CheckCircle2 size={14} /> übernommen</span>
              )}
            </div>
            <div className="input-group gw-kasse-field">
              <label className="input-label" htmlFor={cardId}>Summe Kartenzahlungen (€)</label>
              <DecimalInput
                id={cardId}
                className="input-field gw-kasse-input"
                value={card}
                onChange={(e) => setCard(e.target.value)}
                onBlur={handleCardBlur}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                disabled={disabled}
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="card gw-kasse">
            <div className="gw-kasse-header">
              <div className="gw-kasse-icon"><Coins size={20} /></div>
              <h3 className="gw-kasse-title">Bargeldkasse</h3>
            </div>
            <p className="gw-kasse-help">
              Anzahl je Münze/Schein zu Beginn (Start) und am Ende zählen. Eingenommen = Ende − Start.
            </p>

            <div className="data-table-container gw-kasse-table-wrap">
              <table className="data-table gw-kasse-table">
                <colgroup>
                  <col className="gw-kasse-col-denom" />
                  <col className="gw-kasse-col-count" />
                  <col className="gw-kasse-col-count" />
                  <col className="gw-kasse-col-diff" />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th>Stückelung</th>
                    <th>Start</th>
                    <th>Ende</th>
                    <th>Differenz</th>
                    <th className="num">Betrag</th>
                  </tr>
                </thead>
                <tbody>
                  {cash.perDenom.map((d) => (
                    <tr key={d.cents}>
                      <td className="dt-mono dt-strong">{denomLabel(d.cents)}</td>
                      {PHASES.map((phase) => (
                        <td key={phase}>
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            className="input-field gw-kasse-count"
                            aria-label={`${phase === 'start' ? 'Start' : 'Ende'} ${denomLabel(d.cents)}`}
                            value={counts[phase][d.cents]}
                            onChange={(e) => handleCountChange(phase, d.cents, e.target.value)}
                            onBlur={() => handleCountBlur(phase, d.cents)}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            disabled={disabled}
                            placeholder="0"
                          />
                        </td>
                      ))}
                      <td className={`dt-mono${d.diff === 0 ? ' dt-muted' : ''}`}>{d.diff} Stk</td>
                      <td className={`num dt-mono${d.amount === 0 ? ' dt-muted' : ''}`}>
                        {formatCurrency(d.amount)}
                      </td>
                    </tr>
                  ))}
                  {showLegacy && (
                    <tr className="gw-kasse-legacy">
                      <td colSpan={4} title="Früher gezählter Gesamtbetrag (vor der Zählung nach Stückelung)">
                        Sonstiger Bargeldbetrag (Altbestand)
                      </td>
                      <td className="num dt-mono">{formatCurrency(cash.legacy)}</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>Summe</td>
                    <td className={`num dt-mono${cash.total < 0 ? ' gw-kasse-negative' : ''}`}>{formatCurrency(cash.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="card gw-kasse">
            <div className="gw-kasse-header">
              <div className="gw-kasse-icon"><Wallet size={20} /></div>
              <h3 className="gw-kasse-title">Zusammenfassung</h3>
            </div>
            <div className="gw-kasse-sum">
              <div className="gw-kasse-sum-row">
                <span>Bargeld gesamt</span>
                <span className={`dt-mono${cash.total < 0 ? ' gw-kasse-negative' : ''}`}>{formatCurrency(cash.total)}</span>
              </div>
              <div className="gw-kasse-sum-row">
                <span>Kartenzahlung</span>
                <span className="dt-mono">{formatCurrency(cardAmount)}</span>
              </div>
              <div className="gw-kasse-sum-row gw-kasse-sum-total">
                <span>Gesamt Kasse</span>
                <span className={`dt-mono${grandTotal < 0 ? ' gw-kasse-negative' : ''}`}>{formatCurrency(grandTotal)}</span>
              </div>
            </div>
            <div className="gw-kasse-note">
              <span>Bargeld und Kartenzahlung zählen automatisch als Einnahmen im Tab Finanzen.</span>
            </div>

            {readOnly ? (
              <div className="gw-kasse-note">
                <Lock size={16} />
                <span>{yearLocked ? 'Dieses Jahr ist gesperrt. Die Kasse ist schreibgeschützt.' : 'Für dieses Jahr gibt es keine Kasse. Sie ist schreibgeschützt.'}</span>
              </div>
            ) : (
              <div className="gw-kasse-actions">
                {locked ? (
                  <Button variant="secondary" size="md" icon={LockOpen} onClick={() => handleLock(false)} disabled={busy}>
                    Kasse entsperren
                  </Button>
                ) : (
                  <Button variant="primary" size="md" icon={CheckCircle2} onClick={() => handleLock(true)} disabled={busy}>
                    Kasse übernehmen
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default GluehweinKasse;
