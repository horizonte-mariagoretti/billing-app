import React, { useState } from 'react';
import Sidebar from './Sidebar';
import SyncStatusBadge from '../sync/SyncStatusBadge';
import './Layout.css';

const isWebRuntime = typeof window !== 'undefined' && window.__ELECTRON_PRELOAD__ !== true;

const Layout = ({ children, currentView, setView, onNewDoc, title, settings }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const resolvedTitle = title ?? (currentView.charAt(0).toUpperCase() + currentView.slice(1));
  const initials = (() => {
    const name = (settings?.company_name || '').trim();
    if (!name) return '??';
    const parts = name.split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase();
  })();

  return (
    <div className={`app-container${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <Sidebar
        currentView={currentView}
        setView={setView}
        onNewDoc={onNewDoc}
        settings={settings}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(v => !v)}
      />
      <main className="main-content">
        <header className="content-header">
          <div className="title-bar-drag-region"></div>
          <div className="header-left">
            <h1 className="view-title">{resolvedTitle}</h1>
          </div>
          <div className="header-right">
            {isWebRuntime && <SyncStatusBadge />}
          </div>
        </header>
        <div className="content-body">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
