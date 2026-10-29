import { useState, useEffect } from 'react';
import {
  Search, AlertCircle, LayoutList, Coffee, Wallet, CalendarDays, ShoppingCart, Scale, Banknote, Info,
} from 'lucide-react';
import useSettings from '../hooks/useSettings';
import useYear from '../hooks/useYear';
import useCurrency from '../hooks/useCurrency';
import { useSalesDays } from '../hooks/useSalesDays';
import { useSalesKasse } from '../hooks/useSalesKasse';
import { useSalesEntries } from '../hooks/useSalesEntries';
import { SALES_ACTIONS } from '../utils/lasagnaFinance';
import { saldo as computeSaldo } from '../utils/gluehweinFinance';
import YearSwitcher from '../components/YearSwitcher';
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
  { value: 'catalog', label: 'Katalog', icon: <Coffee size={15} /> },
  { value: 'kasse', label: 'Kasse', icon: <Banknote size={15} /> },
  { value: 'shifts', label: 'Schichten', icon: <CalendarDays size={15} /> },
  { value: 'shopping', label: 'Einkaufsliste', icon: <ShoppingCart size={15} /> },
  { value: 'finance', label: 'Finanzen', icon: <Wallet size={15} /> },
];

// Tabs whose content filters by the search bar.
const SEARCH_TABS = new Set(['catalog', 'finance']);

/** Read-only summary: event days, Kasse status, Saldo. Reloads on mount (i.e. each time the tab is opened). */
const GluehweinOverview = ({ year, onError }) => {
  const { fetchDays } = useSalesDays(ACTION.key);
  const { fetchKasse } = useSalesKasse(ACTION.key);
  const { fetchEntries } = useSalesEntries(ACTION.key);
  const formatCurrency = useCurrency();
  const [data, setData] = useState(null); // { year, days, kasse, totals }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [days, kasse, entries] = await Promise.all([fetchDays(year), fetchKasse(year), fetchEntries(year)]);
        if (!cancelled) setData({ year, days, kasse, totals: computeSaldo(entries) });
      } catch (err) {
        console.error('Glühwein-Übersicht laden fehlgeschlagen', err);
        if (!cancelled) onError?.('Übersicht konnte nicht geladen werden.');
      }
    })();
    return () => { cancelled = true; };
  }, [year, fetchDays, fetchKasse, fetchEntries, onError]);

  const ready = data && data.year === year;
  const days = ready ? data.days : [];
  const kasse = ready ? data.kasse : null;
  const totals = ready ? data.totals : { income: 0, expense: 0, saldo: 0 };
  const counted = kasse?.counted_cash != null ? Number(kasse.counted_cash) : null;
  const booked = !!kasse?.entry_id;

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
            <div className="gw-summary-value">{counted != null ? formatCurrency(counted) : '–'}</div>
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

      {ready && !booked && (
        <div className="gw-hint" role="note">
          <Info size={16} />
          <span>
            Die Kasse ist noch nicht übernommen und fehlt daher im Saldo. Nach dem letzten Verkaufstag im Tab
            „Kasse“ den gezählten Betrag eintragen und übernehmen.
          </span>
        </div>
      )}
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
      {view === 'catalog' && <GluehweinCatalog {...common} search={search} onError={setError} />}
      {view === 'kasse' && <GluehweinKasse key={selectedYear} {...common} onError={setError} />}
      {view === 'shifts' && <GluehweinSchichten key={selectedYear} {...common} settings={settings} onError={setError} />}
      {view === 'shopping' && <GluehweinEinkaufsliste {...common} />}
      {view === 'finance' && <GluehweinFinanzen key={selectedYear} {...common} search={search} onError={setError} />}
    </div>
  );
};

export default Gluehwein;
