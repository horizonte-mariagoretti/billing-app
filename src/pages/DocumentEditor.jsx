import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft, ChevronDown, Check, Plus, Trash2, Save, FileText,
  Send, CheckCircle2, XCircle, Unlock, ArrowRightCircle, ThumbsUp, ThumbsDown,
  Download
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

// ── Lightweight custom select ──────────────────────────────────────────────
const StyledSelect = ({ value, onChange, children, placeholder, className = '', disabled = false }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const options = React.Children.toArray(children)
    .filter((c) => c.type === 'option')
    .map((c) => ({ value: c.props.value ?? '', label: c.props.children }));
  const sel = options.find((o) => String(o.value) === String(value));
  const isEmpty = !sel || String(sel.value) === '';
  return (
    <div ref={ref} className={`ss-root${open ? ' ss-open' : ''}${disabled ? ' ss-disabled' : ''}${className ? ' ' + className : ''}`}>
      <button type="button" className="ss-trigger" onClick={() => !disabled && setOpen((v) => !v)} disabled={disabled}>
        <span className={isEmpty ? 'ss-placeholder' : ''}>{sel?.label || placeholder || ''}</span>
        <ChevronDown size={14} className="ss-chevron" />
      </button>
      {open && (
        <ul className="ss-dropdown" role="listbox">
          {options.map((opt) => (
            <li
              key={String(opt.value)}
              role="option"
              aria-selected={String(opt.value) === String(value)}
              className={`ss-option${String(opt.value) === String(value) ? ' ss-option--selected' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); onChange({ target: { value: opt.value } }); setOpen(false); }}
            >
              {opt.label}
              {String(opt.value) === String(value) && <Check size={12} className="ss-check" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const DocumentEditor = ({ type = 'invoice', initialData, onSave, onCancel, onConvertToInvoice }) => {
  const { query } = useDatabase();
  const { transitionDocument, fetchPayments } = useDocuments();
  const { loadSettings, getNextDocumentNumber, incrementDocumentNumber } = useSettings();
  const t = useT();
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [payments, setPayments] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  const [pendingCancel, setPendingCancel] = useState(false);
  const [transitionError, setTransitionError] = useState(null);
  const [previewScale, setPreviewScale] = useState(0.75);
  const prevTaxRateRef = useRef(null);
  const rightBodyRef = useRef(null);

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
      items: [{ id: crypto.randomUUID(), description: '', qty: 1, rate: 0 }],
    };
    if (initialData) {
      return {
        ...defaults,
        ...initialData,
        items:
          initialData.items && initialData.items.length > 0
            ? initialData.items
            : defaults.items,
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

  // Dynamically scale preview to fill the right panel
  useEffect(() => {
    const el = rightBodyRef.current;
    if (!el) return;
    const A4_PX = 794; // 210mm at 96dpi
    const PADDING = 64; // 2 × var(--space-xl) horizontal
    const compute = (width) => {
      const scale = Math.min(1, Math.max(0.3, (width - PADDING) / A4_PX));
      setPreviewScale(parseFloat(scale.toFixed(4)));
    };
    compute(el.clientWidth);
    const obs = new ResizeObserver(([entry]) => compute(entry.contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

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
      setDoc((d) => ({
        ...d,
        number: nextNum,
        tax_rate: (() => {
          const n = parseFloat(s.default_tax_rate);
          return Number.isFinite(n) ? n : 21;
        })(),
        currency: s.default_currency || 'EUR',
      }));
    }
  };

  const handleSaveWithIncrement = async () => {
    await onSave(doc);
    setIsDirty(false);
    if (!initialData?.id) await incrementDocumentNumber(type);
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
      const idx = d.items.findIndex((i) => i.id === afterId);
      return { ...d, items: [...d.items.slice(0, idx + 1), newItem, ...d.items.slice(idx + 1)] };
    });
  };

  const addProductItem = (productId) => {
    const prod = products.find((p) => p.id === productId);
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
      items: [...d.items, { id: crypto.randomUUID(), description: fullDesc, qty: 1, rate: prod.rate || 0 }],
    }));
  };

  const updateItem = (id, field, value) => {
    updateDoc((d) => ({
      ...d,
      items: d.items.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    }));
  };

  const removeItem = (id) => {
    updateDoc((d) => ({ ...d, items: d.items.filter((item) => item.id !== id) }));
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
        const fallback = (() => {
          const n = parseFloat(settings?.default_tax_rate);
          return Number.isFinite(n) ? n : 21;
        })();
        const restored = prevTaxRateRef.current != null ? prevTaxRateRef.current : fallback;
        return { ...d, payment_mode: 'standard', tax_rate: restored };
      }
    });
  };

  const subtotal = doc.items.reduce((sum, item) => sum + item.qty * item.rate, 0);
  const discount =
    doc.discount_type === '%'
      ? subtotal * (doc.discount_value / 100)
      : doc.discount_value;
  const tax = isCash ? 0 : (subtotal - discount) * (doc.tax_rate / 100);
  const total = subtotal - discount + tax;

  const fmt = (v) =>
    v.toLocaleString('de-DE', { style: 'currency', currency: doc.currency || 'EUR' });

  const handleExportPDF = async () => {
    const previewEl = document.querySelector('.pdf-container');
    if (!previewEl) {
      setTransitionError('Preview not found. Please try again.');
      return;
    }
    const filename = `${doc.type}-${doc.number || 'draft'}.pdf`;
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <style>
${previewCss}
      html, body { margin: 0; padding: 0; background: #fff; }
      .pdf-container { padding: 0; background: none; }
      .pdf-page { box-shadow: none; }
    </style>
  </head>
  <body>${previewEl.outerHTML}</body>
</html>`;
    try {
      if (window.electron?.pdf?.generate) {
        await window.electron.pdf.generate({ html, filename });
      } else {
        const printWin = window.open('', '_blank', 'width=900,height=700');
        if (!printWin) {
          setTransitionError('Pop-up blocked. Allow pop-ups for this site, then try again.');
          return;
        }
        printWin.document.open();
        printWin.document.write(html);
        printWin.document.close();
        printWin.addEventListener('load', () => {
          setTimeout(() => { printWin.focus(); printWin.print(); }, 400);
        });
      }
    } catch (err) {
      setTransitionError(`PDF export failed: ${err.message}`);
    }
  };

  const nextStatuses = allowedNextStatuses(doc);

  const lifecycleActions = (() => {
    if (!isPersisted) return null;
    const acts = [];
    if (type === 'invoice') {
      if (nextStatuses.includes('sent') && status === 'draft')
        acts.push(<Button key="send" variant="outline" icon={Send} onClick={() => handleTransition('sent')}>{t('editor_mark_sent', 'Mark as Sent')}</Button>);
      if (status === 'paid')
        acts.push(<Button key="unlock" variant="outline" icon={Unlock} onClick={() => handleTransition('sent')}>{t('editor_unlock_edit', 'Unlock for Edit')}</Button>);
      if (nextStatuses.includes('paid'))
        acts.push(<Button key="paid" variant="primary" icon={CheckCircle2} onClick={() => handleTransition('paid')}>{t('editor_mark_paid', 'Mark as Paid')}</Button>);
      if (nextStatuses.includes('cancelled'))
        acts.push(<Button key="cancel" variant="danger" icon={XCircle} onClick={() => handleTransition('cancelled')}>{t('editor_cancel_invoice', 'Cancel Invoice')}</Button>);
    } else if (type === 'quote') {
      if (nextStatuses.includes('sent'))
        acts.push(<Button key="send" variant="outline" icon={Send} onClick={() => handleTransition('sent')}>{t('editor_mark_sent', 'Mark as Sent')}</Button>);
      if (nextStatuses.includes('accepted'))
        acts.push(<Button key="accept" variant="primary" icon={ThumbsUp} onClick={() => handleTransition('accepted')}>{t('editor_mark_accepted', 'Mark Accepted')}</Button>);
      if (nextStatuses.includes('declined'))
        acts.push(<Button key="decline" variant="danger" icon={ThumbsDown} onClick={() => handleTransition('declined')}>{t('editor_mark_declined', 'Mark Declined')}</Button>);
      if (status === 'accepted')
        acts.push(<Button key="convert" variant="primary" icon={ArrowRightCircle} onClick={handleConvertClick}>{t('editor_convert_to_invoice', 'Convert to Invoice')}</Button>);
    }
    return acts;
  })();

  return (
    <div className="doc-editor">

      {/* ── Top header ── */}
      <header className="doc-editor-header">
        <div className="left">
          <button className="back-btn" aria-label="Go back" onClick={handleCancel}>
            <ChevronLeft size={20} />
          </button>
          <h2>
            {doc.id
              ? t('editor_edit', 'Edit Document')
              : type === 'quote'
                ? t('editor_create_quote', 'New Quote')
                : t('editor_create_invoice', 'New Invoice')}
          </h2>
          {isPersisted && <StatusBadge status={displayStatus} />}
        </div>
        <div className="actions">
          <Button variant="ghost" onClick={handleCancel}>{t('btn_cancel', 'Cancel')}</Button>
          {!isLocked && (
            <Button variant="primary" icon={Save} onClick={handleSaveWithIncrement}>
              {t('editor_save', 'Save Document')}
            </Button>
          )}
        </div>
      </header>

      {/* ── Lifecycle bar ── */}
      {lifecycleActions && lifecycleActions.length > 0 && (
        <div className="lifecycle-bar">{lifecycleActions}</div>
      )}

      {/* ── Split panel ── */}
      <div className="editor-split">

        {/* ── LEFT: form ── */}
        <div className="editor-left">
          <fieldset className="doc-main-form" disabled={isLocked}>
            {isLocked && (
              <div className="locked-banner">
                {t('editor_locked_notice', 'This document is locked. Click "Unlock for Edit" to make changes.')}
              </div>
            )}

            {/* Client */}
            <section className="form-section card">
              <div className="input-col">
                <label>{t('editor_people', 'People')}</label>
                <StyledSelect
                  value={doc.client_id}
                  onChange={(e) => updateDoc((d) => ({ ...d, client_id: e.target.value }))}
                  placeholder={t('editor_select_client', 'Select a client...')}
                >
                  <option value="">{t('editor_select_client', 'Select a client...')}</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </StyledSelect>
              </div>
            </section>

            {/* Document info — Subject + dates + currency + doc number grouped */}
            <section className="form-section card">
              <Input
                label={t('editor_doc_title', 'Subject')}
                placeholder={t('editor_doc_title_placeholder', 'e.g. Website Design Project')}
                value={doc.title}
                onChange={(e) => updateDoc((d) => ({ ...d, title: e.target.value }))}
              />
              <div className="section-grid">
                <Input
                  label={type === 'quote' ? t('editor_valid_until', 'Valid Until') : t('editor_due_date', 'Due Date')}
                  type="date"
                  value={doc.due_date}
                  onChange={(e) => updateDoc((d) => ({ ...d, due_date: e.target.value }))}
                />
                <div className="input-col">
                  <label>{t('editor_currency', 'Currency')}</label>
                  <StyledSelect
                    value={doc.currency}
                    onChange={(e) => updateDoc((d) => ({ ...d, currency: e.target.value }))}
                  >
                    <option value="EUR">EUR — Euro</option>
                    <option value="USD">USD — US Dollar</option>
                    <option value="GBP">GBP — British Pound</option>
                    <option value="CHF">CHF — Swiss Franc</option>
                  </StyledSelect>
                </div>
              </div>
              <div className="section-grid doc-meta-row">
                <Input
                  label={t('editor_doc_number', 'Document Number')}
                  value={doc.number}
                  onChange={(e) => updateDoc((d) => ({ ...d, number: e.target.value }))}
                />
                <Input
                  label={t('editor_field_date', 'Issue Date')}
                  type="date"
                  value={doc.date}
                  onChange={(e) => handleDateChange(e.target.value)}
                />
              </div>
            </section>

            {/* Line items */}
            <section className="items-section card">
              <div className="items-header">
                <h3>{t('editor_line_items', 'Product')}</h3>
                <div className="product-loader">
                  <FileText size={16} />
                  <select onChange={(e) => { addProductItem(e.target.value); e.target.value = ''; }}>
                    <option value="">{t('editor_add_from_products', 'Add from Products...')}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="items-list">
                <div className="items-grid-header">
                  <div className="col-desc">{t('col_description', 'Description')}</div>
                  <div className="col-qty">{t('col_qty', 'Qty')}</div>
                  <div className="col-rate">{t('col_rate', 'Rate')}</div>
                  <div className="col-total">{t('col_total', 'Total')}</div>
                  <div className="col-actions" />
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
                      <input
                        type="number" min="0" step="0.01" value={item.qty}
                        onChange={(e) => updateItem(item.id, 'qty', Math.max(0, parseFloat(e.target.value) || 0))}
                      />
                    </div>
                    <div className="col-rate">
                      <input
                        type="number" min="0" step="0.01" value={item.rate}
                        onChange={(e) => updateItem(item.id, 'rate', Math.max(0, parseFloat(e.target.value) || 0))}
                      />
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
              <button type="button" className="add-line-btn" onClick={() => addItem(null)}>
                <Plus size={14} />
                {t('editor_add_line', 'Add New Line')}
              </button>
            </section>

            {/* Notes */}
            <section className="form-section card">
              <div className="notes-area">
                <label>{t('editor_notes_terms', 'Notes & Terms')}</label>
                <textarea
                  placeholder={t('editor_notes_placeholder', 'Payment terms, project notes...')}
                  value={doc.notes}
                  rows={2}
                  onChange={(e) => {
                    updateDoc((d) => ({ ...d, notes: e.target.value }));
                    // auto-expand height
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                  onFocus={(e) => {
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                />
              </div>
            </section>

            {/* Payment mode + totals */}
            <section className="form-section card">
              <div className="totals-area">
                <div className="payment-mode-row">
                  <span>{t('editor_payment_mode', 'Payment mode')}</span>
                  <div className="payment-mode-toggle">
                    <button type="button" className={!isCash ? 'active' : ''} onClick={() => isCash && togglePaymentMode()}>
                      {t('editor_standard', 'Standard')}
                    </button>
                    <button type="button" className={isCash ? 'active' : ''} onClick={() => !isCash && togglePaymentMode()}>
                      {t('editor_cash', 'Cash')}
                    </button>
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
                      <input
                        type="number" min="0" step="0.01"
                        {...(doc.discount_type === '%' ? { max: '100' } : {})}
                        value={doc.discount_value}
                        onChange={(e) => {
                          let v = Math.max(0, parseFloat(e.target.value) || 0);
                          if (doc.discount_type === '%') v = Math.min(100, v);
                          updateDoc((d) => ({ ...d, discount_value: v }));
                        }}
                      />
                      <select
                        value={doc.discount_type}
                        onChange={(e) => updateDoc((d) => ({ ...d, discount_type: e.target.value }))}
                      >
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
                      <input
                        type="number" min="0" step="0.01" value={doc.tax_rate}
                        onChange={(e) => updateDoc((d) => ({ ...d, tax_rate: Math.max(0, parseFloat(e.target.value) || 0) }))}
                      />
                      <span>%</span>
                    </div>
                    <span>{fmt(tax)}</span>
                  </div>
                )}

                <div className="total-row grand-total">
                  <span>{t('editor_total', 'Total')}</span>
                  <span>{fmt(total)}</span>
                </div>

                {/* cash note shown in preview only — no duplicate badge here */}
              </div>
            </section>

            {/* Payments (paid invoices) */}
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
                        <td className="payment-amount">
                          {p.amount.toLocaleString('de-DE', { style: 'currency', currency: p.currency || doc.currency || 'EUR' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </fieldset>
        </div>

        {/* ── RIGHT: live preview ── */}
        <div className="editor-right">
          <div className="editor-right-header">
            <span className="editor-right-title">{t('editor_preview', 'Preview')}</span>
            <div className="editor-right-actions">
              <div className="lang-switcher">
                <button className={doc.language === 'en' ? 'active' : ''} onClick={() => updateDoc((d) => ({ ...d, language: 'en' }))}>EN</button>
                <button className={doc.language === 'de' ? 'active' : ''} onClick={() => updateDoc((d) => ({ ...d, language: 'de' }))}>DE</button>
                <button className={doc.language === 'fr' ? 'active' : ''} onClick={() => updateDoc((d) => ({ ...d, language: 'fr' }))}>FR</button>
              </div>
              <Button variant="outline" size="sm" icon={Download} onClick={handleExportPDF}>
                {t('editor_export_pdf', 'PDF')}
              </Button>
            </div>
          </div>
          <div className="editor-right-body" ref={rightBodyRef}>
            <div
              className="preview-scale-wrap"
              style={{
                transform: `scale(${previewScale})`,
                marginBottom: `calc((${previewScale} - 1) * 297mm)`,
              }}
            >
              <DocumentPreview
                doc={doc}
                sender={settings}
                client={clients.find((c) => c.id === doc.client_id) || null}
              />
            </div>
          </div>
        </div>

      </div>{/* end editor-split */}

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
