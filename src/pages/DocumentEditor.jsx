import React, { useState, useEffect } from 'react';
import {
  ChevronLeft, Plus, Trash2, Save, Eye, FileText,
  Send, CheckCircle2, XCircle, Unlock, ArrowRightCircle, ThumbsUp, ThumbsDown
} from 'lucide-react';
import Button from '../components/Button';
import Input from '../components/Input';
import StatusBadge from '../components/StatusBadge';
import ConfirmDialog from '../components/ConfirmDialog';
import useDatabase from '../hooks/useDatabase';
import useDocuments from '../hooks/useDocuments';
import useSettings from '../hooks/useSettings';
import { useT } from '../hooks/useUiTranslations';
import { effectiveStatus, allowedNextStatuses } from '../utils/documentLifecycle';
import DocumentPreview from './DocumentPreview';
import previewCss from './DocumentPreview.css?inline';
import './DocumentEditor.css';

const DocumentEditor = ({ type = 'invoice', initialData, onSave, onCancel, onConvertToInvoice }) => {
  const { query } = useDatabase();
  const { transitionDocument, fetchPayments } = useDocuments();
  const { loadSettings, getNextDocumentNumber, incrementDocumentNumber } = useSettings();
  const t = useT();
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [payments, setPayments] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  const [pendingCancel, setPendingCancel] = useState(false);
  const [transitionError, setTransitionError] = useState(null);
  const prevTaxRateRef = React.useRef(null);
  const [doc, setDoc] = useState(() => {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];

    const dueDate = new Date(today);
    if (type === 'invoice') dueDate.setMonth(dueDate.getMonth() + 1);
    else dueDate.setMonth(dueDate.getMonth() + 2);
    const dueDateStr = dueDate.toISOString().split('T')[0];

    const defaults = {
      type,
      number: '',
      date: dateStr,
      due_date: dueDateStr,
      title: '',
      client_id: '',
      notes: '',
      currency: 'EUR',
      tax_rate: 21,
      discount_value: 0,
      discount_type: '%',
      language: 'de',
      payment_mode: 'standard',
      status: 'draft',
      locked: 0,
      items: [{ id: crypto.randomUUID(), description: '', qty: 1, rate: 0 }]
    };
    if (initialData) {
      return {
        ...defaults,
        ...initialData,
        items: (initialData.items && initialData.items.length > 0)
          ? initialData.items
          : defaults.items
      };
    }
    return defaults;
  });

  const isCash = doc.payment_mode === 'cash';
  const status = doc.status || 'draft';
  const displayStatus = effectiveStatus(doc);
  const isLocked = doc.locked === 1 && status !== 'draft';
  const isPersisted = !!doc.id;

  const updateDoc = (updater) => {
    setDoc(updater);
    setIsDirty(true);
  };

  useEffect(() => {
    fetchClients();
    fetchProducts();
    fetchSettingsAndNumber();
  }, [type]);

  useEffect(() => {
    if (isPersisted && status === 'paid') {
      fetchPayments(doc.id).then(setPayments);
    } else {
      setPayments([]);
    }
  }, [isPersisted, status, doc.id, fetchPayments]);

  const fetchClients = async () => {
    const data = await query(
      'SELECT id, name, address_street, address_zip, address_city, address_country FROM clients ORDER BY name ASC'
    );
    setClients(data);
  };

  const fetchProducts = async () => {
    const data = await query('SELECT * FROM products ORDER BY name ASC');
    setProducts(data);
  };

  const fetchSettingsAndNumber = async () => {
    const s = await loadSettings();
    setSettings(s);

    if (!initialData?.id) {
      const nextNum = await getNextDocumentNumber(type);
      setDoc(d => ({
        ...d,
        number: nextNum,
        tax_rate: (() => { const n = parseFloat(s.default_tax_rate); return Number.isFinite(n) ? n : 21; })(),
        currency: s.default_currency || 'EUR'
      }));
    }
  };

  const handleSaveWithIncrement = async () => {
    await onSave(doc);
    setIsDirty(false);
    if (!initialData?.id) {
      await incrementDocumentNumber(type);
    }
  };

  const handleCancel = () => {
    if (isDirty) { setPendingCancel(true); return; }
    onCancel();
  };

  const handleTransition = async (next) => {
    if (!isPersisted) {
      setTransitionError(t('editor_save_before_status', 'Save the document before changing its status.'));
      return;
    }
    try {
      const updated = await transitionDocument({ ...doc, total: subtotal - discount + tax }, next);
      setDoc((d) => ({ ...d, ...updated }));
      if (next === 'paid') {
        const refreshed = await fetchPayments(doc.id);
        setPayments(refreshed);
      }
    } catch (err) {
      setTransitionError(`Transition failed: ${err.message}`);
    }
  };

  const handleConvertClick = () => {
    if (!isPersisted) {
      setTransitionError(t('editor_save_before_convert', 'Save the quote before converting it.'));
      return;
    }
    onConvertToInvoice?.({ ...doc });
  };

  const addItem = (afterId = null) => {
    const newItem = { id: crypto.randomUUID(), description: '', qty: 1, rate: 0 };
    updateDoc((d) => {
      if (afterId == null) return { ...d, items: [...d.items, newItem] };
      const idx = d.items.findIndex(i => i.id === afterId);
      return { ...d, items: [...d.items.slice(0, idx + 1), newItem, ...d.items.slice(idx + 1)] };
    });
  };

  const addProductItem = (productId) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;
    let name = prod.name;
    let desc = prod.description;
    if (doc.language === 'de' && prod.name_de) {
      name = prod.name_de;
      desc = prod.description_de || desc;
    } else if (doc.language === 'fr' && prod.name_fr) {
      name = prod.name_fr;
      desc = prod.description_fr || desc;
    }
    const fullDesc = desc ? `${name}\n${desc}` : name;
    updateDoc((d) => ({
      ...d,
      items: [...d.items, {
        id: crypto.randomUUID(),
        description: fullDesc, qty: 1, rate: prod.rate || 0
      }]
    }));
  };

  const updateItem = (id, field, value) => {
    updateDoc((d) => ({
      ...d,
      items: d.items.map(item => item.id === id ? { ...item, [field]: value } : item)
    }));
  };

  const removeItem = (id) => {
    updateDoc((d) => ({ ...d, items: d.items.filter(item => item.id !== id) }));
  };

  const handleDateChange = (newDate) => {
    const dt = new Date(newDate);
    const due = new Date(dt);
    if (type === 'invoice') due.setMonth(due.getMonth() + 1);
    else due.setMonth(due.getMonth() + 2);
    setIsDirty(true);
    setDoc({ ...doc, date: newDate, due_date: due.toISOString().split('T')[0] });
  };

  const togglePaymentMode = () => {
    setIsDirty(true);
    setDoc((d) => {
      const goingCash = d.payment_mode !== 'cash';
      if (goingCash) {
        if (Number(d.tax_rate) > 0) prevTaxRateRef.current = d.tax_rate;
        return { ...d, payment_mode: 'cash', tax_rate: 0 };
      } else {
        const fallback = (() => { const n = parseFloat(settings?.default_tax_rate); return Number.isFinite(n) ? n : 21; })();
        const restored = prevTaxRateRef.current != null ? prevTaxRateRef.current : fallback;
        return { ...d, payment_mode: 'standard', tax_rate: restored };
      }
    });
  };

  const subtotal = doc.items.reduce((sum, item) => sum + (item.qty * item.rate), 0);
  const discount = doc.discount_type === '%'
    ? subtotal * (doc.discount_value / 100)
    : doc.discount_value;
  const tax = isCash ? 0 : (subtotal - discount) * (doc.tax_rate / 100);
  const total = subtotal - discount + tax;

  const fmt = (v) => v.toLocaleString('de-DE', { style: 'currency', currency: doc.currency || 'EUR' });

  const handleExportPDF = async () => {
    const previewEl = document.querySelector('.pdf-container');
    if (!previewEl) {
      setTransitionError(t('editor_preview_first', 'Switch to Preview before exporting the PDF.'));
      return;
    }
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>${previewCss}
      html, body { margin: 0; padding: 0; background: #fff; }
      .pdf-container { box-shadow: none !important; transform: none !important; }
    </style>
  </head>
  <body>${previewEl.outerHTML}</body>
</html>`;
    const filename = `${doc.type}-${doc.number || 'draft'}.pdf`;
    try {
      if (window.electron?.pdf?.generate) {
        // Electron path: native printToPDF + save dialog.
        await window.electron.pdf.generate({ html, filename });
      } else {
        // Web path: render in a hidden iframe so html2pdf can capture the
        // standalone HTML (which already includes the print stylesheet),
        // then trigger a Blob download with the standard filename.
        const html2pdf = (await import('html2pdf.js')).default;
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.left = '-10000px';
        iframe.style.top = '0';
        iframe.style.width = '210mm';
        iframe.style.height = '297mm';
        iframe.style.border = '0';
        document.body.appendChild(iframe);
        try {
          const idoc = iframe.contentDocument || iframe.contentWindow.document;
          idoc.open(); idoc.write(html); idoc.close();
          // Wait one frame for layout + fonts.
          await new Promise(r => setTimeout(r, 200));
          const target = idoc.querySelector('.pdf-container') || idoc.body;
          await html2pdf()
            .set({
              filename,
              margin: 0,
              image: { type: 'jpeg', quality: 0.98 },
              html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
              jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            })
            .from(target)
            .save();
        } finally {
          document.body.removeChild(iframe);
        }
      }
    } catch (err) {
      setTransitionError(`PDF export failed: ${err.message}`);
    }
  };

  const nextStatuses = allowedNextStatuses(doc);

  // Compose lifecycle action buttons based on type + current status
  const lifecycleActions = (() => {
    if (!isPersisted) return null;
    const acts = [];
    if (type === 'invoice') {
      if (nextStatuses.includes('sent') && status === 'draft') {
        acts.push(<Button key="send" variant="outline" icon={Send} onClick={() => handleTransition('sent')}>{t('editor_mark_sent', 'Mark as Sent')}</Button>);
      }
      if (status === 'paid') {
        acts.push(<Button key="unlock" variant="outline" icon={Unlock} onClick={() => handleTransition('sent')}>{t('editor_unlock_edit', 'Unlock for Edit')}</Button>);
      }
      if (nextStatuses.includes('paid')) {
        acts.push(<Button key="paid" variant="primary" icon={CheckCircle2} onClick={() => handleTransition('paid')}>{t('editor_mark_paid', 'Mark as Paid')}</Button>);
      }
      if (nextStatuses.includes('cancelled')) {
        acts.push(<Button key="cancel" variant="danger" icon={XCircle} onClick={() => handleTransition('cancelled')}>{t('editor_cancel_invoice', 'Cancel Invoice')}</Button>);
      }
    } else if (type === 'quote') {
      if (nextStatuses.includes('sent')) {
        acts.push(<Button key="send" variant="outline" icon={Send} onClick={() => handleTransition('sent')}>{t('editor_mark_sent', 'Mark as Sent')}</Button>);
      }
      if (nextStatuses.includes('accepted')) {
        acts.push(<Button key="accept" variant="primary" icon={ThumbsUp} onClick={() => handleTransition('accepted')}>{t('editor_mark_accepted', 'Mark Accepted')}</Button>);
      }
      if (nextStatuses.includes('declined')) {
        acts.push(<Button key="decline" variant="danger" icon={ThumbsDown} onClick={() => handleTransition('declined')}>{t('editor_mark_declined', 'Mark Declined')}</Button>);
      }
      if (status === 'accepted') {
        acts.push(<Button key="convert" variant="primary" icon={ArrowRightCircle} onClick={handleConvertClick}>{t('editor_convert_to_invoice', 'Convert to Invoice')}</Button>);
      }
    }
    return acts;
  })();

  return (
    <div className="doc-editor">
      <header className="doc-editor-header">
        <div className="left">
          <button className="back-btn" aria-label="Go back" onClick={handleCancel}>
            <ChevronLeft size={20} />
          </button>
          <h2>{doc.id ? t('editor_edit', 'Edit Document') : t('editor_create', 'Create Document')}</h2>
          {isPersisted && <StatusBadge status={displayStatus} />}
        </div>
        <div className="actions">
          <div className="lang-switcher">
            <button className={doc.language === 'en' ? 'active' : ''} onClick={() => updateDoc(d => ({...d, language: 'en'}))}>EN</button>
            <button className={doc.language === 'de' ? 'active' : ''} onClick={() => updateDoc(d => ({...d, language: 'de'}))}>DE</button>
            <button className={doc.language === 'fr' ? 'active' : ''} onClick={() => updateDoc(d => ({...d, language: 'fr'}))}>FR</button>
          </div>
          <Button variant="ghost" onClick={handleCancel}>{t('btn_cancel', 'Cancel')}</Button>
          <Button variant="outline" icon={Eye} onClick={() => setShowPreview(!showPreview)}>
            {showPreview ? t('editor_back_to_editor', 'Back to Editor') : t('editor_preview', 'Preview')}
          </Button>
          {showPreview && (
            <Button variant="outline" onClick={handleExportPDF}>{t('editor_export_pdf', 'Export PDF')}</Button>
          )}
          {!isLocked && (
            <Button variant="primary" icon={Save} onClick={handleSaveWithIncrement}>{t('editor_save', 'Save Document')}</Button>
          )}
        </div>
      </header>

      {lifecycleActions && lifecycleActions.length > 0 && (
        <div className="lifecycle-bar">
          {lifecycleActions}
        </div>
      )}

      <div className="doc-editor-body">
        {showPreview ? (
          <div className="preview-container">
            <div className="preview-scale-wrap">
              <DocumentPreview
                doc={doc}
                sender={settings}
                client={clients.find(c => c.id === doc.client_id) || null}
              />
            </div>
          </div>
        ) : (
          <fieldset className="doc-main-form" disabled={isLocked}>
            {isLocked && (
              <div className="locked-banner">
                {t('editor_locked_notice', 'This document is locked. Click "Unlock for Edit" to make changes.')}
              </div>
            )}

            <section className="form-section card">
              <div className="section-grid">
                <div className="input-col">
                  <label>Client</label>
                  <select
                    value={doc.client_id}
                    onChange={(e) => updateDoc(d => ({...d, client_id: e.target.value}))}
                    className="input-field"
                  >
                    <option value="">{t('editor_select_client', 'Select a client...')}</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="input-col">
                  <Input
                    label={t('editor_doc_title', 'Document Title / Subject')}
                    placeholder={t('editor_doc_title_placeholder', 'e.g. Website Design Project')}
                    value={doc.title}
                    onChange={(e) => updateDoc(d => ({...d, title: e.target.value}))}
                  />
                </div>
              </div>

              <div className="section-grid three-col">
                <Input
                  label={t('editor_doc_number', 'Document Number')}
                  value={doc.number}
                  onChange={(e) => updateDoc(d => ({...d, number: e.target.value}))}
                />
                <Input
                  label={t('editor_field_date', 'Date')}
                  type="date"
                  value={doc.date}
                  onChange={(e) => handleDateChange(e.target.value)}
                />
                <Input
                  label={type === 'quote' ? t('editor_valid_until', 'Valid Until') : t('editor_due_date', 'Due Date')}
                  type="date"
                  value={doc.due_date}
                  onChange={(e) => updateDoc(d => ({...d, due_date: e.target.value}))}
                />
              </div>
            </section>

            <section className="items-section card">
              <div className="items-header">
                <h3>{t('editor_line_items', 'Line Items')}</h3>
                <div className="product-loader">
                  <FileText size={16} />
                  <select onChange={(e) => { addProductItem(e.target.value); e.target.value = ""; }}>
                    <option value="">{t('editor_add_from_products', 'Add from Products...')}</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="items-list">
                <div className="items-grid-header">
                  <div className="col-desc">{t('col_description', 'Description')}</div>
                  <div className="col-qty">{t('col_qty', 'Qty')}</div>
                  <div className="col-rate">{t('col_rate', 'Rate')}</div>
                  <div className="col-total">{t('col_total', 'Total')}</div>
                  <div className="col-actions"></div>
                </div>
                {doc.items.map((item) => (
                  <div key={item.id} className="item-row">
                    <div className="col-desc">
                      <textarea
                        placeholder={t('editor_item_description', 'Item description...')}
                        value={item.description}
                        onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="col-qty">
                      <input type="number" min="0" step="0.01" value={item.qty}
                        onChange={(e) => updateItem(item.id, 'qty', Math.max(0, parseFloat(e.target.value) || 0))} />
                    </div>
                    <div className="col-rate">
                      <input type="number" min="0" step="0.01" value={item.rate}
                        onChange={(e) => updateItem(item.id, 'rate', Math.max(0, parseFloat(e.target.value) || 0))} />
                    </div>
                    <div className="col-total">{fmt(item.qty * item.rate)}</div>
                    <div className="col-actions">
                      <button type="button" className="row-action-btn add" title="Add item below" aria-label="Add item below" onClick={() => addItem(item.id)}>
                        <Plus size={16} />
                      </button>
                      <button type="button" className="row-action-btn delete" title="Remove item" aria-label="Remove item" onClick={() => removeItem(item.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                {doc.items.length === 0 && (
                  <button type="button" className="add-item-btn" onClick={() => addItem(null)}>
                    <Plus size={18} />
                    <span>{t('editor_add_first_item', 'Add First Item')}</span>
                  </button>
                )}
              </div>
            </section>

            <section className="bottom-section">
              <div className="notes-area card">
                <label>{t('editor_notes_terms', 'Notes & Terms')}</label>
                <textarea
                  placeholder={t('editor_notes_placeholder', 'Payment terms, project notes...')}
                  value={doc.notes}
                  onChange={(e) => updateDoc(d => ({...d, notes: e.target.value}))}
                />
              </div>
              <div className="totals-area card">
                <div className="payment-mode-row">
                  <span>{t('editor_payment_mode', 'Payment mode')}</span>
                  <div className="payment-mode-toggle">
                    <button
                      type="button"
                      className={!isCash ? 'active' : ''}
                      onClick={() => isCash && togglePaymentMode()}
                    >{t('editor_standard', 'Standard')}</button>
                    <button
                      type="button"
                      className={isCash ? 'active' : ''}
                      onClick={() => !isCash && togglePaymentMode()}
                    >{t('editor_cash', 'Cash')}</button>
                  </div>
                </div>

                <div className="total-row">
                  <span>{t('editor_subtotal', 'Subtotal')}</span>
                  <span>{fmt(subtotal)}</span>
                </div>
                <div className="total-row discount">
                  <div className="discount-config">
                    <span>{t('editor_discount', 'Discount')}</span>
                    <div className="discount-inputs">
                      <input type="number" min="0" step="0.01" {...(doc.discount_type === '%' ? { max: '100' } : {})} value={doc.discount_value}
                        onChange={(e) => {
                          let v = Math.max(0, parseFloat(e.target.value) || 0);
                          if (doc.discount_type === '%') v = Math.min(100, v);
                          updateDoc(d => ({...d, discount_value: v}));
                        }} />
                      <select value={doc.discount_type}
                        onChange={(e) => updateDoc(d => ({...d, discount_type: e.target.value}))}>
                        <option value="%">%</option>
                        <option value="fixed">{t('editor_fixed', 'Fixed')}</option>
                      </select>
                    </div>
                  </div>
                  <span>-{fmt(discount)}</span>
                </div>

                {!isCash && (
                  <div className="total-row">
                    <div className="tax-config">
                      <span>{t('editor_tax', 'Tax')}</span>
                      <input type="number" min="0" step="0.01" value={doc.tax_rate}
                        onChange={(e) => updateDoc(d => ({...d, tax_rate: Math.max(0, parseFloat(e.target.value) || 0)}))} />
                      <span>%</span>
                    </div>
                    <span>{fmt(tax)}</span>
                  </div>
                )}

                <div className="total-row grand-total">
                  <span>{t('editor_total', 'Total')}</span>
                  <span>{fmt(total)}</span>
                </div>

                {isCash && (
                  <div className="cash-note-badge">
                    {settings?.[`trans_cash_note_${doc.language}`] || 'Cash sale — VAT not applicable'}
                  </div>
                )}
              </div>
            </section>

            {payments.length > 0 && (
              <section className="payments-section card">
                <h3>{t('editor_payments', 'Payments')}</h3>
                <table className="payments-table">
                  <thead>
                    <tr>
                      <th>{t('col_date', 'Date')}</th>
                      <th>{t('col_method', 'Method')}</th>
                      <th>{t('col_reference', 'Reference')}</th>
                      <th>{t('col_amount', 'Amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td>{(p.paid_at || '').split('T')[0]}</td>
                        <td className="payment-method">{p.method || '—'}</td>
                        <td>{p.reference || '—'}</td>
                        <td className="payment-amount">{p.amount.toLocaleString('de-DE', { style: 'currency', currency: p.currency || doc.currency || 'EUR' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </fieldset>
        )}
      </div>
      {pendingCancel && (
        <ConfirmDialog
          title={t('editor_unsaved_title', 'Unsaved changes')}
          message={t('editor_unsaved_body', 'You have unsaved changes. Leave without saving?')}
          confirmLabel={t('editor_leave', 'Leave')}
          onConfirm={() => { setPendingCancel(false); onCancel(); }}
          onCancel={() => setPendingCancel(false)}
        />
      )}
      {transitionError && (
        <ConfirmDialog
          title={t('editor_notice', 'Notice')}
          message={transitionError}
          confirmLabel="OK"
          onConfirm={() => setTransitionError(null)}
          onCancel={() => setTransitionError(null)}
        />
      )}
    </div>
  );
};

export default DocumentEditor;
