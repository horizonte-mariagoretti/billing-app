import { useRef, useState } from 'react';
import { Lock, Unlock, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import Button from './Button';
import ConfirmDialog from './ConfirmDialog';
import useYear, { setYearLocked } from '../hooks/useYear';
import { scoutYearLabel } from '../utils/scoutYear';
import './YearSwitcher.css';

const YearSwitcher = () => {
  const { years, currentYear, selectedYear, setSelectedYear, isLocked, label, startNewYear, refreshYears } = useYear();
  const [confirm, setConfirm] = useState(null); // 'new' | 'unlock' | 'lock' | null
  const [error, setError] = useState('');
  const busyRef = useRef(false);

  const idx = years.findIndex(y => y.year === selectedYear);
  const older = idx >= 0 ? years[idx + 1] : undefined;
  const newer = idx > 0 ? years[idx - 1] : undefined;

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

  const optionText = (y) => {
    let text = scoutYearLabel(y.year);
    if (y.year === currentYear) text += ' (aktuell)';
    if (y.locked) text += ' (gesperrt)';
    return text;
  };

  return (
    <div className="year-switcher">
      <button type="button" className="year-switcher-nav" onClick={() => older && setSelectedYear(older.year)}
        disabled={!older} aria-label="Vorheriges Jahr" title="Vorheriges Jahr">
        <ChevronLeft size={16} />
      </button>
      <div className="year-switcher-select-wrap">
        {isLocked && <Lock size={14} className="year-switcher-lock" aria-hidden="true" />}
        <select className="year-switcher-select" value={selectedYear} aria-label="Jahr"
          onChange={(e) => setSelectedYear(e.target.value)}>
          {years.length === 0 && <option value={selectedYear}>{label}</option>}
          {years.map(y => <option key={y.year} value={y.year}>{optionText(y)}</option>)}
        </select>
      </div>
      <button type="button" className="year-switcher-nav" onClick={() => newer && setSelectedYear(newer.year)}
        disabled={!newer} aria-label="Nächstes Jahr" title="Nächstes Jahr">
        <ChevronRight size={16} />
      </button>
      {isLocked && <span className="year-switcher-badge">Nur Lesen</span>}
      {isLocked && selectedYear !== currentYear && (
        <Button variant="ghost" size="sm" icon={Unlock} onClick={() => setConfirm('unlock')}>Entsperren</Button>
      )}
      {!isLocked && selectedYear !== currentYear && (
        <Button variant="ghost" size="sm" icon={Lock} onClick={() => setConfirm('lock')}>Sperren</Button>
      )}
      {selectedYear === currentYear && (
        <Button variant="secondary" size="sm" icon={Plus} onClick={() => setConfirm('new')}>Neues Jahr starten</Button>
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
