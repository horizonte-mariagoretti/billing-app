import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import './DatePicker.css';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function parseISO(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplay(str) {
  if (!str) return '';
  const d = parseISO(str);
  if (!d) return str;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const DatePicker = ({ label, value, onChange, disabled }) => {
  const [open, setOpen] = useState(false);
  const [inputText, setInputText] = useState(() => value ? formatDisplay(value) : '');
  const [viewYear, setViewYear] = useState(() => {
    const d = parseISO(value);
    return d ? d.getFullYear() : new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const d = parseISO(value);
    return d ? d.getMonth() : new Date().getMonth();
  });

  const wrapRef = useRef(null);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selectedDate = parseISO(value);

  // Sync display text when value changes externally (e.g. calendar selection)
  useEffect(() => {
    setInputText(value ? formatDisplay(value) : '');
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleOpen = () => {
    if (disabled) return;
    if (value) {
      const d = parseISO(value);
      if (d) { setViewYear(d.getFullYear()); setViewMonth(d.getMonth()); }
    }
    setOpen(true);
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const handleInputChange = (e) => {
    setInputText(e.target.value);
  };

  const handleInputBlur = () => {
    const trimmed = inputText.trim();
    if (!trimmed) {
      onChange('');
      return;
    }
    const m = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) {
      const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
      if (!isNaN(d.getTime())) {
        onChange(toISO(d));
        return;
      }
    }
    // Revert to current value if parse fails
    setInputText(value ? formatDisplay(value) : '');
  };

  const handleCalendarClick = (e) => {
    e.preventDefault();
    handleOpen();
  };

  const selectDay = (day) => {
    const d = new Date(viewYear, viewMonth, day);
    onChange(toISO(d));
    setOpen(false);
  };

  // Build calendar grid (Monday-first)
  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay = new Date(viewYear, viewMonth + 1, 0);
  // 0=Sun..6=Sat → convert to Mon-first (0=Mon..6=Sun)
  const startDow = (firstDay.getDay() + 6) % 7;
  const days = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);

  return (
    <div className="datepicker-wrap" ref={wrapRef}>
      {label && <label className="datepicker-label">{label}</label>}
      <div className={`datepicker-input-wrap${open ? ' focused' : ''}${disabled ? ' disabled' : ''}`}>
        <input
          type="text"
          className="datepicker-input"
          value={inputText}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          placeholder="TT.MM.JJJJ"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
        />
        <button
          type="button"
          className="datepicker-icon-btn"
          onClick={handleCalendarClick}
          tabIndex={-1}
          disabled={disabled}
          aria-label="Kalender öffnen"
        >
          <Calendar size={16} className="datepicker-icon" />
        </button>
      </div>

      {open && (
        <div className="datepicker-popup" role="dialog" aria-label="Datumsauswahl">
          <div className="datepicker-header">
            <button type="button" className="dp-nav-btn" onClick={prevMonth} aria-label="Vorheriger Monat">
              <ChevronLeft size={16} />
            </button>
            <span className="dp-month-label">{MONTHS[viewMonth]} {viewYear}</span>
            <button type="button" className="dp-nav-btn" onClick={nextMonth} aria-label="Nächster Monat">
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="datepicker-grid">
            {WEEKDAYS.map(wd => (
              <div key={wd} className="dp-weekday">{wd}</div>
            ))}
            {days.map((day, i) => {
              if (!day) return <div key={`e${i}`} />;
              const thisDate = new Date(viewYear, viewMonth, day);
              thisDate.setHours(0, 0, 0, 0);
              const isToday = thisDate.getTime() === today.getTime();
              const isSelected = selectedDate && thisDate.getTime() === selectedDate.getTime();
              return (
                <button
                  key={day}
                  type="button"
                  className={`dp-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`}
                  onClick={() => selectDay(day)}
                >
                  {day}
                  {isToday && !isSelected && <span className="dp-today-dot" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default DatePicker;
