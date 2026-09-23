import React from 'react';
import './DocumentPreview.css';
import {
  getDocLabels, getVisibleColumns, isPricingHidden, fmtCurrency, fmtNum, fmtDocDate,
  calcDocTotals, getDocTypeLabel, getClientAddressLines, splitItemNameDesc, getItemLineTotal,
} from '../utils/documentCalc';

const DocumentPreview = ({ doc, sender, client }) => {
  if (!doc) return null;

  const lang = doc.language || 'en';
  const labels = getDocLabels(lang);

  const docTypeLabel = getDocTypeLabel(doc, sender, lang);
  const totalLabel = sender?.[`trans_total_${lang}`] || labels.total;

  const isCash = doc.payment_mode === 'cash';
  const currency = doc.currency || 'EUR';
  const vc = getVisibleColumns(doc);
  const pricingHidden = isPricingHidden(vc);

  const { subtotal, discountAmt, tax, total } = calcDocTotals(doc);

  const senderAddress = sender?.company_address || '';
  const clientAddress = getClientAddressLines(client).join('\n');

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
                  <td className="pdf-meta-value">{fmtDocDate(doc.date)}</td>
                </tr>
                {doc.due_date && (
                  <tr>
                    <td className="pdf-meta-label">{dueDateLabel}</td>
                    <td className="pdf-meta-value">{fmtDocDate(doc.due_date)}</td>
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

        {pricingHidden && (
          <div className="pdf-pricing-hidden-note">
            Qty, Rate and Total columns are hidden — only the grand total below will be visible on this document.
          </div>
        )}

        {/* ── Line items table ── */}
        <table className="pdf-table">
          <thead>
            <tr>
              <th className="col-num">#</th>
              <th className="col-desc">{labels.description}</th>
              {vc.qty !== false && <th className="col-qty">{labels.qty}</th>}
              {vc.duration !== false && <th className="col-duration">{labels.duration}</th>}
              {vc.rate !== false && <th className="col-rate">{labels.rate}</th>}
              {vc.total !== false && <th className="col-total">{labels.total}</th>}
            </tr>
          </thead>
          <tbody>
            {(doc.items || []).map((item, i) => {
              const { itemName, descLines } = splitItemNameDesc(item);
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
                  {vc.qty !== false && <td className="col-qty">{fmtNum(item.qty)}</td>}
                  {vc.duration !== false && <td className="col-duration">{fmtNum(item.duration ?? 1)}</td>}
                  {vc.rate !== false && <td className="col-rate">{fmtCurrency(item.rate, currency)}</td>}
                  {vc.total !== false && <td className="col-total">{fmtCurrency(getItemLineTotal(item), currency)}</td>}
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
              <span>{fmtCurrency(subtotal, currency)}</span>
            </div>
            {(doc.discount_value || 0) > 0 && (
              <div className="pdf-totals-row">
                <span>
                  {labels.discount}
                  {doc.discount_type === '%' ? ` (${doc.discount_value}%)` : ''}
                </span>
                <span className="pdf-discount">−{fmtCurrency(discountAmt, currency)}</span>
              </div>
            )}
            {!isCash && (
              <div className="pdf-totals-row">
                <span>{labels.tax}{doc.tax_rate ? ` (${doc.tax_rate}%)` : ''}</span>
                <span>{fmtCurrency(tax, currency)}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Grand total bar ── */}
        <div className="pdf-total-bar">
          <span>{totalLabel.toUpperCase()}</span>
          <span>{fmtCurrency(total, currency)}</span>
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
