import React, { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import SyncStatusBadge from '../sync/SyncStatusBadge';
import './Layout.css';

const isWebRuntime = typeof window !== 'undefined' && window.__ELECTRON_PRELOAD__ !== true;

const Layout = ({ children, currentView, setView, onNewDoc, title, settings, noPadding = false }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => { setIsMobileOpen(false); }, [currentView]);
  const resolvedTitle = title ?? (currentView.charAt(0).toUpperCase() + currentView.slice(1));
  const initials = (() => {
    const name = (settings?.company_name || '').trim();
    if (!name) return '??';
    const parts = name.split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase();
  })();

  return (
    <div className={`app-container${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      {isMobileOpen && (
        <div className="sidebar-overlay" onClick={() => setIsMobileOpen(false)} aria-hidden="true" />
      )}
      <Sidebar
        currentView={currentView}
        setView={setView}
        onNewDoc={onNewDoc}
        settings={settings}
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
            aria-label="Toggle navigation"
            aria-expanded={isMobileOpen}
          >
            <Menu size={20} />
          </button>
          <div className="header-left">
            <h1 className="view-title">{resolvedTitle}</h1>
          </div>
          <div className="header-right">
            {isWebRuntime && <SyncStatusBadge />}
          </div>
        </header>
        <div className={`content-body${noPadding ? ' content-body--no-padding' : ''}`}>
          {children}
        </div>
      </main>
      {/* Bottom nav: hidden in editor (noPadding) mode and on desktop via CSS */}
      {!noPadding && (
        <BottomNav currentView={currentView} setView={setView} />
      )}
    </div>
  );
};

export default Layout;
