import { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import SyncStatusBadge from '../sync/SyncStatusBadge';
import { useT } from '../hooks/useUiTranslations';
import OverlayScrollArea from './OverlayScrollArea';
import './Layout.css';

const Layout = ({ children, currentView, setView, onNewDoc, title, noPadding = false }) => {
  const t = useT();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- local draft follows its prop
  useEffect(() => { setIsMobileOpen(false); }, [currentView]);
  // Falls back to the sidebar's own nav_* token for this view instead of
  // just capitalizing the raw view key (which always rendered in English,
  // regardless of app language).
  const VIEW_TITLE_KEYS = {
    dashboard: ['nav_dashboard', 'Dashboard'],
    dashboard2: ['nav_dashboard2', 'Dashboard 2.0'],
    invoices: ['nav_invoices', 'Invoices'],
    quotes: ['nav_quotes', 'Quotes'],
    clients: ['nav_clients', 'Clients'],
    products: ['nav_products', 'Products'],
    arbeiten: ['nav_arbeiten', 'Arbeiten'],
    horis: ['nav_horis', 'Horis'],
    lasagnen: ['nav_lasagnen', 'Lasagnen'],
    gluehwein: ['nav_gluehwein', 'Glühweinbude'],
    baseball: ['nav_baseball', 'Baseballturnier'],
    settings: ['nav_settings', 'Settings'],
  };
  const [fallbackKey, fallbackText] = VIEW_TITLE_KEYS[currentView] || [null, currentView];
  const resolvedTitle = title ?? (fallbackKey ? t(fallbackKey, fallbackText) : fallbackText);
  useEffect(() => {
    if (typeof resolvedTitle === 'string' && resolvedTitle) document.title = `${resolvedTitle} · Hori-Admin`;
  }, [resolvedTitle]);

  return (
    <div className={`app-container${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      {isMobileOpen && (
        <div className="sidebar-overlay" onClick={() => setIsMobileOpen(false)} aria-hidden="true" />
      )}
      <Sidebar
        currentView={currentView}
        setView={setView}
        onNewDoc={onNewDoc}
        collapsed={isMobileOpen ? false : sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(v => !v)}
        isMobileOpen={isMobileOpen}
        onMobileClose={() => setIsMobileOpen(false)}
      />
      <main className="main-content">
        <header className="content-header">
          <div className="title-bar-drag-region"></div>
          <button
            className="hamburger-btn"
            onClick={() => setIsMobileOpen(v => !v)}
            aria-label={t('nav_toggle', 'Toggle navigation')}
            aria-expanded={isMobileOpen}
          >
            <Menu size={20} />
          </button>
          <div className="header-left">
            <h1 className="view-title">{resolvedTitle}</h1>
          </div>
          <div className="header-right">
            <SyncStatusBadge />
          </div>
        </header>
        <OverlayScrollArea className={`content-body${noPadding ? ' content-body--no-padding' : ''}`}>
          {children}
        </OverlayScrollArea>
      </main>
      {/* Bottom nav: hidden in editor (noPadding) mode and on desktop via CSS */}
      {!noPadding && (
        <BottomNav currentView={currentView} setView={setView} />
      )}
    </div>
  );
};

export default Layout;
