import { useState, useEffect, useMemo } from 'react';
import {
  Wallet, ReceiptEuro, Clock, AlertCircle, FileText, Briefcase, UtensilsCrossed, Snowflake, Trophy,
  ChevronRight, CalendarDays, CheckCircle2, TrendingUp, TrendingDown,
} from 'lucide-react';
import useYear from '../hooks/useYear';
import useDashboard2, { scoutMonthKeys } from '../hooks/useDashboard2';
import { useT } from '../hooks/useUiTranslations';
import { scoutYearLabel } from '../utils/scoutYear';
import YearSwitcher from '../components/YearSwitcher';
import './Dashboard.css'; // shared design line: stat cards, chart card, recent cards, quick panel
import './Dashboard2.css';

const DEFAULT_CHART_MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const INCLUDE_ACTIONS_KEY = 'dashboard_include_sales_actions'; // shared with the classic Dashboard
const ACTION_ICONS = { lasagnen: UtensilsCrossed, gluehwein: Snowflake, baseball: Trophy };

const readIncludeActions = () => {
  try { return window.localStorage.getItem(INCLUDE_ACTIONS_KEY) !== '0'; } catch { return true; }
};

const parseIso = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
};

/**
 * Dashboard 2.0 — the scout-year cockpit. Built around the 10-second question "how are we doing, and what needs me?":
 *   1. Hero: Umsatz with the comparison to the Vorjahr (same period), the month course with the Vorjahr as ticks,
 *      and a Jahresplan strip (today, Verkaufsaktionen, Arbeiten) under the months.
 *   2. Next to it: the most urgent number (Offene Posten) and what needs attention, each with a link.
 *   3. Four stat cards, one card per Verkaufsaktion, the next Arbeiten and the most active Horis.
 * onNavigate(view): jumps to another page (same ids as the sidebar).
 */
