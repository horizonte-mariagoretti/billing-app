import { useState, useEffect, useRef } from 'react';
import {
  Search, AlertCircle, LayoutList, Coffee, Wallet, CalendarDays, ShoppingCart, Scale, Banknote, Plus,
} from 'lucide-react';
import useSettings from '../hooks/useSettings';
import useYear from '../hooks/useYear';
import useCurrency from '../hooks/useCurrency';
import { useSalesDays } from '../hooks/useSalesDays';
import { useSalesKasse } from '../hooks/useSalesKasse';
import { useSalesEntries } from '../hooks/useSalesEntries';
import { SALES_ACTIONS } from '../utils/lasagnaFinance';
import { saldo as computeSaldo, kasseIncome } from '../utils/gluehweinFinance';
import YearSwitcher from '../components/YearSwitcher';
import Button from '../components/Button';
import SegmentedToggle from '../components/SegmentedToggle';
import GluehweinCatalog from '../components/GluehweinCatalog';
import GluehweinKasse from '../components/GluehweinKasse';
import GluehweinSchichten from '../components/GluehweinSchichten';
import GluehweinEinkaufsliste from '../components/GluehweinEinkaufsliste';
import GluehweinFinanzen from '../components/GluehweinFinanzen';
import './SalesActionPage.css';
import './Gluehwein.css';

const ACTION = SALES_ACTIONS.find((a) => a.key === 'gluehwein');

const TABS = [
  { value: 'overview', label: 'Übersicht', icon: <LayoutList size={15} /> },
  { value: 'catalog', label: 'Sortiment', icon: <Coffee size={15} /> },
  { value: 'kasse', label: 'Kasse', icon: <Banknote size={15} /> },
  { value: 'shifts', label: 'Schichten', icon: <CalendarDays size={15} /> },
  { value: 'shopping', label: 'Einkaufsliste', icon: <ShoppingCart size={15} /> },
  { value: 'finance', label: 'Finanzen', icon: <Wallet size={15} /> },
];

// Tabs whose content filters by the search bar.
const SEARCH_TABS = new Set(['catalog', 'finance']);

// Add buttons a tab shows in the page header, left of the year switcher (like Lasagnen / Horis). Per tab an array,
// so a tab can supply several (key tells the tab which one was clicked). A click bumps addRequest = { tab, key, n,
// triggerRef }; the tab opens its popup when n changes (the value present on mount is ignored).
const HEADER_ACTIONS = {
  catalog: [{ key: 'add', label: 'Artikel hinzufügen', icon: Plus }],
};

