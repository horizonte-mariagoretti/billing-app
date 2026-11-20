import { useState, useEffect, useRef } from 'react';
import useActionDate from '../hooks/useActionDate';
import DateRangeField from '../components/DateRangeField';
import {
  Search, AlertCircle, LayoutList, Wallet, CalendarDays, ShoppingCart, Scale, Banknote, TrendingUp, ReceiptEuro, Copy, Plus, Settings2,
} from 'lucide-react';
import useSettings from '../hooks/useSettings';
import useYear from '../hooks/useYear';
import useCurrency from '../hooks/useCurrency';
import { useSalesKasse } from '../hooks/useSalesKasse';
import { useSalesEntries } from '../hooks/useSalesEntries';
import { useGluehweinPurchases } from '../hooks/useGluehweinPurchases';
import { SALES_ACTIONS } from '../utils/lasagnaFinance';
import { saldo as computeSaldo } from '../utils/gluehweinFinance';
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
import '../components/TableInputFont.css';

const ACTION = SALES_ACTIONS.find((a) => a.key === 'gluehwein');
// Start = the action's date (Dashboard month fallback when no sale day is set); end = last day of the Glühweinbude.
// Both end in _action_date so "Start new year" does not copy them.
const END_DATE_KEY = 'gluehwein_end_action_date';

const TABS = [
  { value: 'overview', label: 'Übersicht', icon: <LayoutList size={15} /> },
  { value: 'kasse', label: 'Kasse', icon: <Banknote size={15} /> },
  { value: 'shifts', label: 'Schichten', icon: <CalendarDays size={15} /> },
  { value: 'shopping', label: 'Einkaufsliste', icon: <ShoppingCart size={15} /> },
  { value: 'finance', label: 'Finanzen', icon: <Wallet size={15} /> },
];

// Tabs whose content filters by the search bar.
const SEARCH_TABS = new Set(['overview', 'finance']);

// Add buttons a tab shows in the page header, left of the year switcher (like Lasagnen / Horis). Per tab an array,
// so a tab can supply several (key tells the tab which one was clicked). A click bumps addRequest = { tab, key, n,
// triggerRef }; the tab opens its popup when n changes (the value present on mount is ignored).
const HEADER_ACTIONS = {
  overview: [
    { key: 'copy', label: 'Aus Jahr kopieren', icon: Copy, variant: 'secondary' },
    { key: 'add', label: 'Artikel hinzufügen', icon: Plus, variant: 'primary' },
  ],
  shifts: [
    { key: 'settings', label: 'Schicht-Einstellungen', icon: Settings2, variant: 'secondary' },
  ],
};

/** Read-only summary: Einnahmen (incl. Kasse), Ausgaben (incl. Einkaufsliste), Saldo. Reloads on mount (i.e. each time the tab is opened). */
const GluehweinOverview = ({ year, onError }) => {
  const { readKasse } = useSalesKasse(ACTION.key);
  const { fetchEntries } = useSalesEntries(ACTION.key);
  const { fetchShoppingExpenses } = useGluehweinPurchases();
  const formatCurrency = useCurrency();
  const [data, setData] = useState(null); // { year, totals }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [kasse, entries, shopping] = await Promise.all([readKasse(year), fetchEntries(year), fetchShoppingExpenses(year)]);
        if (!cancelled) setData({ year, totals: computeSaldo([...entries, ...shopping], kasse) });
      } catch (err) {
        console.error('Glühwein-Übersicht laden fehlgeschlagen', err);
        if (!cancelled) onError?.('Übersicht konnte nicht geladen werden.');
      }
    })();
    return () => { cancelled = true; };
  }, [year, readKasse, fetchEntries, fetchShoppingExpenses, onError]);

  const ready = data && data.year === year;
  const totals = ready ? data.totals : { income: 0, expense: 0, saldo: 0 };

  return (
    <div className="gw-overview">
      <div className="gw-summary">
        <div className="gw-summary-card">
          <div className="gw-summary-icon green"><TrendingUp size={20} /></div>
          <div className="gw-summary-body">
            <div className="gw-summary-label">Einnahmen</div>
            <div className="gw-summary-value">{ready ? formatCurrency(totals.income) : '–'}</div>
          </div>
        </div>
        <div className="gw-summary-card">
          <div className="gw-summary-icon pink"><ReceiptEuro size={20} /></div>
          <div className="gw-summary-body">
            <div className="gw-summary-label">Ausgaben</div>
            <div className="gw-summary-value">{ready ? formatCurrency(totals.expense) : '–'}</div>
          </div>
        </div>
        <div className="gw-summary-card">
          <div className="gw-summary-icon indigo"><Scale size={20} /></div>
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
 * (set in Schichten). Tabs: Übersicht (incl. Sortiment), Kasse, Schichten, Einkaufsliste, Finanzen.
 */
const Gluehwein = () => {
  const { loadYearSettings } = useSettings();
  const { selectedYear, isLocked: yearLocked } = useYear();
  const [view, setView] = useState('overview');
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const start = useActionDate(ACTION.dateKey);
  const end = useActionDate(END_DATE_KEY);

  // One picker for the period; the field keeps start <= end (a day before the start restarts the period).
  const setPeriod = (s, e) => {
    start.setDate(s);
    end.setDate(e);
  };
  const dateError = start.error || end.error;
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
  const placeholder = view === 'overview' ? 'Artikel suchen…' : view === 'finance' ? 'Einträge suchen…' : 'Suchen…';
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
          <DateRangeField
            title="Zeitraum der Glühweinbude (Start und Ende; der Start bestimmt den Monat im Umsatz auf dem Dashboard)"
            start={start.date}
            end={end.date}
            initialView={`${selectedYear}-12-01`}
            disabled={!start.loaded || start.locked}
            onChange={setPeriod}
          />
          <YearSwitcher />
        </div>
      </div>

      {(error || dateError) && (
        <div className="page-error" role="alert">
          <AlertCircle size={16} />
          <span>{error || dateError}</span>
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
        {(HEADER_ACTIONS[view] || []).length > 0 && (
          <div className="gw-toolbar-actions">
            {(HEADER_ACTIONS[view] || []).map((a) => (
              <Button
                key={a.key}
                ref={(el) => { headerBtnRefs.current[`${view}:${a.key}`] = el; }}
                variant={a.variant}
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
          </div>
        )}
      </div>

      {view === 'overview' && (
        <>
          <GluehweinOverview key={selectedYear} year={selectedYear} onError={setError} />
          <GluehweinCatalog
            {...common}
            search={search}
            onError={setError}
            addRequest={addRequest?.tab === 'overview' ? addRequest : null}
          />
        </>
      )}
      {view === 'kasse' && <GluehweinKasse key={selectedYear} {...common} onError={setError} />}
      {view === 'shifts' && (
        <GluehweinSchichten
          key={selectedYear}
          {...common}
          settings={settings}
          periodFrom={start.date}
          periodTo={end.date}
          addRequest={addRequest?.tab === 'shifts' ? addRequest : null}
          onError={setError}
        />
      )}
      {view === 'shopping' && <GluehweinEinkaufsliste {...common} />}
      {view === 'finance' && <GluehweinFinanzen key={selectedYear} {...common} search={search} onError={setError} />}
    </div>
  );
};

export default Gluehwein;
