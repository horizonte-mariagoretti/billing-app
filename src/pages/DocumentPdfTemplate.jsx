import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

// ── Label dictionaries ────────────────────────────────────────────────────────
const L = {
  en: {
    billTo: 'Bill to',
    description: 'Description',
    qty: 'Qty',
    rate: 'Rate',
    subtotal: 'Subtotal',
    discount: 'Discount',
    tax: 'Tax',
    total: 'Total',
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
    subtotal: 'Zwischensumme',
    discount: 'Rabatt',
    tax: 'MwSt.',
    total: 'Gesamt',
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
    subtotal: 'Sous-total',
    discount: 'Remise',
    tax: 'TVA',
    total: 'Total',
    paymentNote: 'Veuillez virer le montant total sur le compte bancaire suivant :',
    date: 'Date',
    dueDate: "Date d'échéance",
    validUntil: "Valable jusqu'au",
  },
};

const fmt = (value, currency) =>
  Number(value).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    style: 'currency',
    currency: currency || 'EUR',
  });

const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  primary:   '#BB1615',
  border:    '#E2E8F0',
  borderFaint: '#F0F0F0',
  textMain:  '#111111',
  textSec:   '#444444',
  textMuted: '#888888',
  textDark:  '#333333',
  textDim:   '#555555',
  surfaceMuted: '#F8FAFC',
  surfaceFaint: '#FAFAFA',
  success:   '#16A34A',
  white:     '#ffffff',
};

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.textMain,
    paddingTop: '20mm',
    paddingBottom: '20mm',
    paddingLeft: '22mm',
    paddingRight: '22mm',
    flexDirection: 'column',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '10mm',
  },
  sender: { flex: 1, paddingRight: '8mm' },
  senderName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 14,
    color: C.textMain,
    marginBottom: 4,
  },
  senderAddressLine: { fontSize: 9.5, color: C.textSec },
  senderMeta: { fontSize: 9, color: C.textDim, marginTop: 1 },
  docMeta: { alignItems: 'flex-end' },
  docType: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 22,
    color: C.primary,
    textTransform: 'uppercase',
  },
  docNumber: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9.5,
    color: C.textDark,
    marginTop: 3,
    marginBottom: 8,
    textAlign: 'right',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  metaLabel: {
    fontSize: 8.5,
    color: C.textMuted,
    textTransform: 'uppercase',
    marginRight: 8,
  },
  metaValue: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
  },

  // Divider
  rule: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    borderBottomStyle: 'solid',
    marginBottom: '8mm',
  },

  // Client block
  clientBlock: { marginBottom: '8mm' },
  billToLabel: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: C.textMuted,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  clientName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    color: C.textMain,
    marginBottom: 2,
  },
  clientAddressLine: { fontSize: 9.5, color: C.textSec },
  clientVat: { fontSize: 9, color: C.textDim, marginTop: 3 },

  // Subject / title
  subject: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: C.textDark,
    marginBottom: '7mm',
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 10,
    paddingRight: 10,
    backgroundColor: C.surfaceMuted,
    borderLeftWidth: 3,
    borderLeftColor: C.primary,
    borderLeftStyle: 'solid',
  },

  // Line items table
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: C.textMain,
    borderBottomStyle: 'solid',
    paddingBottom: 6,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.borderFaint,
    borderBottomStyle: 'solid',
    paddingTop: 9,
    paddingBottom: 9,
  },
  th: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    color: C.textDark,
  },
  colNum:   { width: '5%' },
  colDesc:  { width: '53%' },
  colQty:   { width: '8%',  textAlign: 'right' },
  colRate:  { width: '17%', textAlign: 'right' },
  colTotal: { width: '17%', textAlign: 'right' },
  numText:   { fontSize: 8.5, color: '#999999' },
  itemName:  { fontFamily: 'Helvetica-Bold', fontSize: 9.5, color: C.textMain },
  itemDesc:  { fontSize: 8.5, color: C.textDim, marginTop: 2 },
  totalText: { fontFamily: 'Helvetica-Bold' },

  // Totals
  totalsWrap: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: '4mm',
  },
  totalsBox: {
    width: '55%',
    borderTopWidth: 1,
    borderTopColor: C.border,
    borderTopStyle: 'solid',
    paddingTop: '4mm',
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 3,
    paddingBottom: 3,
    fontSize: 9.5,
    color: C.textDark,
  },
  discountAmt: { color: C.success },

  // Grand total bar
  totalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.primary,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
    marginTop: '3mm',
    marginBottom: '6mm',
  },
  totalBarText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    color: C.white,
  },

  // Notes
  notes: {
    fontSize: 9.5,
    color: C.textSec,
    marginBottom: '6mm',
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 10,
    paddingRight: 10,
    backgroundColor: C.surfaceFaint,
    borderLeftWidth: 2,
    borderLeftColor: C.border,
    borderLeftStyle: 'solid',
  },

  // Footer
  spacer: { flex: 1 },
  footerRule: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    borderBottomStyle: 'solid',
    marginBottom: '5mm',
  },
  paymentLabel: { fontSize: 9, color: C.textDim, marginBottom: 4 },
  bankRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    fontSize: 9.5,
  },
  bankItem: {
    fontFamily: 'Helvetica-Bold',
    color: C.textMain,
    marginRight: 12,
  },
  footerLegal: {
    marginTop: 8,
    fontSize: 8,
    color: C.textMuted,
    borderTopWidth: 1,
    borderTopColor: C.borderFaint,
    borderTopStyle: 'solid',
    paddingTop: 5,
  },
});

