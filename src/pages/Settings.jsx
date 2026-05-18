import React, { useState, useEffect } from 'react';
import useSettings from '../hooks/useSettings';
import { useT, getUiLang, setUiLang } from '../hooks/useUiTranslations';
import Button from '../components/Button';
import Input from '../components/Input';
import { Save, Building2, CreditCard, FileText, RefreshCw, Languages, Trash2, Plus, AlertTriangle, GripVertical } from 'lucide-react';
import './Settings.css';

// TABS are built inside Settings component to use t()

const DATE_FORMATS = [
  { value: 'YYYYMMDD', label: 'YYYYMMDD' },
  { value: 'YYMMDD', label: 'YYMMDD' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
  { value: 'YYYY', label: 'YYYY' },
];

// SEQUENCE_FORMATS labels are rendered inline in Settings component with t()

const NumberingEditor = ({ title, patternStr, nextNumber, onChange, onNextNumberChange, t }) => {
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  let pattern = [];
  try { pattern = JSON.parse(patternStr); } catch (e) { pattern = []; }

  const addRow = (afterId = null) => {
    const newSegment = { id: crypto.randomUUID(), type: 'text', value: '' };
    let newPattern;
    if (afterId == null) {
      newPattern = [...pattern, newSegment];
    } else {
      const idx = pattern.findIndex(p => p.id === afterId);
      newPattern = [...pattern.slice(0, idx + 1), newSegment, ...pattern.slice(idx + 1)];
    }
    onChange(JSON.stringify(newPattern));
  };

  const removeRow = (id) => {
    onChange(JSON.stringify(pattern.filter(p => p.id !== id)));
  };

  const updateRow = (id, updates) => {
    onChange(JSON.stringify(pattern.map(p => p.id === id ? { ...p, ...updates } : p)));
  };

  const handleDragStart = (e, idx) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(idx);
  };

  const handleDrop = (e, idx) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return; }
    const newPattern = [...pattern];
    const [removed] = newPattern.splice(dragIdx, 1);
    newPattern.splice(idx, 0, removed);
    onChange(JSON.stringify(newPattern));
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

  const renderPreview = () => {
    let result = '';
    const today = new Date();
    pattern.forEach(segment => {
      if (segment.type === 'text') result += segment.value || '';
      else if (segment.type === 'date') {
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        if (segment.format === 'YYYYMMDD') result += `${year}${month}${day}`;
        else if (segment.format === 'YYMMDD') result += `${String(year).slice(2)}${month}${day}`;
        else if (segment.format === 'YYYY-MM-DD') result += `${year}-${month}-${day}`;
        else if (segment.format === 'YYYY') result += `${year}`;
      } else if (segment.type === 'sequence') {
        const padding = segment.format === 'Four Digits' ? 4 :
          segment.format === 'Three Digits' ? 3 :
            segment.format === 'Two Digits' ? 2 : 1;
        result += String(nextNumber || 1).padStart(padding, '0');
      }
    });
    return result || (t ? t('settings_seg_empty', '(Empty Pattern)') : '(Empty Pattern)');
  };

  return (
    <div className="numbering-editor">
      <div className="editor-header">
        <h3>{title}</h3>
        <div className="preview-badge">
          <span>{t ? t('settings_seg_live_preview', 'Live Preview') : 'Live Preview'}</span>
          <strong>{renderPreview()}</strong>
        </div>
      </div>

      <div className="pattern-rows">
        {pattern.map((row, idx) => (
          <div
            key={row.id}
            className={`pattern-row${dragIdx === idx ? ' dragging' : ''}${dragOverIdx === idx && dragIdx !== idx ? ' drag-over' : ''}`}
            draggable
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={(e) => handleDrop(e, idx)}
            onDragEnd={handleDragEnd}
          >
            <div className="drag-handle" title="Drag to reorder">
              <GripVertical size={16} />
            </div>

            <select
              className="type-select"
              value={row.type}
              onChange={(e) => updateRow(row.id, {
                type: e.target.value,
                value: e.target.value === 'date' ? 'today' : (e.target.value === 'sequence' ? '1' : ''),
                format: e.target.value === 'date' ? 'YYYYMMDD' : (e.target.value === 'sequence' ? 'Four Digits' : undefined)
              })}
            >
              <option value="text">{t ? t('settings_seg_static', 'Static Text') : 'Static Text'}</option>
              <option value="date">{t ? t('settings_seg_date', 'Date Component') : 'Date Component'}</option>
              <option value="sequence">{t ? t('settings_seg_counter', 'Counter') : 'Counter'}</option>
            </select>

            {row.type === 'text' && (
              <input
                type="text"
                className="value-input value-span"
                placeholder={t ? t('settings_seg_text_placeholder', 'Enter text (e.g. INV_)') : 'Enter text (e.g. INV_)'}
                value={row.value}
                onChange={(e) => updateRow(row.id, { value: e.target.value })}
              />
            )}

            {row.type === 'date' && (
              <>
                <select className="sub-select" value={row.value} onChange={(e) => updateRow(row.id, { value: e.target.value })}>
                  <option value="today">{t ? t('settings_seg_today', "Today's Date") : "Today's Date"}</option>
                  <option value="created">{t ? t('settings_seg_creation', 'Creation Date') : 'Creation Date'}</option>
                </select>
                <select className="format-select" value={row.format} onChange={(e) => updateRow(row.id, { format: e.target.value })}>
                  {DATE_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </>
            )}

            {row.type === 'sequence' && (
              <>
                <input
                  type="number"
                  className="value-input mini"
                  min="1"
                  value={nextNumber}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    onNextNumberChange(Number.isFinite(n) && n >= 1 ? String(n) : '1');
                  }}
                  placeholder="1"
                />
                <select className="format-select" value={row.format} onChange={(e) => updateRow(row.id, { format: e.target.value })}>
                  <option value="Four Digits">{t ? t('settings_seg_four_digits', 'Four Digits (0001)') : 'Four Digits (0001)'}</option>
                  <option value="Three Digits">{t ? t('settings_seg_three_digits', 'Three Digits (001)') : 'Three Digits (001)'}</option>
                  <option value="Two Digits">{t ? t('settings_seg_two_digits', 'Two Digits (01)') : 'Two Digits (01)'}</option>
                  <option value="No Padding">{t ? t('settings_seg_no_padding', 'No Padding (1)') : 'No Padding (1)'}</option>
                </select>
              </>
            )}

            <div className="row-actions">
              <button className="row-btn add" title={t ? t('settings_seg_add', 'Add segment below') : 'Add segment below'} onClick={() => addRow(row.id)}><Plus size={16} /></button>
              <button className="row-btn delete" title={t ? t('settings_seg_remove', 'Remove segment') : 'Remove segment'} onClick={() => removeRow(row.id)}><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
        {pattern.length === 0 && (
          <button className="add-first-btn" onClick={() => addRow(null)}>
            <Plus size={20} /> {t ? t('settings_seg_build', 'Build your document numbering pattern') : 'Build your document numbering pattern'}
          </button>
        )}
      </div>
    </div>
  );
};

const Settings = () => {
  const { loadSettings, saveSettings } = useSettings();
  const t = useT();
  const [activeTab, setActiveTab] = useState('company');
  const [currentUiLang, setCurrentUiLang] = useState(getUiLang());

  const handleUiLangChange = (lang) => {
    setCurrentUiLang(lang);
    setUiLang(lang); // reloads page
  };

  const TABS = [
    { id: 'company', label: t('settings_tab_company', 'Company Info'), icon: Building2 },
    { id: 'billing', label: t('settings_tab_billing', 'Billing'), icon: CreditCard },
    { id: 'numbering', label: t('settings_tab_numbering', 'Numbering'), icon: FileText },
    { id: 'translations', label: t('settings_tab_translations', 'Translations'), icon: Languages },
  ];
  const [saved, setSaved] = useState(false);
  const [savedForm, setSavedForm] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [form, setForm] = useState({
    company_name: '',
    company_address: '',
    company_email: '',
    company_phone: '',
    company_vat: '',
    company_iban: '',
    company_bic: '',
    default_currency: 'EUR',
    default_tax_rate: '21',
    invoice_next_number: '1',
    quote_next_number: '1',
    invoice_pattern: '[]',
    quote_pattern: '[]',
    // Translations
    trans_invoice_en: 'Invoice',
    trans_invoice_de: 'Rechnung',
    trans_invoice_fr: 'Facture',
    trans_quote_en: 'Quote',
    trans_quote_de: 'Angebot',
    trans_quote_fr: 'Devis',
    trans_date_en: 'Date',
    trans_date_de: 'Datum',
    trans_date_fr: 'Date',
    trans_due_date_en: 'Due Date',
    trans_due_date_de: 'Fälligkeitsdatum',
    trans_due_date_fr: 'Date d\'échéance',
    trans_total_en: 'Total',
    trans_total_de: 'Gesamt',
    trans_total_fr: 'Total',
  });

  useEffect(() => {
    loadSettings().then(s => { setForm(s); setSavedForm(s); });
  }, []);

  const handleSave = async () => {
    setSaveError(null);
    const validatePattern = (str) => {
      try {
        const arr = JSON.parse(str);
        return Array.isArray(arr) && arr.length > 0;
      } catch (e) {
        return false;
      }
    };
    if (!validatePattern(form.invoice_pattern) || !validatePattern(form.quote_pattern)) {
      setSaveError(t('settings_error_empty_pattern', 'Invoice/Quote numbering pattern cannot be empty.'));
      return;
    }
    try {
      await saveSettings(form);
      setSavedForm({ ...form });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveError(`${t('settings_error_save', 'Failed to save settings')}: ${err.message}`);
    }
  };

  const isDirty = savedForm !== null && JSON.stringify(form) !== JSON.stringify(savedForm);

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));
  const setDirect = (key, value) => setForm(f => ({ ...f, [key]: value }));

  return (
    <div className="settings-page">
      <div className="settings-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="settings-body card">
        {activeTab === 'company' && (
          <div className="settings-section">
            <div className="section-title">
              <h2>{t('settings_company_title', 'Company Identity')}</h2>
              <p>{t('settings_company_desc', 'Configure how your business is presented on all generated documents.')}</p>
            </div>
            <div className="settings-grid">
              <div>
                <label className="input-label">{t('settings_field_legal_name', 'Legal Name')}</label>
                <input className="input-field" value={form.company_name} onChange={set('company_name')} placeholder="e.g. Michel Munhoven Design" />
              </div>
              <div>
                <label className="input-label">{t('settings_field_email', 'Email for Inquiries')}</label>
                <input className="input-field" type="email" value={form.company_email} onChange={set('company_email')} placeholder="your@email.com" />
              </div>
              <div>
                <label className="input-label">{t('settings_field_phone', 'Contact Number')}</label>
                <input className="input-field" value={form.company_phone} onChange={set('company_phone')} placeholder="+32 ..." />
              </div>
              <div>
                <label className="input-label">{t('settings_field_vat_id', 'VAT ID')}</label>
                <input className="input-field" value={form.company_vat} onChange={set('company_vat')} placeholder="BE0000.000.000" />
              </div>
            </div>
            <div className="settings-full">
              <label className="input-label">{t('settings_field_address', 'Official Registered Address')}</label>
              <textarea
                className="settings-textarea"
                value={form.company_address}
                onChange={set('company_address')}
                placeholder="Street and number&#10;City, Postal Code&#10;Country"
              />
            </div>

            <div className="settings-divider" />
            <div className="section-title">
              <h2>{t('settings_ui_lang_title', 'App Language')}</h2>
              <p>{t('settings_ui_lang_desc', 'Controls the language of the app interface. Changes take effect immediately.')}</p>
            </div>
            <div className="lang-toggle-row">
              {[
                { code: 'de', label: 'Deutsch' },
                { code: 'fr', label: 'Français' },
                { code: 'en', label: 'English' },
              ].map(({ code, label }) => (
                <button
                  key={code}
                  className={`lang-toggle-btn${currentUiLang === code ? ' active' : ''}`}
                  onClick={() => handleUiLangChange(code)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'billing' && (
          <div className="settings-section">
            <div className="section-title">
              <h2>{t('settings_billing_title', 'Financial Defaults')}</h2>
              <p>{t('settings_billing_desc', 'Set default currencies and tax rates to streamline your document creation process.')}</p>
            </div>
            <div className="settings-grid">
              <div>
                <label className="input-label">{t('settings_field_currency', 'Primary Currency')}</label>
                <select className="input-field" value={form.default_currency} onChange={set('default_currency')}>
                  <option value="EUR">EUR — Euro (€)</option>
                  <option value="USD">USD — US Dollar ($)</option>
                  <option value="GBP">GBP — British Pound (£)</option>
                  <option value="CHF">CHF — Swiss Franc</option>
                </select>
              </div>
              <div>
                <label className="input-label">{t('settings_field_tax_rate', 'Standard Tax Rate (%)')}</label>
                <input type="number" className="input-field" value={form.default_tax_rate} onChange={set('default_tax_rate')} />
              </div>
            </div>
            <div className="settings-divider" />
            <div className="section-title">
              <h2>{t('settings_payment_title', 'Payment Settlement')}</h2>
              <p>{t('settings_payment_desc', 'These bank details will be included in the footer of your PDFs for easy payments.')}</p>
            </div>
            <div className="settings-grid">
              <div>
                <label className="input-label">{t('settings_field_iban', 'IBAN')}</label>
                <input className="input-field" value={form.company_iban} onChange={set('company_iban')} placeholder="BE00 0000 0000 0000" />
              </div>
              <div>
                <label className="input-label">{t('settings_field_bic', 'BIC / SWIFT')}</label>
                <input className="input-field" value={form.company_bic} onChange={set('company_bic')} placeholder="GEBABEBB" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'numbering' && (
          <div className="settings-section">
            <div className="section-title">
              <h2>{t('settings_numbering_title', 'Smart Document Numbering')}</h2>
              <p>{t('settings_numbering_desc', 'Define automated rules for naming your documents. Mix text, dates, and counters.')}</p>
            </div>

            {isDirty && (
              <div className="unsaved-warning">
                <AlertTriangle size={20} />
                <span>{t('settings_unsaved', 'Unsaved changes detected. Remember to save your new configuration.')}</span>
              </div>
            )}

            <NumberingEditor
              title={t('settings_invoice_numbering', 'Invoice Numbering')}
              patternStr={form.invoice_pattern}
              nextNumber={form.invoice_next_number}
              onChange={(val) => setDirect('invoice_pattern', val)}
              onNextNumberChange={(val) => setDirect('invoice_next_number', val)}
              t={t}
            />

            <div className="settings-divider" />

            <NumberingEditor
              title={t('settings_quote_numbering', 'Quote Numbering')}
              patternStr={form.quote_pattern}
              nextNumber={form.quote_next_number}
              onChange={(val) => setDirect('quote_pattern', val)}
              onNextNumberChange={(val) => setDirect('quote_next_number', val)}
              t={t}
            />
          </div>
        )}

        {activeTab === 'translations' && (
          <div className="settings-section">
            <div className="section-title">
              <h2>{t('settings_pdf_title', 'PDF Localization')}</h2>
              <p>{t('settings_pdf_desc', 'Customise how your PDF labels appear in different languages.')}</p>
            </div>

            <div className="translation-table">
              <div className="translation-table-inner">
                <div className="table-header">
                  <div className="col-key">{t('settings_doc_label', 'Document Label')}</div>
                  <div className="col-lang">{t('settings_lang_en', 'English (EN)')}</div>
                  <div className="col-lang">{t('settings_lang_de', 'Deutsch (DE)')}</div>
                  <div className="col-lang">{t('settings_lang_fr', 'Français (FR)')}</div>
                </div>

                {[
                  { id: 'invoice', label: 'Invoice' },
                  { id: 'quote', label: 'Quote' },
                  { id: 'date', label: 'Date' },
                  { id: 'due_date', label: 'Due Date' },
                  { id: 'total', label: 'Total' },
                  { id: 'cash_note', label: 'Cash sale note' },
                ].map(item => (
                  <div key={item.id} className="table-row">
                    <div className="col-key">{item.label}</div>
                    <div className="col-lang"><input value={form[`trans_${item.id}_en`]} onChange={set(`trans_${item.id}_en`)} /></div>
                    <div className="col-lang"><input value={form[`trans_${item.id}_de`]} onChange={set(`trans_${item.id}_de`)} /></div>
                    <div className="col-lang"><input value={form[`trans_${item.id}_fr`]} onChange={set(`trans_${item.id}_fr`)} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="settings-footer">
          {saveError && <div className="page-error" role="alert" style={{ color: '#dc2626', marginBottom: 'var(--space-sm)' }}>{saveError}</div>}
          <Button variant="primary" icon={saved ? RefreshCw : Save} onClick={handleSave}>
            {saved ? t('settings_saved', 'Saved!') : t('settings_save', 'Save Settings')}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
