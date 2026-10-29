import { useEffect, useRef, useState } from 'react';
import { Lock, Unlock, Plus, ChevronDown, Check } from 'lucide-react';
import Button from './Button';
import ConfirmDialog from './ConfirmDialog';
import useYear, { setYearLocked } from '../hooks/useYear';
import { scoutYearLabel } from '../utils/scoutYear';
import './YearSwitcher.css';

const YearSwitcher = () => {
  const { years, currentYear, selectedYear, setSelectedYear, isLocked, label, startNewYear, refreshYears } = useYear();
  const [confirm, setConfirm] = useState(null); // 'new' | 'unlock' | 'lock' | null
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const wrapRef = useRef(null);

  // Close the year list on outside click or Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = async (fn) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError('');
    try {
      await fn();
      setConfirm(null);
    } catch (err) {
      setError(err?.message || String(err));
      setConfirm(null);
    } finally {
      busyRef.current = false;
    }
  };

  const handleConfirm = () => (confirm === 'new'
    ? run(() => startNewYear())
    : run(async () => { await setYearLocked(selectedYear, confirm === 'lock'); await refreshYears(); }));

  const dialog = {
    new: {
      title: 'Neues Jahr starten',
      message: `Neues Jahr ${scoutYearLabel(currentYear + 1)} starten? Lasagnen-Bestellungen, Bezahlt-Status und Lagerbestand starten bei 0. Hori-Liste, Preise und Lagerbeitrag werden übernommen. ${scoutYearLabel(currentYear)} wird gesperrt.`,
      confirmLabel: 'Starten',
    },
    unlock: {
      title: 'Jahr entsperren',
      message: `${label} wieder bearbeitbar machen? Nur für Korrekturen.`,
      confirmLabel: 'Entsperren',
    },
    lock: {
      title: 'Jahr sperren?',
      message: `${label} wird wieder gesperrt. Die Werte bleiben erhalten.`,
      confirmLabel: 'Sperren',
    },
  }[confirm];

  const pick = (year) => {
    setOpen(false);
    setSelectedYear(year);
  };

  return (
    <div className="year-switcher" ref={wrapRef}>
      <div className="year-switcher-picker">
      <button
        type="button"
        className="year-switcher-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Jahr"
        onClick={() => setOpen(o => !o)}
      >
        <span>{label}</span>
        {isLocked && <Lock size={14} className="year-switcher-lock" aria-hidden="true" />}
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {open && (
        <ul className="year-switcher-list" role="listbox" aria-label="Jahr">
          {years.length === 0 && <li role="option" aria-selected="true" className="year-switcher-option is-selected">{label}</li>}
          {years.map(y => {
            const isSel = y.year === selectedYear;
            return (
              <li
                key={y.year}
                role="option"
                aria-selected={isSel}
                className={`year-switcher-option${isSel ? ' is-selected' : ''}`}
                onClick={() => pick(y.year)}
              >
                <span>{scoutYearLabel(y.year)}</span>
                {isSel && <Check size={13} aria-hidden="true" />}
              </li>
            );
          })}
          {selectedYear === currentYear && (
            <li
              role="option"
              aria-selected={false}
              className="year-switcher-option year-switcher-option--create"
              title="Neues Jahr starten"
              onClick={() => { setOpen(false); setConfirm('new'); }}
            >
              <Plus size={13} aria-hidden="true" />
              <span>Neues Jahr</span>
            </li>
          )}
        </ul>
      )}
      </div>

      {isLocked && selectedYear !== currentYear && (
        <Button variant="ghost" size="md" icon={Unlock} className="year-switcher-lockbtn" onClick={() => setConfirm('unlock')} aria-label="Entsperren" title="Entsperren" />
      )}
      {!isLocked && selectedYear !== currentYear && (
        <Button variant="ghost" size="md" icon={Lock} className="year-switcher-lockbtn" onClick={() => setConfirm('lock')} aria-label="Sperren" title="Sperren" />
      )}
      {error && <span className="year-switcher-error" role="alert">{error}</span>}
      {dialog && (
        <ConfirmDialog
          title={dialog.title}
          message={dialog.message}
          confirmLabel={dialog.confirmLabel}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
};

export default YearSwitcher;