// ── Component ─────────────────────────────────────────────────────────────────
const DocumentPdfTemplate = ({ doc, sender, client }) => {
  const lang    = doc.language || 'en';
  const labels  = L[lang] || L.en;
  const isCash  = doc.payment_mode === 'cash';
  const currency = doc.currency || 'EUR';

  const docTypeLabel =
    doc.type === 'quote'
      ? sender?.[`trans_quote_${lang}`]   || (lang === 'de' ? 'Angebot'  : lang === 'fr' ? 'Devis'   : 'Quote')
      : sender?.[`trans_invoice_${lang}`] || (lang === 'de' ? 'Rechnung' : lang === 'fr' ? 'Facture' : 'Invoice');

  const totalLabel   = sender?.[`trans_total_${lang}`] || labels.total;
  const dueDateLabel = doc.type === 'quote' ? labels.validUntil : labels.dueDate;

  // Calculations
  const subtotal    = (doc.items || []).reduce((sum, item) => sum + item.qty * item.rate, 0);
  const discountAmt = doc.discount_type === '%'
    ? subtotal * ((doc.discount_value || 0) / 100)
    : (doc.discount_value || 0);
  const tax   = isCash ? 0 : (subtotal - discountAmt) * ((doc.tax_rate || 0) / 100);
  const total = subtotal - discountAmt + tax;

  // Address lines
  const senderAddressLines = (sender?.company_address || '').split('\n').filter(Boolean);
  const clientAddressLines = client
    ? [
        client.address_street,
        [client.address_zip, client.address_city].filter(Boolean).join(' '),
        client.address_country,
      ].filter(Boolean)
    : [];

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.sender}>
            <Text style={s.senderName}>{sender?.company_name || ''}</Text>
            {senderAddressLines.map((line, i) => (
              <Text key={i} style={s.senderAddressLine}>{line}</Text>
            ))}
            {sender?.company_vat && (
              <Text style={s.senderMeta}>VAT: {sender.company_vat}</Text>
            )}
            {sender?.company_email && (
              <Text style={s.senderMeta}>{sender.company_email}</Text>
            )}
            {sender?.company_phone && (
              <Text style={s.senderMeta}>{sender.company_phone}</Text>
            )}
          </View>

          <View style={s.docMeta}>
            <Text style={s.docType}>{docTypeLabel}</Text>
            <Text style={s.docNumber}>{doc.number || '—'}</Text>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>{labels.date}</Text>
              <Text style={s.metaValue}>{fmtDate(doc.date)}</Text>
            </View>
            {doc.due_date && (
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>{dueDateLabel}</Text>
                <Text style={s.metaValue}>{fmtDate(doc.due_date)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Divider ── */}
        <View style={s.rule} />

        {/* ── Client block ── */}
        <View style={s.clientBlock}>
          <Text style={s.billToLabel}>{labels.billTo}</Text>
          <Text style={s.clientName}>{client?.name || doc.client_name || '—'}</Text>
          {clientAddressLines.map((line, i) => (
            <Text key={i} style={s.clientAddressLine}>{line}</Text>
          ))}
          {client?.vat_number && (
            <Text style={s.clientVat}>VAT: {client.vat_number}</Text>
          )}
        </View>

        {/* ── Subject ── */}
        {doc.title && (
          <View style={s.subject}>
            <Text>{doc.title}</Text>
          </View>
        )}

        {/* ── Line items table ── */}
        <View style={s.tableHeaderRow}>
          <View style={s.colNum}><Text style={s.th}>#</Text></View>
          <View style={s.colDesc}><Text style={s.th}>{labels.description}</Text></View>
          <View style={s.colQty}><Text style={s.th}>{labels.qty}</Text></View>
          <View style={s.colRate}><Text style={s.th}>{labels.rate}</Text></View>
          <View style={s.colTotal}><Text style={s.th}>{labels.total}</Text></View>
        </View>

        {(doc.items || []).map((item, i) => {
          const itemName = item.name || (item.description || '').split('\n')[0] || '';
          const rawDesc  = item.name
            ? (item.description || '')
            : (item.description || '').split('\n').slice(1).join('\n');
          const descLines = rawDesc.split('\n').filter(l => l.trim());

          return (
            <View key={item.id || i} style={s.tableRow} wrap={false}>
              <View style={s.colNum}>
                <Text style={s.numText}>{i + 1}</Text>
              </View>
              <View style={s.colDesc}>
                <Text style={s.itemName}>{itemName}</Text>
                {descLines.map((line, j) => (
                  <Text key={j} style={s.itemDesc}>
                    {line.trimStart().startsWith('-')
                      ? `• ${line.trimStart().slice(1).trim()}`
                      : line}
                  </Text>
                ))}
              </View>
              <View style={s.colQty}>
                <Text>{String(item.qty)}</Text>
              </View>
              <View style={s.colRate}>
                <Text>{fmt(item.rate, currency)}</Text>
              </View>
              <View style={s.colTotal}>
                <Text style={s.totalText}>{fmt(item.qty * item.rate, currency)}</Text>
              </View>
            </View>
          );
        })}

        {/* ── Totals ── */}
        <View style={s.totalsWrap}>
          <View style={s.totalsBox}>
            <View style={s.totalsRow}>
              <Text>{labels.subtotal}</Text>
              <Text>{fmt(subtotal, currency)}</Text>
            </View>
            {(doc.discount_value || 0) > 0 && (
              <View style={s.totalsRow}>
                <Text>
                  {labels.discount}{doc.discount_type === '%' ? ` (${doc.discount_value}%)` : ''}
                </Text>
                <Text style={s.discountAmt}>−{fmt(discountAmt, currency)}</Text>
              </View>
            )}
            {!isCash && (
              <View style={s.totalsRow}>
                <Text>{labels.tax}{doc.tax_rate ? ` (${doc.tax_rate}%)` : ''}</Text>
                <Text>{fmt(tax, currency)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Grand total bar ── */}
        <View style={s.totalBar}>
          <Text style={s.totalBarText}>{totalLabel.toUpperCase()}</Text>
          <Text style={s.totalBarText}>{fmt(total, currency)}</Text>
        </View>

        {/* ── Notes ── */}
        {doc.notes && (
          <View style={s.notes}>
            <Text>{doc.notes}</Text>
          </View>
        )}

        {/* ── Push footer to bottom ── */}
        <View style={s.spacer} />

        {/* ── Payment footer ── */}
        <View>
          <View style={s.footerRule} />
          <Text style={s.paymentLabel}>{labels.paymentNote}</Text>
          <View style={s.bankRow}>
            {sender?.company_name && (
              <Text style={s.bankItem}>{sender.company_name}</Text>
            )}
            {sender?.company_iban && (
              <Text style={s.bankItem}>IBAN: {sender.company_iban}</Text>
            )}
            {sender?.company_bic && (
              <Text style={s.bankItem}>BIC: {sender.company_bic}</Text>
            )}
          </View>
          {(sender?.company_name || sender?.company_email) && (
            <Text style={s.footerLegal}>
              {[
                sender.company_name,
                sender.company_vat ? `VAT: ${sender.company_vat}` : null,
                sender.company_email,
              ]
                .filter(Boolean)
                .join('  ·  ')}
            </Text>
          )}
        </View>

      </Page>
    </Document>
  );
};

export default DocumentPdfTemplate;
