import React, { useState } from 'react';
import Layout from './components/Layout';
import Clients from './pages/Clients';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Settings from './pages/Settings';
import Arbeiten from './pages/Arbeiten';
import Horis from './pages/Horis';
import Lasagnen from './pages/Lasagnen';
import DocumentList from './pages/DocumentList';
import DocumentEditor from './pages/DocumentEditor';
import useDocuments from './hooks/useDocuments';
import useSettings from './hooks/useSettings';
import useDatabase from './hooks/useDatabase';
import useJobs from './hooks/useJobs';
import { buildJobItems } from './utils/jobDocumentLines';
import { UiTranslationsProvider, useT } from './hooks/useUiTranslations';
import './index.css';

// AppInner is a child of UiTranslationsProvider (see App() below) so it can
// use useT() — App() itself can't, since it's the one creating the provider.
function AppInner() {
  const t = useT();
  const [view, setView] = useState('dashboard');
  const [isEditing, setIsEditing] = useState(false);
  const [editingData, setEditingData] = useState(null);
  const [appSettings, setAppSettings] = useState(null);
  const { saveDocument, fetchDocumentItems } = useDocuments();
  const { getNextDocumentNumber, loadSettings } = useSettings();
  const { query, transaction } = useDatabase();
  const { fetchJob } = useJobs();

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

  // Open an existing document (by id) in the editor — used by Arbeiten to
  // jump from a job to its linked offer/invoice.
  const handleOpenDoc = async (docId) => {
    if (!docId) return;
    try {
      const rows = await query('SELECT * FROM documents WHERE id = ?', [docId]);
      if (rows?.[0]) await handleEditDoc(rows[0]);
    } catch (err) {
      console.error('Failed to open document:', err);
    }
  };

  const handleSaveDoc = async (doc) => {
    const isNew = !doc.id;
    const id = await saveDocument(doc);
    // Link the new document back to its job (Arbeit). `source_job_id` is not
    // a documents column — it only travels in the editor state of a doc that
    // was created from a job. A new invoice converted from a quote also gets
    // linked to any job that references that quote, so quote + invoice stay
    // interlinked on the job.
    if (isNew && id) {
      const ops = [];
      if (doc.source_job_id) {
        ops.push({
          sql: doc.type === 'quote'
            ? 'UPDATE jobs SET quote_id = ? WHERE id = ?'
            : 'UPDATE jobs SET invoice_id = ? WHERE id = ?',
          params: [id, doc.source_job_id],
        });
      }
      if (doc.type === 'invoice' && doc.source_quote_id) {
        ops.push({
          sql: "UPDATE jobs SET invoice_id = ? WHERE quote_id = ? AND (invoice_id IS NULL OR invoice_id = '')",
          params: [id, doc.source_quote_id],
        });
      }
      if (ops.length) {
        try {
          await transaction(ops);
        } catch (err) {
          // The document itself is saved; only the job link failed.
          console.error('Failed to link document to job:', err);
        }
      }
    }
    setIsEditing(false);
    setEditingData(null);
  };

  const handleConvertToInvoice = async (quote, extra = {}) => {
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
      ...(quote.visible_columns ? { visible_columns: quote.visible_columns } : {}),
      items: items.map((it) => ({
        id: crypto.randomUUID(),
        name: it.name ?? '',
        description: it.description,
        qty: it.qty,
        rate: it.rate,
        duration: it.duration ?? 1,
      })),
      ...extra,
    };
    setEditingData(invoiceData);
    setIsEditing(true);
    // The next-number counter is incremented inside DocumentEditor's
    // handleSaveWithIncrement (since initialData has no id), so we don't
    // bump it here.
  };

  /**
   * Create an offer/invoice from a job (Arbeit) and open it in the editor.
   * - The job already has a document of that type → open it instead.
   * - Invoice requested and the job has a quote → reuse the quote->invoice
   *   conversion (source_quote_id) instead of the job dialog's line.
   * - Otherwise `params` ({ name, rate, productId? } from JobDocumentDialog)
   *   name the lines and set the hourly wage; the lines themselves come from
   *   the freshly fetched job via buildJobItems (one per distinct Hori-hours
   *   value: Menge = Horis, Dauer = hours, Bemerkung = start time + hours).
   * The link back to the job is written in handleSaveDoc via source_job_id.
   */
  const handleCreateDocFromJob = async (jobId, type, params = null) => {
    const job = await fetchJob(jobId);
    if (!job) return;
    const existingId = type === 'quote' ? job.quote_id : job.invoice_id;
    if (existingId) { await handleOpenDoc(existingId); return; }

    if (type === 'invoice' && job.quote_id) {
      // An invoice converted from this quote may already exist (e.g. created
      // from the Angebote page before the job was linked) — link + open it.
      const existingInv = await query(
        "SELECT id FROM documents WHERE type = 'invoice' AND source_quote_id = ? ORDER BY date DESC LIMIT 1",
        [job.quote_id]
      );
      if (existingInv?.[0]?.id) {
        await transaction([{ sql: 'UPDATE jobs SET invoice_id = ? WHERE id = ?', params: [existingInv[0].id, job.id] }]);
        await handleOpenDoc(existingInv[0].id);
        return;
      }
      const quoteRows = await query('SELECT * FROM documents WHERE id = ?', [job.quote_id]);
      if (quoteRows?.[0]) {
        await handleConvertToInvoice(quoteRows[0], { source_job_id: job.id });
        return;
      }
    }

    if (!params) return; // a fresh document needs the dialog's name + wage

    const s = appSettings || await loadSettings().catch(() => ({}));
    const today = new Date();
    const due = new Date(today);
    due.setMonth(due.getMonth() + (type === 'invoice' ? 1 : 2));
    const taxN = parseFloat(s?.default_tax_rate);
    const nextNum = await getNextDocumentNumber(type);
    const items = buildJobItems({
      job,
      type,
      name: params.name,
      rate: params.rate,
      clockSuffix: t('jobdoc_clock_suffix', 'Uhr'),
      openPrefix: t('jobs_open_prefix', 'ab'),
    });
    setEditingData({
      // intentionally no id -> save creates a new document
      type,
      number: nextNum,
      date: today.toISOString().split('T')[0],
      due_date: due.toISOString().split('T')[0],
      title: job.title || '',
      client_id: job.client_id || '',
      notes: '',
      currency: s?.default_currency || 'EUR',
      tax_rate: Number.isFinite(taxN) ? taxN : 21,
      discount_value: 0,
      discount_type: '%',
      language: 'de',
      payment_mode: 'cash',
      status: 'draft',
      locked: 0,
      visible_columns: { qty: true, duration: true, rate: true, total: true },
      source_job_id: job.id,
      items,
    });
    setIsEditing(true);
    // Counter is incremented by DocumentEditor on first save (no id).
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
      case 'arbeiten':
        return <Arbeiten onCreateDocFromJob={handleCreateDocFromJob} onOpenDoc={handleOpenDoc} />;
      case 'horis':
        return <Horis />;
      case 'lasagnen':
        return <Lasagnen />;
      case 'settings':
        return <Settings />;
      default:
        return <div>{t('nav_dashboard', 'Dashboard')}</div>;
    }
  };

  // Mirrors the same title logic DocumentEditor.jsx uses internally for its
  // own header, so the page-level title (here) and the editor's own <h2>
  // agree instead of one being hardcoded English and the other localized.
  const editorTitle = isEditing
    ? (editingData?.id
        ? t('editor_edit', 'Edit Document')
        : editingData?.type === 'quote'
          ? t('editor_create_quote', 'New Quote')
          : t('editor_create_invoice', 'New Invoice'))
    : null;

  return (
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
          {t('settings_load_error', 'Settings failed to load')}: {settingsError}
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
  );
}

function App() {
  return (
    <UiTranslationsProvider>
      <AppInner />
    </UiTranslationsProvider>
  );
}

export default App;
