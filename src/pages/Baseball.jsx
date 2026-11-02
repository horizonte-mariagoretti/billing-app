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

// Tabs grouped into areas; every tab body takes the same props. A group with one tab shows no sub-tab row.
const GROUPS = [
  {
    value: 'overview',
    label: 'Übersicht',
    icon: <LayoutList size={15} />,
    tabs: [{ value: 'overview', label: 'Übersicht', icon: <LayoutList size={15} />, Body: BaseballOverview }],
  },
  {
    value: 'teams',
    label: 'Teams',
    icon: <Users size={15} />,
    tabs: [
      { value: 'teams', label: 'Teams', icon: <Users size={15} />, Body: BaseballTeams },
      { value: 'table', label: 'Tabelle', icon: <ListOrdered size={15} />, Body: BaseballTable },
      { value: 'fields', label: 'Felder', icon: <MapPin size={15} />, Body: BaseballFields },
    ],
  },
  {
    value: 'money',
    label: 'Geld',
    icon: <Wallet size={15} />,
    tabs: [
      { value: 'sponsors', label: 'Sponsoren', icon: <Handshake size={15} />, Body: BaseballSponsors },
      { value: 'kasse', label: 'Kasse', icon: <Banknote size={15} />, Body: GluehweinKasse },
      { value: 'finance', label: 'Finanzen', icon: <Wallet size={15} />, Body: GluehweinFinanzen },
    ],
  },
  {
    value: 'day',
    label: 'Turniertag',
    icon: <CalendarDays size={15} />,
    tabs: [
      { value: 'shifts', label: 'Schichten', icon: <CalendarDays size={15} />, Body: BaseballDienste },
      { value: 'shopping', label: 'Einkaufsliste', icon: <ShoppingCart size={15} />, Body: BaseballShopping },
    ],
  },
];

const GROUP_OPTIONS = GROUPS.map(({ value, label, icon }) => ({ value, label, icon }));
const TAB_OPTIONS = Object.fromEntries(
  GROUPS.map((g) => [g.value, g.tabs.map(({ value, label, icon }) => ({ value, label, icon }))]),
);
const DEFAULT_TABS = Object.fromEntries(GROUPS.map((g) => [g.value, g.tabs[0].value]));

/**
 * Baseballturnier: base page (search, action date, year switcher) with four areas: Übersicht, Teams (Teams,
 * Tabelle, Felder), Geld (Sponsoren, Kasse, Finanzen) and Turniertag (Schichten, Einkaufsliste). Each area
 * remembers its last sub-tab. Kasse and Finanzen are the shared Glühweinbude components (filtered by the action),
 * so a change there applies here too.
 */
const Baseball = () => {
  const [group, setGroup] = useState('overview');
  const [tabByGroup, setTabByGroup] = useState(DEFAULT_TABS);
  const [error, setError] = useState(null);
  const { selectedYear, isLocked: yearLocked } = useYear();

  const activeGroup = GROUPS.find((g) => g.value === group) || GROUPS[0];
  const activeTab = activeGroup.tabs.find((t) => t.value === tabByGroup[activeGroup.value]) || activeGroup.tabs[0];
  const { Body } = activeTab;

  const changeGroup = (value) => {
    setError(null);
    setGroup(value);
  };
  const changeTab = (value) => {
    setError(null);
    setTabByGroup((prev) => ({ ...prev, [activeGroup.value]: value }));
  };

  return (
    <SalesActionPage action={ACTION}>
      <div className="baseball-toolbar">
        <SegmentedToggle
          className="seg-toggle-fill"
          ariaLabel="Bereich"
          value={activeGroup.value}
          onChange={changeGroup}
          options={GROUP_OPTIONS}
        />
      </div>

      {activeGroup.tabs.length > 1 && (
        <div className="baseball-toolbar baseball-subtoolbar">
          <SegmentedToggle
            ariaLabel="Ansicht"
            value={activeTab.value}
            onChange={changeTab}
            options={TAB_OPTIONS[activeGroup.value]}
          />
        </div>
      )}

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
