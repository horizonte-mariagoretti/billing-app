import React from 'react';
import { LayoutDashboard, FileText, FileCheck, Users, Settings } from 'lucide-react';
import './BottomNav.css';

const NAV = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'invoices',  icon: FileText,         label: 'Invoices'  },
  { id: 'quotes',    icon: FileCheck,         label: 'Quotes'    },
  { id: 'clients',   icon: Users,             label: 'Clients'   },
  { id: 'settings',  icon: Settings,          label: 'Settings'  },
];

const BottomNav = ({ currentView, setView }) => (
  <nav className="bottom-nav" aria-label="Primary navigation">
    {NAV.map(({ id, icon: Icon, label }) => (
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
    ))}
  </nav>
);

export default BottomNav;
