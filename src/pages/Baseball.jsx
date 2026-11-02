import { useState } from 'react';
import { LayoutList, Users, ListOrdered, Handshake, MapPin, ShoppingCart, CalendarDays, Wallet, Banknote } from 'lucide-react';
import SalesActionPage from './SalesActionPage';
import SegmentedToggle from '../components/SegmentedToggle';
import GluehweinKasse from '../components/GluehweinKasse';
import GluehweinFinanzen from '../components/GluehweinFinanzen';
import BaseballDienste from '../components/BaseballDienste';
import BaseballOverview from '../components/BaseballOverview';
import BaseballTeams from '../components/BaseballTeams';
import BaseballTable from '../components/BaseballTable';
import BaseballSponsors from '../components/BaseballSponsors';
import BaseballFields from '../components/BaseballFields';
import BaseballShopping from '../components/BaseballShopping';
import useYear from '../hooks/useYear';
import { SALES_ACTIONS } from '../utils/lasagnaFinance';
import './Baseball.css';

const ACTION = SALES_ACTIONS.find((a) => a.key === 'baseball');

// Each tab body takes the same props; the view decides which one is shown.
const VIEWS = {
  overview: { label: 'Übersicht', icon: <LayoutList size={15} />, Body: BaseballOverview },
  teams: { label: 'Teams', icon: <Users size={15} />, Body: BaseballTeams },
  table: { label: 'Tabelle', icon: <ListOrdered size={15} />, Body: BaseballTable },
  sponsors: { label: 'Sponsoren', icon: <Handshake size={15} />, Body: BaseballSponsors },
  fields: { label: 'Felder', icon: <MapPin size={15} />, Body: BaseballFields },
  kasse: { label: 'Kasse', icon: <Banknote size={15} />, Body: GluehweinKasse },
  shopping: { label: 'Einkaufsliste', icon: <ShoppingCart size={15} />, Body: BaseballShopping },
  shifts: { label: 'Schichten', icon: <CalendarDays size={15} />, Body: BaseballDienste },
  finance: { label: 'Finanzen', icon: <Wallet size={15} />, Body: GluehweinFinanzen },
};

const TABS = Object.entries(VIEWS).map(([value, { label, icon }]) => ({ value, label, icon }));

/**
 * Baseballturnier: base page (search, action date, year switcher) with the tabs Übersicht, Teams, Tabelle,
 * Sponsoren, Felder, Kasse, Einkaufsliste, Schichten, Finanzen. Kasse and Finanzen are the shared Glühweinbude
 * components (filtered by the action), so a change there applies here too.
 */
const Baseball = () => {
  const [view, setView] = useState('overview');
  const [error, setError] = useState(null);
  const { selectedYear, isLocked: yearLocked } = useYear();
  const { Body } = VIEWS[view];

  return (
    <SalesActionPage action={ACTION}>
      <div className="baseball-toolbar">
        <SegmentedToggle
          className="seg-toggle-fill"
          ariaLabel="Ansicht"
          value={view}
          onChange={setView}
          options={TABS}
        />
      </div>

      {error && (
        <div className="page-error" role="alert">
          <span>{error}</span>
        </div>
      )}

      <Body key={selectedYear} action={ACTION} year={selectedYear} yearLocked={yearLocked} onError={setError} />
    </SalesActionPage>
  );
};

export default Baseball;
