// Shared calc + label logic for the live HTML preview (DocumentPreview.jsx) and
// the PDF export template (DocumentPdfTemplate.jsx). Single source of truth so
// the two renderers can't drift — a doc's print PDF must match what the user
// saw in the preview pane.

export const DOC_LABELS = {
  en: {
    billTo: 'Bill to',
    description: 'Description',
    qty: 'Qty',
    rate: 'Rate',
    total: 'Total',
    duration: 'Duration (h)',
    subtotal: 'Subtotal',
    discount: 'Discount',
    tax: 'Tax',
    paymentNote: 'Please transfer the total amount to the following bank account:',
    date: 'Date',
    dueDate: 'Due Date',
    validUntil: 'Valid Until',
  },
  de: {
    billTo: 'Rechnungsempfänger',
    description: 'Beschreibung',
    qty: 'Menge',
    rate: 'Einzelpreis',
    total: 'Gesamt',
    duration: 'Dauer (h)',
    subtotal: 'Zwischensumme',
    discount: 'Rabatt',
    tax: 'MwSt.',
    paymentNote: 'Gesamtbetrag bitte auf folgendes Konto überweisen:',
    date: 'Datum',
    dueDate: 'Fälligkeitsdatum',
    validUntil: 'Gültig bis',
  },
  fr: {
    billTo: 'Facturer à',
    description: 'Description',
    qty: 'Qté',
    rate: 'Prix unit.',
    total: 'Total',
    duration: 'Durée (h)',
    subtotal: 'Sous-total',
    discount: 'Remise',
    tax: 'TVA',
    paymentNote: 'Veuillez virer le montant total sur le compte bancaire suivant :',
    date: 'Date',
    dueDate: "Date d'échéance",
    validUntil: "Valable jusqu'au",
  },
};

export const getDocLabels = (lang) => DOC_LABELS[lang] || DOC_LABELS.en;

export const DEFAULT_VISIBLE_COLUMNS = { qty: true, duration: true, rate: true, total: true };

// doc.visible_columns comes back as a JSON string from sqlite, or a plain
// object when it's still in-memory editor state — normalize both.
export const getVisibleColumns = (doc) => {
  if (!doc?.visible_columns) return { ...DEFAULT_VISIBLE_COLUMNS };
  const vc = typeof doc.visible_columns === 'string'
    ? JSON.parse(doc.visible_columns)
    : doc.visible_columns;
  return { ...DEFAULT_VISIBLE_COLUMNS, ...vc };
};

// True when a client reading the PDF would see no per-line pricing at all —
// only description + duration, with just the grand total bar at the bottom.
export const isPricingHidden = (visibleColumns) =>
  visibleColumns.qty === false && visibleColumns.rate === false && visibleColumns.total === false;

export const fmtCurrency = (value, currency) =>
  Number(value || 0).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    style: 'currency',
    currency: currency || 'EUR',
  });

// Plain quantity numbers (qty, duration) — same de-DE decimal-comma
// convention as the currency figures, but no currency symbol/padding.
// A qty of 1.5h must render "1,5", not the JS-default "1.5".
export const fmtNum = (value) => Number(value || 0).toLocaleString('de-DE');

export const fmtDocDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};

export const calcDocTotals = (doc) => {
  const isCash = doc.payment_mode === 'cash';
  const subtotal = (doc.items || []).reduce(
    (sum, item) => sum + item.qty * item.rate * (item.duration ?? 1),
    0
  );
  const discountAmt = doc.discount_type === '%'
    ? subtotal * ((doc.discount_value || 0) / 100)
    : (doc.discount_value || 0);
  const tax = isCash ? 0 : (subtotal - discountAmt) * ((doc.tax_rate || 0) / 100);
  const total = subtotal - discountAmt + tax;
  return { subtotal, discountAmt, tax, total, isCash };
};

export const getDocTypeLabel = (doc, sender, lang) => {
  const de = lang === 'de';
  const fr = lang === 'fr';
  return doc.type === 'quote'
    ? sender?.[`trans_quote_${lang}`] || (de ? 'Angebot' : fr ? 'Devis' : 'Quote')
    : sender?.[`trans_invoice_${lang}`] || (de ? 'Rechnung' : fr ? 'Facture' : 'Invoice');
};

export const getClientAddressLines = (client) =>
  client
    ? [
        client.address_street,
        [client.address_zip, client.address_city].filter(Boolean).join(' '),
        client.address_country,
      ].filter(Boolean)
    : [];

// Legacy items stored the item name as the first line of `description`
// (before the dedicated `name` field existed). Split it back out so old
// and new items render the same way.
export const splitItemNameDesc = (item) => {
  const itemName = item.name || (item.description || '').split('\n')[0] || '';
  const rawDesc = item.name
    ? (item.description || '')
    : (item.description || '').split('\n').slice(1).join('\n');
  const descLines = rawDesc.split('\n').filter((l) => l.trim());
  return { itemName, descLines };
};

export const getItemLineTotal = (item) => item.qty * item.rate * (item.duration ?? 1);
