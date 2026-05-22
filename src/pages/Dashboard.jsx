import React, { useState, useEffect, useMemo, useRef } from 'react';
import useDatabase from '../hooks/useDatabase';
import StatusBadge from '../components/StatusBadge';
import { effectiveStatus } from '../utils/documentLifecycle';
import { useT } from '../hooks/useUiTranslations';
import {
  Euro, FileText, Users, Clock, AlertCircle,
  ArrowUpRight, Plus, Sparkles, ReceiptEuro, X
} from 'lucide-react';
import './Dashboard.css';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const RANGES = [
  { id: '1m', label: '1M', months: 1 },
  { id: '3m', label: '3M', months: 3 },
  { id: '6m', label: '6M', months: 6 },
  { id: '1y', label: '1Y', months: 12 },
  { id: 'all', label: 'ALL', months: null },
  { id: 'custom', label: 'Custom', months: null },
];

const TODAY = new Date();
const todayStr = TODAY.toISOString().split('T')[0];

function getFiscalYear() {
  const now = new Date();
  const isBefore = now.getMonth() < 8; // before Sept (0-indexed)
  const startYear = isBefore ? now.getFullYear() - 1 : now.getFullYear();
  const endYear = startYear + 1;
  return {
    from: `${startYear}-09-01`,
    to: `${endYear}-08-31`,
  };
}

function heroClosedToday() {
  return localStorage.getItem('hero_last_closed') === todayStr;
}

const CHART_H = 220;
const CHART_PAD_Y = 20;
const CHART_PAD_XL = 56; // left room for Y-axis labels
const CHART_PAD_XR = 12;

// Catmull-Rom → cubic Bézier smoothing. yMin/yMax clamp control points
// so the curve never overshoots below zero on sparse-then-spike data.
const smoothPath = (pts, yMin = -Infinity, yMax = Infinity) => {
  if (pts.length < 2) return '';
  const cy = (v) => Math.max(yMin, Math.min(yMax, v));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = cy(p1.y + (p2.y - p0.y) / 6);
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = cy(p2.y - (p3.y - p1.y) / 6);
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
};

