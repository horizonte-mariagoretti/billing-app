import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useT, getUiLang } from '../hooks/useUiTranslations';
import { formatTimeRange } from '../utils/jobHours';
import './JobCalendar.css';

const MAX_CHIPS = 3;

const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Month calendar of jobs (Monday-first). Clicking a job opens it, clicking a
 * day's "+" adds a new job on that date.
 */
const JobCalendar = ({ jobs, onOpenJob, onNewOnDate }) => {
  const t = useT();
  const locale = getUiLang() === 'fr' ? 'fr-FR' : 'de-DE';
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [expanded, setExpanded] = useState(null); // ISO date whose full list is shown

  const todayIso = toISO(new Date());

  const monthLabel = cursor.toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  // 2024-01-01 is a Monday
  const weekdayLabels = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' })),
    [locale]
  );

  const jobsByDate = useMemo(() => {
    const map = new Map();
    jobs.forEach((j) => {
      if (!j.date) return;
      if (!map.has(j.date)) map.set(j.date, []);
      map.get(j.date).push(j);
    });
    map.forEach((list) => list.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')));
    return map;
  }, [jobs]);

  // Always 6 weeks so the grid height doesn't jump between months.
  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // Monday = 0
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return { date: d, iso: toISO(d), inMonth: d.getMonth() === cursor.getMonth() };
    });
  }, [cursor]);

  const monthJobCount = days.reduce((n, d) => (d.inMonth ? n + (jobsByDate.get(d.iso)?.length || 0) : n), 0);

  const shift = (delta) => {
    setExpanded(null);
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  };
  const goToday = () => {
    setExpanded(null);
    const n = new Date();
    setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
  };

  return (
    <div className="job-cal">
      <div className="job-cal-toolbar">
        <div className="job-cal-nav">
          <button type="button" className="job-cal-nav-btn" onClick={() => shift(-1)} aria-label={t('arbeiten_cal_prev', 'Voriger Monat')}>
            <ChevronLeft size={18} />
          </button>
          <button type="button" className="job-cal-nav-btn" onClick={() => shift(1)} aria-label={t('arbeiten_cal_next', 'Nächster Monat')}>
            <ChevronRight size={18} />
          </button>
          <button type="button" className="job-cal-today" onClick={goToday}>{t('arbeiten_cal_today', 'Heute')}</button>
        </div>
        <h3 className="job-cal-title" aria-live="polite">{monthLabel}</h3>
        <span className="job-cal-count">{monthJobCount}</span>
      </div>

      <div className="job-cal-grid" role="grid" aria-label={monthLabel}>
        {weekdayLabels.map((w) => (
          <div key={w} className="job-cal-weekday" role="columnheader">{w}</div>
        ))}
        {days.map(({ date, iso, inMonth }) => {
          const list = jobsByDate.get(iso) || [];
          const isExpanded = expanded === iso;
          const shown = isExpanded ? list : list.slice(0, MAX_CHIPS);
          const hidden = list.length - shown.length;
          return (
            <div
              key={iso}
              role="gridcell"
              className={`job-cal-day${inMonth ? '' : ' outside'}${iso === todayIso ? ' today' : ''}`}
            >
              <div className="job-cal-day-head">
                <span className="job-cal-day-num">{date.getDate()}</span>
                <button
                  type="button"
                  className="job-cal-add"
                  onClick={() => onNewOnDate(iso)}
                  aria-label={`${t('arbeiten_cal_add_on', 'Arbeit hinzufügen am')} ${date.toLocaleDateString(locale)}`}
                  title={t('arbeiten_add', 'Auftrag/Arbeit hinzufügen')}
                >
                  <Plus size={13} />
                </button>
              </div>
              <div className="job-cal-chips">
                {shown.map((j) => {
                  const time = formatTimeRange(j.start_time, j.end_time, !!j.open_end, t('jobs_open_prefix', 'ab'));
                  return (
                    <button
                      key={j.id}
                      type="button"
                      className={`job-cal-chip job-cal-chip--${j.status || 'planned'}`}
                      onClick={() => onOpenJob(j)}
                      title={[j.title, time, j.client_name].filter(Boolean).join(' · ')}
                    >
                      {time && <span className="job-cal-chip-time">{time}</span>}
                      <span className="job-cal-chip-title">{j.title || '—'}</span>
                    </button>
                  );
                })}
                {(hidden > 0 || (isExpanded && list.length > MAX_CHIPS)) && (
                  <button type="button" className="job-cal-more" onClick={() => setExpanded(isExpanded ? null : iso)}>
                    {isExpanded ? t('arbeiten_cal_less', 'weniger') : `+${hidden} ${t('arbeiten_cal_more', 'weitere')}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="job-cal-legend" aria-hidden="true">
        <span className="job-cal-legend-item job-cal-chip--planned">{t('arbeiten_status_planned', 'Geplant')}</span>
        <span className="job-cal-legend-item job-cal-chip--done">{t('arbeiten_status_done', 'Gearbeitet')}</span>
        <span className="job-cal-legend-item job-cal-chip--cancelled">{t('arbeiten_status_cancelled', 'Abgesagt')}</span>
      </div>
    </div>
  );
};

export default JobCalendar;
