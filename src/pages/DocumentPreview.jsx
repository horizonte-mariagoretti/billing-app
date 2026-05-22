import React from 'react';
import './DocumentPreview.css';

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
    dueDate: 'Date d\'échéance',
    validUntil: 'Valable jusqu\'au',
  },
};

const fmt = (value, currency) =>
  value.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    style: 'currency',
    currency: currency || 'EUR',
  });

const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};

const DocumentPreview = ({ doc, sender, client }) => {
  if (!doc) return null;

  const lang = doc.language || 'en';
  const labels = L[lang] || L.en;

  const docTypeLabel =
    doc.type === 'quote'
      ? sender?.[`trans_quote_${lang}`] || (lang === 'de' ? 'Angebot' : lang === 'fr' ? 'Devis' : 'Quote')
      : sender?.[`trans_invoice_${lang}`] || (lang === 'de' ? 'Rechnung' : lang === 'fr' ? 'Facture' : 'Invoice');

  const totalLabel = sender?.[`trans_total_${lang}`] || labels.total;

  const isCash = doc.payment_mode === 'cash';
  const currency = doc.currency || 'EUR';

  const subtotal = (doc.items || []).reduce((sum, item) => sum + (item.qty * item.rate), 0);
  const discountAmt = doc.discount_type === '%'
    ? subtotal * ((doc.discount_value || 0) / 100)
    : (doc.discount_value || 0);
  const tax = isCash ? 0 : (subtotal - discountAmt) * ((doc.tax_rate || 0) / 100);
  const total = subtotal - discountAmt + tax;

  const senderAddress = sender?.company_address || '';
  const clientAddress = client
    ? [
        client.address_street,
        [client.address_zip, client.address_city].filter(Boolean).join(' '),
        client.address_country,
      ].filter(Boolean).join('\n')
    : '';

  const dueDateLabel = doc.type === 'quote' ? labels.validUntil : labels.dueDate;

  return (
    <div className="pdf-container">
      <div className="pdf-page">

        {/* ── Header: sender left, doc meta right ── */}
        <header className="pdf-header">
          <div className="pdf-sender">
            <div className="pdf-sender-name">{sender?.company_name || ''}</div>
            {senderAddress && (
              <div className="pdf-sender-address">{senderAddress}</div>
            )}
            {sender?.company_vat && (
              <div className="pdf-sender-meta">VAT: {sender.company_vat}</div>
            )}
            {sender?.company_email && (
              <div className="pdf-sender-meta">{sender.company_email}</div>
            )}
            {sender?.company_phone && (
              <div className="pdf-sender-meta">{sender.company_phone}</div>
            )}
          </div>

          <div className="pdf-doc-meta">
            <div className="pdf-doc-type">{docTypeLabel}</div>
            <div className="pdf-doc-number">{doc.number || '—'}</div>
            <table className="pdf-meta-table">
              <tbody>
                <tr>
                  <td className="pdf-meta-label">{labels.date}</td>
                  <td className="pdf-meta-value">{fmtDate(doc.date)}</td>
                </tr>
                {doc.due_date && (
                  <tr>
                    <td className="pdf-meta-label">{dueDateLabel}</td>
                    <td className="pdf-meta-value">{fmtDate(doc.due_date)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </header>

        {/* ── Divider ── */}
        <div className="pdf-rule" />

        {/* ── Client block ── */}
        <section className="pdf-client-block">
          <div className="pdf-bill-to-label">{labels.billTo}</div>
          <div className="pdf-client-name">{client?.name || doc.client_name || '—'}</div>
          {clientAddress && (
            <div className="pdf-client-address">{clientAddress}</div>
          )}
          {client?.vat_number && (
            <div className="pdf-client-vat">VAT: {client.vat_number}</div>
          )}
        </section>

        {/* ── Subject / title ── */}
        {doc.title && (
          <div className="pdf-subject">{doc.title}</div>
        )}

        {/* ── Line items table ── */}
        <table className="pdf-table">
          <thead>
            <tr>
              <th className="col-num">#</th>
              <th className="col-desc">{labels.description}</th>
              <th className="col-qty">{labels.qty}</th>
              <th className="col-rate">{labels.rate}</th>
              <th className="col-total">{labels.total}</th>
            </tr>
          </thead>
          <tbody>
            {(doc.items || []).map((item, i) => {
              const itemName = item.name || (item.description || '').split('\n')[0] || '';
              const rawDesc = item.name
                ? (item.description || '')
                : (item.description || '').split('\n').slice(1).join('\n');
              const descLines = rawDesc.split('\n').filter(l => l.trim());
              return (
                <tr key={i}>
                  <td className="col-num">{i + 1}</td>
                  <td className="col-desc">
                    <span className="item-headline">{itemName}</span>
                    {descLines.length > 0 && (
                      <div className="item-desc-block">
                        {descLines.map((l, idx) =>
                          l.trimStart().startsWith('-')
                            ? <ul key={idx} className="item-details"><li>{l.trimStart().slice(1).trim()}</li></ul>
                            : <span key={idx} className="item-detail-plain">{l}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="col-qty">{item.qty}</td>
                  <td className="col-rate">{fmt(item.rate, currency)}</td>
                  <td className="col-total">{fmt(item.qty * item.rate, currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* ── Totals breakdown ── */}
        <div className="pdf-totals-wrap">
          <div className="pdf-totals">
            <div className="pdf-totals-row">
              <span>{labels.subtotal}</span>
              <span>{fmt(subtotal, currency)}</span>
            </div>
            {(doc.discount_value || 0) > 0 && (
              <div className="pdf-totals-row">
                <span>
                  {labels.discount}
                  {doc.discount_type === '%' ? ` (${doc.discount_value}%)` : ''}
                </span>
                <span className="pdf-discount">−{fmt(discountAmt, currency)}</span>
              </div>
            )}
            {!isCash && (
              <div className="pdf-totals-row">
                <span>{labels.tax}{doc.tax_rate ? ` (${doc.tax_rate}%)` : ''}</span>
                <span>{fmt(tax, currency)}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Grand total bar ── */}
        <div className="pdf-total-bar">
          <span>{totalLabel.toUpperCase()}</span>
          <span>{fmt(total, currency)}</span>
        </div>

        {/* ── Notes ── */}
        {doc.notes && (
          <div className="pdf-notes">{doc.notes}</div>
        )}

        {/* ── Payment footer ── */}
        <footer className="pdf-footer">
          <div className="pdf-rule pdf-rule--footer" />
          <p className="pdf-payment-label">{labels.paymentNote}</p>
          <div className="pdf-bank">
            {sender?.company_name && <span className="pdf-bank-name">{sender.company_name}</span>}
            {sender?.company_iban && <span>IBAN: {sender.company_iban}</span>}
            {sender?.company_bic  && <span>BIC: {sender.company_bic}</span>}
          </div>
          {(sender?.company_vat || sender?.company_email) && (
            <div className="pdf-footer-legal">
              {[sender.company_name, sender.company_vat ? `VAT: ${sender.company_vat}` : null, sender.company_email]
                .filter(Boolean).join('  ·  ')}
            </div>
          )}
        </footer>

      </div>
    </div>
  );
};

export default DocumentPreview;