const Dashboard2 = ({ settings, onNavigate }) => {
  const t = useT();
  const { selectedYear } = useYear();
  const { loadDashboard } = useDashboard2();
  const [state, setState] = useState({ year: null, data: null });
  const [error, setError] = useState(null);
  const [includeActions, setIncludeActionsState] = useState(readIncludeActions);

  const setIncludeActions = (v) => {
    setIncludeActionsState(v);
    try { window.localStorage.setItem(INCLUDE_ACTIONS_KEY, v ? '1' : '0'); } catch { /* keep in memory */ }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadDashboard(selectedYear);
        if (!cancelled) { setState({ year: selectedYear, data }); setError(null); }
      } catch {
        if (!cancelled) setError(t('d2_load_error', 'Das Dashboard konnte nicht geladen werden.'));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear]);

  const data = state.year === selectedYear ? state.data : null;
  const currency = settings?.default_currency || 'EUR';
  const fmt = (v) => (v ?? 0).toLocaleString('de-DE', { style: 'currency', currency, maximumFractionDigits: 0 });
  const fmtShort = (v) => {
    if (v >= 10000) return `${Math.round(v / 1000)}k`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return `${Math.round(v)}`;
  };
  const fmtHours = (v) => `${(v ?? 0).toLocaleString('de-DE', { maximumFractionDigits: 1 })} h`;
  const fmtDay = (iso) => {
    const p = parseIso(iso);
    return p ? new Date(p.y, p.m - 1, p.d).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }) : '';
  };
  const MONTHS = t('chart_months_short', DEFAULT_CHART_MONTHS.join(',')).split(',');
  const monthsKey = MONTHS.join('|');

  const nowKey = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  })();

  /* ── Umsatz per month, with the Vorjahr for the same month ── */
  const months = useMemo(() => {
    if (!data) return [];
    const sumActions = (list, key) => list.reduce((n, a) => n + (a.monthKey === key ? a.saldo : 0), 0);
    const ownActions = data.actions.map((a) => ({ monthKey: a.monthKey, saldo: a.summary?.saldo || 0 }));
    return scoutMonthKeys(data.year).map((key) => {
      const prevKey = `${Number(key.slice(0, 4)) - 1}${key.slice(4)}`;
      return {
        key,
        label: MONTHS[parseInt(key.slice(5, 7), 10) - 1],
        invoices: data.invoices.paidByMonth[key] || 0,
        actions: includeActions ? sumActions(ownActions, key) : 0,
        prev: (data.prev.paidByMonth[prevKey] || 0) + (includeActions ? sumActions(data.prev.actionSaldi, prevKey) : 0),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, includeActions, monthsKey]);

  const actionsSaldo = data ? data.actions.reduce((n, a) => n + (a.summary?.saldo || 0), 0) : 0;
  const revenue = data ? data.invoices.paid + (includeActions ? actionsSaldo : 0) : 0;

  // Vorjahr comparison: the current scout year up to this month, a past year as a whole, a future year none.
  const comparison = (() => {
    if (!data || months.length === 0) return null;
    const idx = months.findIndex((m) => m.key === nowKey);
    const currentYear = Number(nowKey.slice(0, 4)) - (Number(nowKey.slice(5)) < 9 ? 1 : 0);
    const upTo = idx >= 0 ? idx : (data.year < currentYear ? 11 : -1);
    if (upTo < 0) return null;
    const slice = months.slice(0, upTo + 1);
    const cur = slice.reduce((n, m) => n + m.invoices + m.actions, 0);
    const prev = slice.reduce((n, m) => n + m.prev, 0);
    return { cur, prev, delta: prev > 0 ? ((cur - prev) / prev) * 100 : null, upToLabel: slice[slice.length - 1].label, partial: upTo < 11 };
  })();

  const chartMax = Math.max(1, ...months.map((m) => Math.max(m.invoices + Math.max(m.actions, 0), m.prev)));

  /* ── Jahresplan: today, Verkaufsaktionen and Arbeiten on the month grid ── */
  const plan = useMemo(() => {
    if (!data) return null;
    const keys = months.map((m) => m.key);
    const pos = (iso) => {
      const p = parseIso(iso);
      if (!p) return null;
      const idx = keys.indexOf(`${p.y}-${String(p.m).padStart(2, '0')}`);
      if (idx < 0) return null;
      return ((idx + (p.d - 1) / new Date(p.y, p.m, 0).getDate()) / 12) * 100;
    };
    const markers = data.actions
      .map((a) => {
        const iso = a.date || `${a.monthKey}-15`;
        return { key: a.key, label: a.label, unset: !a.date, iso, at: pos(iso) };
      })
      .filter((m) => m.at !== null)
      .sort((x, y) => x.at - y.at);
    // Keep the pictograms apart (two actions can default to the same month) and stagger their labels.
    markers.forEach((m, i) => {
      if (i > 0 && m.at - markers[i - 1].at < 4) m.at = markers[i - 1].at + 4;
      m.lane = i % 2;
    });
    return {
      markers,
      jobs: data.jobs.dates.map((j) => ({ at: pos(j.date), done: j.done, date: j.date })).filter((j) => j.at !== null),
      today: data.today >= data.from && data.today <= data.to ? pos(data.today) : null,
    };
  }, [data, months]);

  const progress = (() => {
    if (!data) return { pct: 0, label: '' };
    const start = new Date(data.year, 8, 1);
    const end = new Date(data.year + 1, 7, 31);
    const now = new Date();
    if (now < start) return { pct: 0, label: t('d2_year_future', 'Noch nicht gestartet') };
    if (now > end) return { pct: 100, label: t('d2_year_done', 'Abgeschlossen') };
    const total = Math.round((end - start) / 86400000) + 1;
    const day = Math.round((now - start) / 86400000) + 1;
    return { pct: Math.min(100, (day / total) * 100), label: `${t('d2_day', 'Tag')} ${day} ${t('d2_of', 'von')} ${total}` };
  })();

  const todo = data ? [
    {
      key: 'overdue', icon: AlertCircle, tone: 'danger', view: 'invoices',
      count: data.invoices.overdueCount,
      label: t('d2_todo_overdue', 'Überfällige Rechnungen'),
      sub: data.invoices.overdueCount ? fmt(data.invoices.overdue) : '',
    },
    { key: 'quotes', icon: FileText, tone: 'warn', view: 'quotes', count: data.quotesOpen, label: t('d2_todo_quotes', 'Offene Angebote'), sub: '' },
    {
      key: 'lasagnen', icon: UtensilsCrossed, tone: 'warn', view: 'lasagnen',
      count: (() => {
        const s = data.actions.find((a) => a.key === 'lasagnen')?.summary;
        return s ? s.orderingHoris - s.paidHoris : 0;
      })(),
      label: t('d2_todo_lasagnen', 'Lasagnen noch nicht bezahlt'),
      sub: '',
    },
    { key: 'jobs', icon: Briefcase, tone: 'warn', view: 'arbeiten', count: data.jobs.withoutInvoice, label: t('d2_todo_jobs', 'Arbeiten ohne Rechnung'), sub: '' },
  ].filter((x) => x.count > 0) : [];

  const go = (view) => onNavigate?.(view);
  const hoursPct = data && data.jobs.plannedHours > 0 ? Math.min(100, (data.jobs.actualHours / data.jobs.plannedHours) * 100) : 0;
  const topMax = data?.horis.top[0]?.total_actual_hours || 1;

  const statCards = [
    {
      key: 'paid', tone: 'lime', icon: ReceiptEuro,
      label: t('d2_invoices_paid', 'Rechnungen bezahlt'),
      value: data ? fmt(data.invoices.paid) : '—',
      chip: data ? `${data.invoices.paidCount}×` : '',
    },
    {
      key: 'saldo', tone: 'indigo', icon: Wallet,
      label: t('d2_actions_saldo', 'Aktionen-Saldo'),
      value: data ? fmt(actionsSaldo) : '—',
      chip: t('d2_actions_saldo_sub', 'netto'),
    },
    {
      key: 'hours', tone: 'pink', icon: Clock,
      label: t('d2_hours', 'Arbeitsstunden'),
      value: data ? fmtHours(data.jobs.actualHours) : '—',
      chip: data ? `${data.jobs.done}/${data.jobs.total} ${t('d2_jobs_done', 'erledigt')}` : '',
      bar: hoursPct,
      barLabel: data ? `${t('d2_planned', 'geplant')} ${fmtHours(data.jobs.plannedHours)}` : '',
    },
  ];

  return (
    <div className="dashboard d2">
      <div className="page-header d2-header">
        <div className="d2-header-title">
          <h2>{t('d2_scout_year', 'Pfadfinderjahr')} {scoutYearLabel(selectedYear)}</h2>
          <span className="recent-subtle">
            {t('d2_year_range', '1. Sept – 31. Aug')} · {progress.label}
          </span>
        </div>
        <div className="page-header-end">
          <YearSwitcher />
        </div>
      </div>

      {error && (
        <div className="page-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* 1 — Hero + what needs attention */}
      <section className="bottom-grid d2-top">
        <div className="chart-card d2-hero">
          <div className="chart-toolbar">
            <div className="d2-hero-main">
              <span className="recent-subtle">
                {t('d2_revenue', 'Umsatz')}
              </span>
              <div className="d2-hero-value-row">
                <span className="d2-hero-value">{data ? fmt(revenue) : '—'}</span>
                {comparison && comparison.delta !== null && (
                  <span className={`d2-delta ${comparison.delta >= 0 ? 'up' : 'down'}`}>
                    {comparison.delta >= 0 ? <TrendingUp size={14} aria-hidden="true" /> : <TrendingDown size={14} aria-hidden="true" />}
                    {comparison.delta >= 0 ? '+' : ''}{Math.round(comparison.delta)} % {t('d2_vs_prev', 'ggü. Vorjahr')}
                  </span>
                )}
              </div>
              <span className="recent-subtle">
                {comparison
                  ? comparison.prev > 0
                    ? `${t('d2_prev_year', 'Vorjahr')}${comparison.partial ? ` ${t('d2_until', 'bis')} ${comparison.upToLabel}` : ''}: ${fmt(comparison.prev)}`
                    : t('d2_prev_none', 'Im Vorjahr kein Umsatz im gleichen Zeitraum')
                  : ' '}
                {data && ` · ${t('d2_invoices', 'Rechnungen')} ${fmt(data.invoices.paid)}${includeActions ? ` · ${t('d2_actions', 'Aktionen')} ${fmt(actionsSaldo)}` : ''}`}
              </span>
            </div>
            <div className="chart-controls">
              <div className="d2-legend">
                <span><i className="inv" />{t('d2_invoices', 'Rechnungen')}</span>
                {includeActions && <span><i className="act" />{t('d2_actions', 'Aktionen')}</span>}
                <span><i className="prev" />{t('d2_prev_year', 'Vorjahr')}</span>
              </div>
              <label className="chart-include" title={t('dashboard_include_actions_hint', 'Saldo der Verkaufsaktionen (Lasagnen, später Glühweinbude und Baseball) zum Umsatz zählen')}>
                <input type="checkbox" checked={includeActions} onChange={(e) => setIncludeActions(e.target.checked)} />
                <span>{t('dashboard_include_actions', 'Verkaufsaktionen einrechnen')}</span>
              </label>
            </div>
          </div>

          <div className="d2-chart" role="img" aria-label={t('d2_chart_aria', 'Umsatz pro Monat im Pfadfinderjahr, mit dem Vorjahr als Vergleich')}>
            <div className="d2-chart-grid" aria-hidden="true">
              {[1, 0.75, 0.5, 0.25].map((p) => (
                <div key={p} className="d2-chart-line" style={{ bottom: `${p * 100}%` }}>
                  <span>{fmtShort(chartMax * p)}</span>
                </div>
              ))}
            </div>
            <div className="d2-chart-cols">
              {months.map((m) => {
                const act = Math.max(m.actions, 0);
                const title = `${m.label}: ${t('d2_invoices', 'Rechnungen')} ${fmt(m.invoices)}${includeActions ? ` · ${t('d2_actions', 'Aktionen')} ${fmt(m.actions)}` : ''} · ${t('d2_prev_year', 'Vorjahr')} ${fmt(m.prev)}`;
                return (
                  <div key={m.key} className={`d2-col${m.key === nowKey ? ' now' : ''}`} title={title}>
                    <div className="d2-col-plot">
                      <div className="d2-col-stack">
                        {m.invoices > 0 && <i className="inv" style={{ height: `${(m.invoices / chartMax) * 100}%` }} />}
                        {act > 0 && <i className="act" style={{ height: `${(act / chartMax) * 100}%` }} />}
                      </div>
                      {m.prev > 0 && <span className="d2-prev" style={{ bottom: `${(m.prev / chartMax) * 100}%` }} />}
                    </div>
                    <span className="d2-col-label">{m.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Jahresplan: where we are in the year and when the Aktionen and Arbeiten fall */}
          {plan && (
            <div className="d2-plan" aria-label={t('d2_plan', 'Jahresplan')}>
              <div className="d2-plan-track">
                <i className="d2-plan-fill" style={{ width: `${progress.pct}%` }} />
                {plan.jobs.map((j, i) => (
                  <i
                    key={`${j.date}-${i}`}
                    className={`d2-job-dot${j.done ? ' done' : ''}`}
                    style={{ left: `${j.at}%` }}
                    title={`${t('d2_job', 'Arbeit')} ${fmtDay(j.date)}`}
                  />
                ))}
                {plan.today !== null && (
                  <span className="d2-today" style={{ left: `${plan.today}%` }}>
                    <b>{t('d2_today', 'Heute')}</b>
                  </span>
                )}
                {plan.markers.map((m) => {
                  const Icon = ACTION_ICONS[m.key] || Wallet;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      className={`d2-marker lane-${m.lane}${m.unset ? ' unset' : ''}`}
                      style={{ left: `${m.at}%` }}
                      onClick={() => go(m.key)}
                      title={m.unset ? `${m.label}: ${t('d2_no_date', 'Datum offen')}` : `${m.label}: ${fmtDay(m.iso)}`}
                    >
                      <span className="d2-marker-icon"><Icon size={13} aria-hidden="true" /></span>
                      <span className="d2-marker-label">{m.label}{m.unset ? '' : ` · ${fmtDay(m.iso)}`}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <aside className="quick-panel">
          <div className="quick-stat">
            <span className="quick-stat-label">{t('d2_open_items', 'Offene Posten')}</span>
            <span className="quick-stat-value">{data ? fmt(data.invoices.open) : '—'}</span>
            {data && (
              <span className="quick-stat-foot">
                {data.invoices.openCount} {t('d2_invoices_open', 'offene Rechnungen')}
                {data.invoices.overdueCount > 0 && ` · ${data.invoices.overdueCount} ${t('d2_overdue', 'überfällig')}`}
              </span>
            )}
          </div>

          <div className="quick-actions">
            <h4>{t('d2_todo', 'Braucht Aufmerksamkeit')}</h4>
            {data && todo.length === 0 ? (
              <span className="d2-allgood"><CheckCircle2 size={18} aria-hidden="true" /> {t('d2_todo_none', 'Alles erledigt')}</span>
            ) : (
              todo.map((x) => {
                const Icon = x.icon;
                return (
                  <button key={x.key} type="button" className="quick-btn d2-todo" onClick={() => go(x.view)}>
                    <Icon size={16} aria-hidden="true" />
                    <span className="d2-todo-text">
                      {x.label}
                      {x.sub && <small>{x.sub}</small>}
                    </span>
                    <span className={`d2-count ${x.tone}`}>{x.count}</span>
                  </button>
                );
              })
            )}
          </div>
        </aside>
      </section>

      {/* 2 — Stat cards */}
      <section className="stats-grid">
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.key} className={`stat-card stat-${c.tone}`}>
              <div className="stat-icon-wrap"><Icon size={22} /></div>
              <span className="stat-label">{c.label}</span>
              <div className="stat-value-row">
                <span className="stat-value">{c.value}</span>
                {c.chip && <span className="stat-trend">{c.chip}</span>}
              </div>
              {c.bar !== undefined && (
                <div className="d2-card-bar" title={c.barLabel}>
                  <i style={{ width: `${c.bar}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* 3 — One card per Verkaufsaktion */}
      <section className="d2-actions-grid" aria-label={t('d2_sales_actions', 'Verkaufsaktionen')}>
        {(data?.actions || []).map((a) => {
          const Icon = ACTION_ICONS[a.key] || Wallet;
          const s = a.summary;
          return (
            <button key={a.key} type="button" className={`recent-card d2-action${s ? '' : ' empty'}`} onClick={() => go(a.key)}>
              <div className="d2-action-head">
                <div className="recent-avatar"><Icon size={18} /></div>
                <span className="d2-action-name">{a.label}</span>
                <span className="recent-date d2-date">
                  <CalendarDays size={13} aria-hidden="true" />
                  {a.date ? fmtDay(a.date) : t('d2_no_date', 'Datum offen')}
                </span>
              </div>
              {s ? (
                <>
                  <span className={`d2-action-saldo${s.saldo < 0 ? ' negative' : ''}`}>{fmt(s.saldo)}</span>
                  <span className="recent-client">
                    {t('d2_income', 'Einnahmen')} {fmt(s.income)} · {t('d2_expenses', 'Ausgaben')} {fmt(s.expenses)}
                  </span>
                  <div className="d2-action-progress" title={`${s.paidHoris}/${s.orderingHoris} ${t('d2_paid', 'bezahlt')}`}>
                    <i style={{ width: `${s.orderingHoris ? (s.paidHoris / s.orderingHoris) * 100 : 0}%` }} />
                  </div>
                  <span className="recent-date">
                    Bolo {s.bolo} · Veggie {s.veggie} · {s.paidHoris}/{s.orderingHoris} {t('d2_paid', 'bezahlt')}
                  </span>
                </>
              ) : (
                <span className="recent-client">{t('d2_no_numbers', 'Noch keine Zahlen erfasst')}</span>
              )}
              <ChevronRight size={16} className="d2-go d2-action-go" aria-hidden="true" />
            </button>
          );
        })}
      </section>

      {/* 4 — Arbeiten + Horis */}
      <section className="d2-pair">
        <div className="recent-card">
          <div className="recent-header">
            <h3>{t('d2_next_jobs', 'Nächste Arbeiten')}</h3>
            <span className="recent-subtle">{data ? `${data.jobs.total} ${t('d2_in_year', 'im Jahr')}` : ''}</span>
          </div>
          {data && data.jobs.upcoming.length === 0 ? (
            <div className="empty-state">{t('d2_no_jobs', 'Keine anstehenden Arbeiten')}</div>
          ) : (
            <div className="recent-list">
              {(data?.jobs.upcoming || []).map((j) => (
                <button key={j.id} type="button" className="recent-item d2-item" onClick={() => go('arbeiten')}>
                  <div className="d2-datebox">{fmtDay(j.date)}</div>
                  <div className="recent-main">
                    <span className="recent-num">{j.title}</span>
                    <span className="recent-client">{[j.client_name, j.start_time].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div className="recent-meta">
                    <span className="recent-date">{j.people_count} {t('d2_people', 'Pers.')}</span>
                    <ChevronRight size={16} className="d2-go" aria-hidden="true" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="recent-card">
          <div className="recent-header">
            <h3>{t('d2_top_horis', 'Aktivste Horis')}</h3>
            <span className="recent-subtle">{data ? `${data.horis.active} ${t('d2_horis_active', 'aktiv')}` : ''}</span>
          </div>
          {data && data.horis.top.length === 0 ? (
            <div className="empty-state">{t('d2_no_hours', 'Noch keine Stunden erfasst')}</div>
          ) : (
            <div className="recent-list">
              {(data?.horis.top || []).map((h) => (
                <button key={h.id} type="button" className="recent-item d2-item" onClick={() => go('horis')}>
                  <div className="recent-avatar">{`${(h.first_name || '?')[0]}${(h.last_name || '')[0] || ''}`.toUpperCase()}</div>
                  <div className="recent-main">
                    <span className="recent-num">{`${h.first_name} ${h.last_name}`}</span>
                    <span className="d2-bar" aria-hidden="true">
                      <i style={{ width: `${(h.total_actual_hours / topMax) * 100}%` }} />
                    </span>
                  </div>
                  <div className="recent-meta">
                    <span className="recent-date">{fmtHours(h.total_actual_hours)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default Dashboard2;
