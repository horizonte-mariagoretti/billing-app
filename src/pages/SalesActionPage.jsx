import { useState } from 'react';
import { Search, AlertCircle } from 'lucide-react';
import useActionDate from '../hooks/useActionDate';
import { useT } from '../hooks/useUiTranslations';
import ActionDateField from '../components/ActionDateField';
import YearSwitcher from '../components/YearSwitcher';
import './SalesActionPage.css';

/**
 * Base page of a Verkaufsaktion (Glühwein, Baseball): header with search bar, action date and year switcher.
 * The content below is still empty. action: an entry of SALES_ACTIONS (utils/lasagnaFinance.js).
 */
const SalesActionPage = ({ action }) => {
  const t = useT();
  const [search, setSearch] = useState('');
  const { year, date, loaded, locked, setDate, error } = useActionDate(action.dateKey);

  // Month opened first in the date picker while no date is set.
  const initialView = `${action.half === 2 ? year + 1 : year}-${action.half === 2 ? '06' : '12'}-01`;

  return (
    <div className="sales-action-page">
      <div className="page-header">
        <div className="search-bar">
          <Search size={18} />
          <input
            type="text"
            placeholder={t('sales_action_search', 'Suchen…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('sales_action_search', 'Suchen…')}
          />
        </div>
        <div className="page-header-end">
          <ActionDateField
            title={t('action_date_hint', 'Datum der Aktion (bestimmt den Monat im Umsatz auf dem Dashboard)')}
            value={date}
            initialView={initialView}
            disabled={!loaded || locked}
            onChange={setDate}
          />
          <YearSwitcher />
        </div>
      </div>

      {error && (
        <div className="page-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default SalesActionPage;
