import React from 'react';
import { LayoutDashboard, FileText, FileCheck, Users, Settings } from 'lucide-react';
import { useT } from '../hooks/useUiTranslations';
import './BottomNav.css';

// Reuses the same nav_* keys Sidebar.jsx already tokenizes — same labels, same meaning.
const NAV = [
  { id: 'dashboard', icon: LayoutDashboard, key: 'nav_dashboard', fallback: 'Dashboard' },
  { id: 'invoices',  icon: FileText,         key: 'nav_invoices', fallback: 'Invoices'  },
  { id: 'quotes',    icon: FileCheck,         key: 'nav_quotes',   fallback: 'Quotes'    },
  { id: 'clients',   icon: Users,             key: 'nav_clients',  fallback: 'Clients'   },
  { id: 'settings',  icon: Settings,          key: 'nav_settings', fallback: 'Settings'  },
];

const BottomNav = ({ currentView, setView }) => {
  const t = useT();
  return (
    <nav className="bottom-nav" aria-label={t('nav_primary', 'Primary navigation')}>
      {NAV.map(({ id, icon: Icon, key, fallback }) => {
        const label = t(key, fallback);
        return (
          <button
            key={id}
            className={`bottom-nav-item${currentView === id ? ' active' : ''}`}
            onClick={() => setView(id)}
            aria-label={label}
            aria-current={currentView === id ? 'page' : undefined}
          >
            <Icon size={21} strokeWidth={currentView === id ? 2.5 : 1.75} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default BottomNav;
