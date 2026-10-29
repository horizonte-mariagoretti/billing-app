import React from 'react';
import {
  LayoutDashboard,
  Gauge,
  FileText,
  Users,
  Settings,
  Package,
  Briefcase,
  Baby,
  UtensilsCrossed,
  Snowflake,
  Trophy,
  ReceiptEuro,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { version as appVersion } from '../../package.json';
import { useT } from '../hooks/useUiTranslations';
import './Sidebar.css';

const Sidebar = ({ currentView, setView, onNewDoc, settings, collapsed, onToggleCollapse, isMobileOpen, onMobileClose }) => {
  const t = useT();

  // Sidebar sections: Übersicht, Finanzen, Arbeiten, Aktionen, Allgemein.
  const navSections = [
    {
      key: 'overview',
      label: t('nav_section_overview', 'Übersicht'),
      items: [
        { id: 'dashboard', label: t('nav_dashboard', 'Dashboard'), icon: LayoutDashboard },
        { id: 'dashboard2', label: t('nav_dashboard2', 'Dashboard 2.0'), icon: Gauge },
      ],
    },
    {
      key: 'finance',
      label: t('nav_section_finance', 'Finanzen'),
      items: [
        { id: 'invoices',  label: t('nav_invoices', 'Invoices'),   icon: ReceiptEuro },
        { id: 'quotes',    label: t('nav_quotes', 'Quotes'),       icon: FileText },
        { id: 'clients',   label: t('nav_clients', 'Clients'),     icon: Users },
        { id: 'products',  label: t('nav_products', 'Products'),   icon: Package },
      ],
    },
    {
      key: 'work',
      label: t('nav_section_work', 'Arbeiten'),
      items: [
        { id: 'horis',     label: t('nav_horis', 'Horis'),         icon: Baby },
        { id: 'arbeiten',  label: t('nav_arbeiten', 'Arbeiten'),   icon: Briefcase },
      ],
    },
    {
      key: 'actions',
      label: t('nav_section_actions', 'Aktionen'),
      items: [
        { id: 'lasagnen',  label: t('nav_lasagnen', 'Lasagnen'),           icon: UtensilsCrossed },
        { id: 'gluehwein', label: t('nav_gluehwein', 'Glühweinbude'),      icon: Snowflake },
        { id: 'baseball',  label: t('nav_baseball', 'Baseballturnier'),    icon: Trophy },
      ],
    },
    {
      key: 'general',
      label: t('nav_general', 'General'),
      items: [
        { id: 'settings', label: t('nav_settings', 'Settings'), icon: Settings },
      ],
    },
  ];

  const renderItem = (item) => {
    const Icon = item.icon;
    const isActive = currentView === item.id;
    return (
      <button
        key={item.id}
        className={`nav-item ${isActive ? 'active' : ''}`}
        onClick={() => { setView(item.id); onMobileClose?.(); }}
        title={collapsed ? item.label : undefined}
        aria-label={item.label}
        aria-current={isActive ? 'page' : undefined}
      >
        <Icon size={18} aria-hidden="true" />
        {!collapsed && <span>{item.label}</span>}
        {isActive && <span className="nav-active-dot" aria-hidden="true" />}
      </button>
    );
  };

  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}${isMobileOpen ? ' mobile-open' : ''}`}>
      <div className="sidebar-header">
        <div className="logo">HA</div>
        {!collapsed && (
          <div className="app-info">
            <span className="app-name">Hori-Admin</span>
            <span className="app-version">v{appVersion}</span>
          </div>
        )}
        <button
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          title={collapsed ? t('sidebar_expand', 'Expand sidebar') : t('sidebar_collapse', 'Collapse sidebar')}
          aria-label={collapsed ? t('sidebar_expand', 'Expand sidebar') : t('sidebar_collapse', 'Collapse sidebar')}
        >
          <CollapseIcon size={16} />
        </button>
      </div>

      <button
        className="sidebar-cta"
        onClick={() => onNewDoc('invoice')}
        title={collapsed ? t('nav_new_invoice', 'New Invoice') : undefined}
        aria-label={t('nav_new_invoice', 'New Invoice')}
      >
        <ReceiptEuro size={16} aria-hidden="true" />
        {!collapsed && <span>{t('nav_new_invoice', 'New Invoice')}</span>}
      </button>

      {navSections.map((section) => (
        <div className="nav-section" key={section.key}>
          {!collapsed && <span className="nav-section-label">{section.label}</span>}
          <nav className="sidebar-nav" aria-label={section.label}>
            {section.items.map(renderItem)}
          </nav>
        </div>
      ))}

    </aside>
  );
};

export default Sidebar;
