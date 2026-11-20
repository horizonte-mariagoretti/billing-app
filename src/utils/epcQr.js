import QRCode from 'qrcode';

// EPC QR ("Girocode", BCD v002): banking apps fill IBAN, amount and reference from it.
// Returns null when a valid code cannot be made (no IBAN, not EUR, amount <= 0).
export function epcPayload({ name, iban, bic, amount, reference }) {
  const cleanIban = (iban || '').replace(/\s+/g, '').toUpperCase();
  const cents = Math.round((Number(amount) || 0) * 100);
  if (!name || !cleanIban || cents <= 0) return null;
  return [
    'BCD', '002', '1', 'SCT',
    (bic || '').replace(/\s+/g, '').toUpperCase(),
    name.slice(0, 70),
    cleanIban,
    `EUR${(cents / 100).toFixed(2)}`,
    '', '', // purpose, structured reference: unused
    (reference || '').slice(0, 140),
  ].join('\n');
}

// The Betreff is what shows on the bank statement; the number is only the fallback.
export const paymentReference = (doc) => (doc.title || '').trim() || doc.number || '';

// QR for an invoice as one SVG path + viewBox, shared by the PDF and the on-screen preview.
// Only EUR invoices still to be paid: EPC codes are SEPA/EUR only, and a paid or cancelled invoice must not invite a second payment.
export function invoiceQr(doc, sender, total) {
  if (doc.type !== 'invoice' || (doc.currency || 'EUR') !== 'EUR') return null;
  if (doc.status === 'paid' || doc.status === 'cancelled') return null;
  const text = epcPayload({
    name: sender?.company_name, iban: sender?.company_iban, bic: sender?.company_bic,
    amount: total, reference: paymentReference(doc),
  });
  if (!text) return null;
  const m = qrMatrix(text);
  const d = m.flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : ''))).join('');
  return { d, viewBox: `-2 -2 ${m.length + 4} ${m.length + 4}` };
}

// Square boolean matrix for drawing the code as vector shapes.
export function qrMatrix(text) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const rows = [];
  for (let y = 0; y < modules.size; y++) {
    rows.push(Array.from({ length: modules.size }, (_, x) => !!modules.get(x, y)));
  }
  return rows;
}