/** Read-only summary: event days, Kasse (Bargeld + Karte), Saldo. Reloads on mount (i.e. each time the tab is opened). */
const GluehweinOverview = ({ year, onError }) => {
  const { fetchDays } = useSalesDays(ACTION.key);
  const { readKasse } = useSalesKasse(ACTION.key);
  const { fetchEntries } = useSalesEntries(ACTION.key);
  const formatCurrency = useCurrency();
  const [data, setData] = useState(null); // { year, days, kasseTotal, totals }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [days, kasse, entries] = await Promise.all([fetchDays(year), readKasse(year), fetchEntries(year)]);
        const kasseTotal = Math.round(kasseIncome(kasse).reduce((s, x) => s + x.amount, 0) * 100) / 100;
        if (!cancelled) setData({ year, days, kasseTotal, totals: computeSaldo(entries, kasse) });
      } catch (err) {
        console.error('Glühwein-Übersicht laden fehlgeschlagen', err);
        if (!cancelled) onError?.('Übersicht konnte nicht geladen werden.');
      }
    })();
    return () => { cancelled = true; };
  }, [year, fetchDays, readKasse, fetchEntries, onError]);

  const ready = data && data.year === year;
  const days = ready ? data.days : [];
  const totals = ready ? data.totals : { income: 0, expense: 0, saldo: 0 };

  return (
    <div className="gw-overview">
      <div className="gw-summary">
        <div className="gw-summary-card">
          <div className="gw-summary-icon indigo"><CalendarDays size={20} /></div>
          <div className="gw-summary-body">
            <div className="gw-summary-label">Verkaufstage</div>
            <div className="gw-summary-value">{ready ? days.length : '–'}</div>
          </div>
        </div>
        <div className="gw-summary-card">
          <div className="gw-summary-icon amber"><Banknote size={20} /></div>
          <div className="gw-summary-body">
            <div className="gw-summary-label">Kasse</div>
            <div className="gw-summary-value">{ready ? formatCurrency(data.kasseTotal) : '–'}</div>
          </div>
        </div>
        <div className="gw-summary-card">
          <div className="gw-summary-icon green"><Scale size={20} /></div>
          <div className="gw-summary-body">
            <div className="gw-summary-label">Saldo</div>
            <div className={`gw-summary-value${totals.saldo < 0 ? ' negative' : ''}`}>{formatCurrency(totals.saldo)}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Glühweinbude: multi-day Verkaufsaktion. No action date here — the Saldo month is the first sales day
 * (set in Schichten). Tabs: Übersicht, Katalog, Kasse, Schichten, Einkaufsliste, Finanzen.
 */
const Gluehwein = () => {
  const { loadYearSettings } = useSettings();
  const { selectedYear, isLocked: yearLocked } = useYear();
  const [view, setView] = useState('overview');
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [settings, setSettings] = useState(null);
  const [addRequest, setAddRequest] = useState(null); // { tab, key, n, triggerRef }
  const headerBtnRefs = useRef({});

  useEffect(() => {
    let cancelled = false;
    loadYearSettings(selectedYear)
      .then((s) => { if (!cancelled) setSettings(s); })
      .catch((err) => {
        console.error('Einstellungen laden fehlgeschlagen', err);
        if (!cancelled) setError('Einstellungen konnten nicht geladen werden.');
      });
    return () => { cancelled = true; };
  }, [loadYearSettings, selectedYear]);

  const changeView = (next) => {
    setView(next);
    setError(null);
  };

  const searchEnabled = SEARCH_TABS.has(view);
  const placeholder = view === 'catalog' ? 'Artikel suchen…' : view === 'finance' ? 'Einträge suchen…' : 'Suchen…';
  const common = { action: ACTION, year: selectedYear, yearLocked };

  return (
    <div className="sales-action-page gluehwein-page">
      <div className="page-header">
        <div className="search-bar">
          <Search size={18} />
          <input
            type="text"
            placeholder={placeholder}
            value={search}
            disabled={!searchEnabled}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={placeholder}
          />
        </div>
        <div className="page-header-end">
          {(HEADER_ACTIONS[view] || []).map((a) => (
            <Button
              key={a.key}
              ref={(el) => { headerBtnRefs.current[`${view}:${a.key}`] = el; }}
              variant="primary"
              size="md"
              icon={a.icon}
              onClick={() => setAddRequest((r) => ({
                tab: view,
                key: a.key,
                n: (r?.n || 0) + 1,
                triggerRef: { current: headerBtnRefs.current[`${view}:${a.key}`] },
              }))}
            >
              {a.label}
            </Button>
          ))}
          <YearSwitcher />
        </div>
      </div>

      {error && (
        <div className="page-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="gw-toolbar">
        <SegmentedToggle
          className="seg-toggle-fill"
          ariaLabel="Ansicht"
          value={view}
          onChange={changeView}
          options={TABS}
        />
      </div>

      {view === 'overview' && <GluehweinOverview key={selectedYear} year={selectedYear} onError={setError} />}
      {view === 'catalog' && (
        <GluehweinCatalog
          {...common}
          search={search}
          onError={setError}
          addRequest={addRequest?.tab === 'catalog' ? addRequest : null}
        />
      )}
      {view === 'kasse' && <GluehweinKasse key={selectedYear} {...common} onError={setError} />}
      {view === 'shifts' && <GluehweinSchichten key={selectedYear} {...common} settings={settings} onError={setError} />}
      {view === 'shopping' && <GluehweinEinkaufsliste {...common} />}
      {view === 'finance' && <GluehweinFinanzen key={selectedYear} {...common} search={search} onError={setError} />}
    </div>
  );
};

export default Gluehwein;