const Dashboard = ({ settings, onNewDoc, onEditDoc }) => {
  const { query } = useDatabase();
  const t = useT();
  const [stats, setStats] = useState({
    revenue: 0, paidInvoices: 0, pendingQuotes: 0, totalClients: 0
  });
  const [recentDocs, setRecentDocs] = useState([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState([]);
  const [dailyRevenue, setDailyRevenue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chartRange, setChartRange] = useState('1y');
  const [showHero, setShowHero] = useState(!heroClosedToday());
  const fiscal = getFiscalYear();
  const [customFrom, setCustomFrom] = useState(fiscal.from);
  const [customTo, setCustomTo] = useState(fiscal.to);
  const chartContainerRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(600);
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setChartWidth(Math.max(200, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setError(null);
    try {
      const [invoices, quoteCount, clientCount, recent] = await Promise.all([
        query(`
          SELECT
            d.id, d.status, d.date, d.tax_rate, d.discount_value, d.discount_type, d.payment_mode,
            COALESCE(SUM(di.qty * di.rate), 0) as items_subtotal
          FROM documents d
          LEFT JOIN document_items di ON di.document_id = d.id
          WHERE d.type = 'invoice'
          GROUP BY d.id
        `),
        query(`SELECT COUNT(*) as cnt FROM documents WHERE type = 'quote' AND status IN ('draft','sent')`),
        query(`SELECT COUNT(*) as cnt FROM clients`),
        query(`
          SELECT d.id, d.type, d.number, d.status, d.date, d.due_date, c.name as client_name
          FROM documents d LEFT JOIN clients c ON d.client_id = c.id
          ORDER BY d.created_at DESC LIMIT 6
        `),
      ]);

      let totalRevenue = 0;
      const byMonth = new Map();
      const byDay = new Map();

      for (const inv of invoices) {
        const subtotal = inv.items_subtotal;
        const discount = inv.discount_type === '%'
          ? subtotal * (inv.discount_value / 100)
          : inv.discount_value;
        const isCash = inv.payment_mode === 'cash';
        const tax = isCash ? 0 : (subtotal - discount) * (inv.tax_rate / 100);
        const total = subtotal - discount + tax;

        if (inv.status === 'paid' && inv.date) {
          const monthKey = inv.date.slice(0, 7);
          byMonth.set(monthKey, (byMonth.get(monthKey) || 0) + total);
          const dayKey = inv.date.slice(0, 10);
          byDay.set(dayKey, (byDay.get(dayKey) || 0) + total);
          totalRevenue += total;
        }
      }

      // Build last-12 absolute months ending current month
      const now = new Date();
      const series = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        series.push({ key, label: MONTHS[d.getMonth()], value: byMonth.get(key) || 0 });
      }
      // Prepend any earlier months present in data (for 'all' range)
      const earlierKeys = Array.from(byMonth.keys())
        .filter(k => !series.some(s => s.key === k))
        .sort();
      const earlier = earlierKeys.map(k => {
        const [y, m] = k.split('-');
        return { key: k, label: MONTHS[parseInt(m, 10) - 1], value: byMonth.get(k) || 0 };
      });
      const fullSeries = [...earlier, ...series];

      setStats({
        revenue: totalRevenue,
        paidInvoices: invoices.filter(i => i.status === 'paid').length,
        pendingQuotes: quoteCount[0]?.cnt || 0,
        totalClients: clientCount[0]?.cnt || 0,
      });
      // Build daily series for current month (days 1 → today only)
      const todayDate = new Date();
      const todayDay = todayDate.getDate();
      const curYear = todayDate.getFullYear();
      const curMonth = todayDate.getMonth();
      const dailySeries = [];
      for (let d = 1; d <= todayDay; d++) {
        const key = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        dailySeries.push({
          key,
          label: d === 1 || d % 5 === 0 ? String(d) : '',
          value: byDay.get(key) || 0,
        });
      }
      setDailyRevenue(dailySeries);
      setMonthlyRevenue(fullSeries);
      setRecentDocs(recent);
    } catch (_err) {
      setError(t('doclist_load_error', 'Failed to load. Please restart the app.'));
    } finally {
      setLoading(false);
    }
  };

  const fmtEUR = (v) => (v ?? 0).toLocaleString('de-DE', {
    style: 'currency', currency: settings?.default_currency || 'EUR', maximumFractionDigits: 0
  });

  const fmtShort = (v) => {
    const cur = settings?.default_currency || 'EUR';
    const sym = cur === 'EUR' ? '€' : cur === 'USD' ? '$' : cur === 'GBP' ? '£' : cur + ' ';
    if (v >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 10_000)    return `${sym}${Math.round(v / 1000)}k`;
    if (v >= 1_000)     return `${sym}${(v / 1000).toFixed(1)}k`;
    return `${sym}${Math.round(v)}`;
  };

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return t('greeting_morning', 'Good morning');
    if (h < 18) return t('greeting_afternoon', 'Good afternoon');
    return t('greeting_evening', 'Good evening');
  }, [t]);

  const firstName = (settings?.company_name || 'there').split(/\s+/)[0];

  const handleCloseHero = () => {
    localStorage.setItem('hero_last_closed', todayStr);
    setShowHero(false);
  };

  // Slice monthlyRevenue based on selected range; 1m uses daily granularity
  const visibleMonths = useMemo(() => {
    if (chartRange === '1m') return dailyRevenue;
    if (chartRange === 'all') return monthlyRevenue;
    if (chartRange === 'custom') {
      const fromKey = customFrom.slice(0, 7);
      const toKey = customTo.slice(0, 7);
      return monthlyRevenue.filter(m => m.key >= fromKey && m.key <= toKey);
    }
    const months = RANGES.find(r => r.id === chartRange)?.months || 12;
    return monthlyRevenue.slice(-months);
  }, [monthlyRevenue, dailyRevenue, chartRange, customFrom, customTo]);

  const filteredRevenue = useMemo(
    () => visibleMonths.reduce((sum, m) => sum + m.value, 0),
    [visibleMonths]
  );

  // Generate SVG line chart points — uses measured container width so
  // viewBox matches actual pixels and circles stay circular.
  const chartPoints = useMemo(() => {
    const W = chartWidth;
    const innerH = CHART_H - CHART_PAD_Y * 2;
    const max = Math.max(...visibleMonths.map(m => m.value), 1);
    const n = visibleMonths.length;
    if (n === 0) return [];
    const dx = (W - CHART_PAD_XL - CHART_PAD_XR) / Math.max(n - 1, 1);
    return visibleMonths.map((m, i) => ({
      x: CHART_PAD_XL + i * dx,
      y: CHART_PAD_Y + innerH * (1 - m.value / max),
      v: m.value,
      label: m.label,
    }));
  }, [visibleMonths, chartWidth]);

  const yTicks = useMemo(() => {
    const max = Math.max(...visibleMonths.map(m => m.value), 1);
    const innerH = CHART_H - CHART_PAD_Y * 2;
    return [0.25, 0.5, 0.75, 1].map(p => ({
      value: max * p,
      y: CHART_PAD_Y + innerH * (1 - p),
    }));
  }, [visibleMonths]);

  const linePath = smoothPath(chartPoints, CHART_PAD_Y, CHART_H - CHART_PAD_Y);
  const areaPath = chartPoints.length
    ? `${linePath} L ${chartPoints[chartPoints.length - 1].x} ${CHART_H} L ${chartPoints[0].x} ${CHART_H} Z`
    : '';

  const hasData = visibleMonths.some(m => m.value > 0);

  // Chunky stat cards (rendered with explicit color modifier classes)
  const statCards = [
    {
      key: 'revenue',
      label: t('kpi_total_revenue', 'Total Revenue'),
      value: loading ? '—' : fmtEUR(filteredRevenue),
      icon: Euro,
      tone: 'lime',
    },
    {
      key: 'paid',
      label: t('kpi_paid_invoices', 'Paid Invoices'),
      value: loading ? '—' : stats.paidInvoices,
      icon: ReceiptEuro,
      tone: 'dark',
    },
    {
      key: 'quotes',
      label: t('kpi_pending_quotes', 'Pending Quotes'),
      value: loading ? '—' : stats.pendingQuotes,
      icon: Clock,
      tone: 'indigo',
    },
    {
      key: 'clients',
      label: t('kpi_total_clients', 'Total Clients'),
      value: loading ? '—' : stats.totalClients,
      icon: Users,
      tone: 'pink',
    },
  ];

  return (
    <div className="dashboard">
      {error && (
        <div className="page-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* HERO PROMO CARD */}
      {showHero && (
        <section className="hero-card">
          <button className="hero-close" onClick={handleCloseHero} aria-label="Close">
            <X size={18} />
          </button>
          <div className="hero-content">
            <span className="hero-eyebrow">
              <Sparkles size={14} /> {greeting}, {firstName}
            </span>
            <h2 className="hero-title">
              {t('hero_title', 'Run your billing like a pro')} <span className="hero-emoji">✦</span>
            </h2>
            <p className="hero-sub">
              {t('hero_subtitle', 'Track revenue, send invoices, and stay on top of every quote — all in one place.')}
            </p>
            <div className="hero-actions">
              <button className="hero-cta" onClick={() => onNewDoc?.('invoice')}>
                <Plus size={16} /> {t('btn_new_invoice', 'New Invoice')}
              </button>
              <button className="hero-cta-ghost" onClick={() => onNewDoc?.('quote')}>
                {t('btn_new_quote', 'New Quote')}
              </button>
            </div>
          </div>
          <div className="hero-decor" aria-hidden="true">
            <div className="hero-orb hero-orb-1"><ReceiptEuro size={30} /></div>
            <div className="hero-orb hero-orb-2"><FileText size={30} /></div>
            <div className="hero-orb hero-orb-3"><Euro size={26} /></div>
            <div className="hero-spark hero-spark-1"></div>
            <div className="hero-spark hero-spark-2"></div>
          </div>
        </section>
      )}

      {/* STAT CARDS */}
      <section className="stats-grid">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.key} className={`stat-card stat-${s.tone}`}>
              <div className="stat-icon-wrap">
                <Icon size={22} />
              </div>
              <span className="stat-label">{s.label}</span>
              <div className="stat-value-row">
                <span className="stat-value">{s.value}</span>
              </div>
            </div>
          );
        })}
      </section>

      {/* CHART CARD */}
      <section className="chart-card">
        <div className="chart-toolbar">
          <div>
            <h3 className="chart-title">{t('chart_title', 'Revenue overview')}</h3>
            <p className="chart-sub">
              {chartRange === '1m'
                ? `${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()} · ${t('chart_mode_daily', 'daily')}`
                : `${new Date().getFullYear()} · ${t('chart_mode_paid', 'paid invoices')}`}
            </p>
          </div>
          <div className="chart-controls">
            <div className="time-pills">
              {RANGES.map(r => (
                <button
                  key={r.id}
                  className={`time-pill ${chartRange === r.id ? 'active' : ''}`}
                  onClick={() => setChartRange(r.id)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {chartRange === 'custom' && (
              <div className="custom-range">
                <input
                  type="date"
                  className="date-range-input"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                />
                <span className="date-range-sep">–</span>
                <input
                  type="date"
                  className="date-range-input"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        <div className="chart-area" ref={chartContainerRef}>
          {!hasData && (
            <div className="chart-empty">
              {t('chart_empty', 'No paid invoices yet — your revenue will appear here.')}
            </div>
          )}
          <svg
            className="chart-svg"
            viewBox={`0 0 ${chartWidth} ${CHART_H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="Revenue line chart"
          >
            <defs>
              <linearGradient id="chart-grad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(99,102,241,0.30)" />
                <stop offset="100%" stopColor="rgba(99,102,241,0)" />
              </linearGradient>
            </defs>
            {/* Y-axis tick labels + grid lines */}
            {yTicks.map((t, i) => (
              <g key={i}>
                <line
                  x1={CHART_PAD_XL} x2={chartWidth - CHART_PAD_XR}
                  y1={t.y} y2={t.y}
                  stroke="#E2E8F0" strokeDasharray="3 5"
                />
                <text
                  x={CHART_PAD_XL - 6} y={t.y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="#94A3B8"
                  fontFamily="var(--font-mono, monospace)"
                >
                  {fmtShort(t.value)}
                </text>
              </g>
            ))}
            {hasData && (
              <>
                <path d={areaPath} fill="url(#chart-grad)" />
                <path
                  d={linePath}
                  fill="none"
                  stroke="#6366F1"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {chartPoints.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x} cy={p.y} r="4"
                    fill="#FFFFFF"
                    stroke="#6366F1"
                    strokeWidth="2"
                  />
                ))}
              </>
            )}
          </svg>
          <div className="chart-x-axis" style={{ paddingLeft: CHART_PAD_XL, paddingRight: CHART_PAD_XR }}>
            {visibleMonths.map((m, i) => (
              <span key={i} className="chart-x-label">{m.label}</span>
            ))}
          </div>
        </div>
      </section>

      {/* BOTTOM ROW — Recent Docs + Quick Actions panel */}
      <section className="bottom-grid">
        <div className="recent-card">
          <div className="recent-header">
            <h3>{t('recent_docs_title', 'Recent Documents')}</h3>
            <span className="recent-subtle">{t('recent_docs_subtitle', 'Latest activity')}</span>
          </div>
          {recentDocs.length === 0 ? (
            <p className="empty-state">{t('recent_docs_empty', 'No documents yet. Create your first invoice!')}</p>
          ) : (
            <div className="recent-list">
              {recentDocs.map(doc => (
                <div
                  key={doc.id}
                  className="recent-item recent-item-clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => onEditDoc?.(doc)}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onEditDoc?.(doc)}
                >
                  <div className="recent-avatar">
                    {(doc.client_name || '??').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="recent-main">
                    <span className="recent-num">{doc.number}</span>
                    <span className="recent-client">{doc.client_name || t('doc_no_client', 'No Client')}</span>
                  </div>
                  <div className="recent-meta">
                    <span className="recent-date">{doc.date}</span>
                    <StatusBadge status={effectiveStatus(doc)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="quick-panel">
          <div className="quick-stat">
            <span className="quick-stat-label">{t('this_month', 'This month')}</span>
            <span className="quick-stat-value">
              {fmtEUR((() => {
                const n = new Date();
                const k = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
                return (monthlyRevenue.find(m => m.key === k)?.value) || 0;
              })())}
            </span>
          </div>

          <div className="quick-actions">
            <h4>{t('quick_actions', 'Quick actions')}</h4>
            <button className="quick-btn primary" onClick={() => onNewDoc?.('invoice')}>
              <Plus size={16} /> {t('btn_new_invoice', 'New Invoice')}
            </button>
            <button className="quick-btn" onClick={() => onNewDoc?.('quote')}>
              <Plus size={16} /> {t('btn_new_quote', 'New Quote')}
            </button>
          </div>
        </aside>
      </section>
    </div>
  );
};

export default Dashboard;
