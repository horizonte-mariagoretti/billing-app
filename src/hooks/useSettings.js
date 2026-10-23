import { useState, useCallback } from 'react';
import useDatabase from './useDatabase';

const defaultSettings = {
  company_name: '',
  company_address: '',
  company_email: '',
  company_phone: '',
  company_vat: '',
  company_iban: '',
  company_bic: '',
  default_currency: 'EUR',
  default_tax_rate: '21',
  camp_base_contribution: '0',
  camp_min_contribution: '0',
  camp_reduction_per_percent: '',
  lasagna_price: '0',
  lasagna_discount_from: '',
  lasagna_discount_price: '',
  lasagna_bonus_enabled: '0',
  lasagna_bonus_factor: '100',
  invoice_prefix: 'INV',
  invoice_next_number: '1',
  quote_prefix: 'QTE',
  quote_next_number: '1',
  numbering_separator: '-',
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
  trans_cash_note_en: 'Cash sale — VAT not applicable',
  trans_cash_note_de: 'Barzahlung — keine Mehrwertsteuer',
  trans_cash_note_fr: 'Vente au comptant — TVA non applicable',
  invoice_pattern: JSON.stringify([
    { id: '1', type: 'text', value: 'INV_' },
    { id: '2', type: 'date', value: 'today', format: 'YYYYMMDD' },
    { id: '3', type: 'text', value: '_' },
    { id: '4', type: 'sequence', value: '1', format: 'Four Digits' }
  ]),
  quote_pattern: JSON.stringify([
    { id: '1', type: 'text', value: 'QTE_' },
    { id: '2', type: 'date', value: 'today', format: 'YYYYMMDD' },
    { id: '3', type: 'text', value: '_' },
    { id: '4', type: 'sequence', value: '1', format: 'Four Digits' }
  ]),
};

const useSettings = () => {
  const { query, run, transaction } = useDatabase();

  const loadSettings = useCallback(async () => {
    const rows = await query('SELECT key, value FROM settings');
    const loaded = { ...defaultSettings };
    rows.forEach(({ key, value }) => {
      loaded[key] = value;
    });
    return loaded;
  }, [query]);

  const saveSettings = useCallback(async (settings) => {
    const operations = Object.entries(settings).map(([key, value]) => ({
      sql: 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      params: [key, String(value)],
    }));
    await transaction(operations);
  }, [transaction]);

  const getNextDocumentNumber = useCallback(async (type) => {
    const numberKey = type === 'invoice' ? 'invoice_next_number' : 'quote_next_number';
    const patternKey = type === 'invoice' ? 'invoice_pattern' : 'quote_pattern';

    const rows = await query('SELECT key, value FROM settings WHERE key IN (?, ?)', [patternKey, numberKey]);
    const settingsMap = {};
    rows.forEach(r => { settingsMap[r.key] = r.value; });

    const patternStr = settingsMap[patternKey] || defaultSettings[patternKey];
    const nextNum = parseInt(settingsMap[numberKey] || '1', 10);
    
    let pattern = [];
    try {
      pattern = JSON.parse(patternStr);
    } catch (e) {
      console.error('Failed to parse numbering pattern', e);
      throw new Error(`Corrupt ${type} numbering pattern. Please reset it in Settings → Numbering.`);
    }

    let result = '';
    const today = new Date();

    pattern.forEach(segment => {
      if (segment.type === 'text') {
        result += segment.value;
      } else if (segment.type === 'date') {
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
        result += String(nextNum).padStart(padding, '0');
      }
    });

    return result;
  }, [query]);

  const incrementDocumentNumber = useCallback(async (type) => {
    const key = type === 'invoice' ? 'invoice_next_number' : 'quote_next_number';
    // Single atomic statement: if the key doesn't exist yet, insert '2' (first increment of default 1);
    // if it does, increment in place. No read-modify-write race.
    await run(
      `INSERT INTO settings (key, value) VALUES (?, '2')
       ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`,
      [key]
    );
  }, [run]);

  return { loadSettings, saveSettings, getNextDocumentNumber, incrementDocumentNumber };
};

export default useSettings;
