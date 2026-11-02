import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import Button from './Button';
import './DatePicker.css';
import './DateRangeField.css';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

const parseISO = (str) => {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const toISO = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDisplay = (str) => {
  const d = parseISO(str);
  return d ? d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
};

/**
 * One date field for a period, built from the shared DatePicker look (datepicker-input-wrap, datepicker-popup,
 * datepicker-grid). The first day clicked is the start, the second the end; a day before the start (or a click
 * after a full period) starts a new period. onChange(start, end): ISO strings, '' when not set.
 * initialView: ISO date whose month opens while nothing is set.
 */
const DateRangeField = ({ title, start, end, initialView, disabled, onChange }) => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() });
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const handleKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleOpen = () => {
    if (disabled) return;
    const shown = parseISO(start || end || initialView) || new Date();
    setView({ year: shown.getFullYear(), month: shown.getMonth() });
    setOpen(true);
  };

  const prevMonth = () => setView((v) => (v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 }));
  const nextMonth = () => setView((v) => (v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 }));

  const pick = (iso) => {
    if (!start || end || iso < start) {
      onChange(iso, '');
      return;
    }
    onChange(start, iso);
    setOpen(false);
  };

  // Monday-first calendar grid.
  const firstDay = new Date(view.year, view.month, 1);
  const lastDay = new Date(view.year, view.month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(d);

  const startDate = parseISO(start);
  const endDate = parseISO(end);
  const text = start || end
    ? `${start ? formatDisplay(start) : '…'} – ${end ? formatDisplay(end) : '…'}`
    : '';

  return (
    <div className="daterange-wrap" ref={wrapRef}>
      <div className={`datepicker-input-wrap${open ? ' focused' : ''}${disabled ? ' disabled' : ''}`} title={title}>
        <span className={`datepicker-input daterange-text${text ? '' : ' daterange-empty'}`}>
          {text || 'TT.MM.JJJJ – TT.MM.JJJJ'}
        </span>
        <button
          type="button"
          className="datepicker-icon-btn"
          onClick={handleOpen}
          tabIndex={-1}
          disabled={disabled}
          aria-label={title}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <Calendar size={16} className="datepicker-icon" />
        </button>
      </div>

      {open && (
        <div className="datepicker-popup daterange-popup" role="dialog" aria-label={title}>
          <div className="datepicker-header">
            <button type="button" className="dp-nav-btn" onClick={prevMonth} aria-label="Vorheriger Monat">
              <ChevronLeft size={16} />
            </button>
            <span className="dp-month-label">{MONTHS[view.month]} {view.year}</span>
            <button type="button" className="dp-nav-btn" onClick={nextMonth} aria-label="Nächster Monat">
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="datepicker-grid">
            {WEEKDAYS.map((wd) => <div key={wd} className="dp-weekday">{wd}</div>)}
            {cells.map((day, i) => {
              if (!day) return <div key={`e${i}`} />;
              const iso = toISO(new Date(view.year, view.month, day));
              const isEdge = iso === start || iso === end;
              const inRange = startDate && endDate && parseISO(iso) > startDate && parseISO(iso) < endDate;
              const cls = ['dp-day', isEdge && 'selected', inRange && 'daterange-in-range']
                .filter(Boolean).join(' ');
              return (
                <button key={iso} type="button" className={cls} onClick={() => pick(iso)}>
                  {day}
                </button>
              );
            })}
          </div>

          <div className="daterange-footer">
            <span>{start && !end ? 'Ende wählen' : 'Start wählen'}</span>
            <Button variant="ghost" size="sm" type="button" onClick={() => onChange('', '')} disabled={!start && !end}>
              Zurücksetzen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateRangeField;
