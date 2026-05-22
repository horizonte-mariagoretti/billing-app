import React, { useState } from 'react';
import Layout from './components/Layout';
import Clients from './pages/Clients';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Settings from './pages/Settings';
import DocumentList from './pages/DocumentList';
import DocumentEditor from './pages/DocumentEditor';
import useDocuments from './hooks/useDocuments';
import useSettings from './hooks/useSettings';
import { UiTranslationsProvider } from './hooks/useUiTranslations';
import './index.css';

function App() {
  const [view, setView] = useState('dashboard');
  const [isEditing, setIsEditing] = useState(false);
  const [editingData, setEditingData] = useState(null);
  const [appSettings, setAppSettings] = useState(null);
  const { saveDocument, fetchDocumentItems } = useDocuments();
  const { getNextDocumentNumber, loadSettings } = useSettings();

  const [settingsError, setSettingsError] = React.useState(null);
  React.useEffect(() => {
    loadSettings().then(setAppSettings).catch((err) => {
      console.error('Failed to load settings:', err);
      setSettingsError(err.message || 'Failed to load settings');
    });
  }, []);

  const handleNewDoc = (type = 'invoice') => {
    setEditingData({ type });
    setIsEditing(true);
  };

  const handleEditDoc = async (doc) => {
    const items = await fetchDocumentItems(doc.id);
    setEditingData({ ...doc, items });
    setIsEditing(true);
  };

  const handleSaveDoc = async (doc) => {
    await saveDocument(doc);
    setIsEditing(false);
    setEditingData(null);
  };

  const handleConvertToInvoice = async (quote) => {
    // Build a fresh invoice pre-filled from the quote.
    // The quote is stamped 'converted' atomically inside saveDocument when
    // it sees source_quote_id on a new document.
    const items = quote.items?.length
      ? quote.items.map((it) => ({ ...it, id: crypto.randomUUID() }))
      : await fetchDocumentItems(quote.id);
    const today = new Date();
    const due = new Date(today);
    due.setMonth(due.getMonth() + 1);
    const nextNum = await getNextDocumentNumber('invoice');
    const invoiceData = {
      // intentionally no id -> save creates a new document
      type: 'invoice',
      number: nextNum,
      date: today.toISOString().split('T')[0],
      due_date: due.toISOString().split('T')[0],
      title: quote.title || '',
      client_id: quote.client_id || '',
      notes: quote.notes || '',
      currency: quote.currency || 'EUR',
      tax_rate: quote.tax_rate ?? 21,
      discount_value: quote.discount_value || 0,
      discount_type: quote.discount_type || '%',
      language: quote.language || 'de',
      payment_mode: quote.payment_mode || 'standard',
      status: 'draft',
      locked: 0,
      source_quote_id: quote.id,
      items: items.map((it) => ({
        id: crypto.randomUUID(),
        description: it.description,
        qty: it.qty,
        rate: it.rate,
      })),
    };
    setEditingData(invoiceData);
    setIsEditing(true);
    // The next-number counter is incremented inside DocumentEditor's
    // handleSaveWithIncrement (since initialData has no id), so we don't
    // bump it here.
  };

  const renderContent = () => {
    switch (view) {
      case 'dashboard':
        return <Dashboard settings={appSettings} onNewDoc={handleNewDoc} onEditDoc={handleEditDoc} />;
      case 'quotes':
        return <DocumentList type="quote" onEdit={handleEditDoc} onNew={() => handleNewDoc('quote')} />;
      case 'invoices':
        return <DocumentList type="invoice" onEdit={handleEditDoc} onNew={() => handleNewDoc('invoice')} />;
      case 'clients':
        return <Clients />;
      case 'products':
        return <Products />;
      case 'settings':
        return <Settings />;
      default:
        return <div>Dashboard</div>;
    }
  };

  const editorTitle = isEditing
    ? `${editingData?.id ? 'Edit' : 'Create'} ${(editingData?.type || 'invoice').replace(/^./, c => c.toUpperCase())}`
    : null;

  return (
    <UiTranslationsProvider>
      <Layout
        currentView={view}
        setView={(v) => { setView(v); setIsEditing(false); }}
        onNewDoc={(type) => handleNewDoc(type || (view === 'quotes' ? 'quote' : 'invoice'))}
        title={editorTitle}
        settings={appSettings}
        noPadding={isEditing}
      >
        {settingsError && (
          <div className="page-error" role="alert">
            Settings failed to load: {settingsError}
          </div>
        )}
        {isEditing ? (
          <DocumentEditor
            key={editingData?.id || `${editingData?.type}-${editingData?.number || 'new'}`}
            type={editingData?.type || 'invoice'}
            initialData={editingData}
            onSave={handleSaveDoc}
            onCancel={() => setIsEditing(false)}
            onConvertToInvoice={handleConvertToInvoice}
          />
        ) : renderContent()}
      </Layout>
    </UiTranslationsProvider>
  );
}

export default App;
