// Document lifecycle: status state machine + transition helpers.
// Invoices:  draft -> sent -> { paid | overdue | cancelled }
// Quotes:    draft -> sent -> { accepted | declined } -> converted

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'converted'];

const INVOICE_TRANSITIONS = {
  draft: ['sent'],
  sent: ['paid', 'cancelled', 'draft'],     // draft = unlock for edit
  overdue: ['paid', 'cancelled', 'draft'],
  paid: ['sent'],                            // unlock for edit
  cancelled: ['draft'],                       // unlock for edit
};

const QUOTE_TRANSITIONS = {
  draft: ['sent'],
  sent: ['accepted', 'declined', 'draft'],  // draft = unlock for edit
  accepted: ['converted', 'draft'],
  declined: ['draft'],
  converted: ['draft'],                       // unlock for edit
};

const transitionsFor = (type) => (type === 'quote' ? QUOTE_TRANSITIONS : INVOICE_TRANSITIONS);

export const canTransition = (doc, nextStatus) => {
  if (!doc) return false;
  const current = (doc.status || 'draft').toLowerCase();
  if (current === nextStatus) return false;
  const allowed = transitionsFor(doc.type)[current] || [];
  return allowed.includes(nextStatus);
};

export const allowedNextStatuses = (doc) => {
  if (!doc) return [];
  const current = (doc.status || 'draft').toLowerCase();
  return transitionsFor(doc.type)[current] || [];
};

const nowIso = () => new Date().toISOString();

/**
 * Apply a transition: returns updated doc fields and an audit-log entry to write.
 * Caller is expected to persist both inside a single transaction.
 */
export const applyTransition = (doc, nextStatus) => {
  if (!canTransition(doc, nextStatus)) {
    throw new Error(`Illegal transition ${doc.status} -> ${nextStatus} for ${doc.type}`);
  }
  const ts = nowIso();
  const previous = doc.status || 'draft';
  const updates = { status: nextStatus };

  if (doc.type === 'invoice') {
    if (previous === 'paid' && nextStatus === 'sent') {
      // explicit "unlock for edit"
      updates.locked = 0;
      updates.paid_at = null;
    } else if (nextStatus === 'draft') {
      // explicit "unlock for edit" from sent/overdue — back to draft, fully editable
      updates.locked = 0;
    } else if (nextStatus === 'sent') {
      updates.locked = 1;
      if (!doc.issued_at) updates.issued_at = ts;
    } else if (nextStatus === 'paid') {
      updates.paid_at = ts;
      updates.locked = 1;
    } else if (nextStatus === 'cancelled') {
      updates.cancelled_at = ts;
      updates.locked = 1;
    }
  } else if (doc.type === 'quote') {
    if (nextStatus === 'draft') {
      // explicit "unlock for edit" from sent/accepted/declined
      updates.locked = 0;
    } else if (nextStatus === 'sent') {
      updates.locked = 1;
      if (!doc.issued_at) updates.issued_at = ts;
    } else if (nextStatus === 'converted') {
      updates.locked = 1;
    }
    // accepted / declined leave locked as-is (still 1)
  }

  const event = {
    id: crypto.randomUUID(),
    document_id: doc.id,
    event_type: `status:${previous}->${nextStatus}`,
    payload_json: JSON.stringify({ from: previous, to: nextStatus, at: ts }),
  };

  return { updates, event };
};

/**
 * Returns true if an invoice should be considered overdue right now.
 * Pure derivation: does not modify state.
 */
export const isOverdue = (doc, today = new Date()) => {
  if (!doc || doc.type !== 'invoice') return false;
  if (doc.status !== 'sent') return false;
  if (!doc.due_date) return false;
  const due = new Date(doc.due_date);
  if (isNaN(due.getTime())) return false;
  // Compare on date level (ignore time).
  due.setHours(23, 59, 59, 999);
  return today.getTime() > due.getTime();
};

/**
 * Returns the effective status for display: substitutes "overdue" for "sent"
 * when the due date has passed. Underlying status in DB stays "sent".
 */
export const effectiveStatus = (doc, today = new Date()) => {
  if (isOverdue(doc, today)) return 'overdue';
  return doc.status || 'draft';
};
