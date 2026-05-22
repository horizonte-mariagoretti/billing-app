import { useCallback } from 'react';
import useDatabase from './useDatabase';
import { applyTransition } from '../utils/documentLifecycle';

const newId = () => crypto.randomUUID();

const useDocuments = () => {
  const { query, run, transaction } = useDatabase();

  const fetchDocuments = useCallback(async (type) => {
    return await query(`
      SELECT
        d.*,
        c.name as client_name,
        COALESCE(SUM(di.qty * di.rate), 0) as items_subtotal
      FROM documents d
      LEFT JOIN clients c ON d.client_id = c.id
      LEFT JOIN document_items di ON di.document_id = d.id
      WHERE d.type = ?
      GROUP BY d.id
      ORDER BY d.date DESC
    `, [type]).then(docs =>
      docs.map(doc => {
        const subtotal = doc.items_subtotal;
        const discount = doc.discount_type === '%'
          ? subtotal * (doc.discount_value / 100)
          : doc.discount_value;
        const isCash = doc.payment_mode === 'cash';
        const tax = isCash ? 0 : (subtotal - discount) * (doc.tax_rate / 100);
        return { ...doc, total: subtotal - discount + tax };
      })
    );
  }, [query]);

  const fetchDocumentItems = useCallback(async (docId) => {
    return await query(
      'SELECT * FROM document_items WHERE document_id = ? ORDER BY sort_order ASC',
      [docId]
    );
  }, [query]);

  const fetchPayments = useCallback(async (docId) => {
    return await query(
      'SELECT * FROM payments WHERE document_id = ? ORDER BY paid_at ASC',
      [docId]
    );
  }, [query]);

  const fetchEvents = useCallback(async (docId) => {
    return await query(
      'SELECT * FROM document_events WHERE document_id = ? ORDER BY created_at ASC',
      [docId]
    );
  }, [query]);

  const saveDocument = useCallback(async (doc) => {
    const isUpdate = !!doc.id;
    const id = doc.id || newId();
    const operations = [];

    if (isUpdate) {
      operations.push({
        sql: `UPDATE documents SET
          number = ?, date = ?, due_date = ?, status = ?, client_id = ?,
          title = ?, notes = ?, currency = ?, tax_rate = ?, discount_value = ?,
          discount_type = ?, language = ?, payment_mode = ?
          WHERE id = ?`,
        params: [
          doc.number, doc.date, doc.due_date, doc.status || 'draft', doc.client_id,
          doc.title, doc.notes, doc.currency, doc.tax_rate, doc.discount_value,
          doc.discount_type, doc.language || 'en', doc.payment_mode || 'standard', id,
        ],
      });
      operations.push({
        sql: 'DELETE FROM document_items WHERE document_id = ?',
        params: [id],
      });
    } else {
      operations.push({
        sql: `INSERT INTO documents (
          id, type, number, date, due_date, status, client_id,
          title, notes, currency, tax_rate, discount_value, discount_type, language,
          payment_mode, source_quote_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          id, doc.type, doc.number, doc.date, doc.due_date, doc.status || 'draft', doc.client_id,
          doc.title, doc.notes, doc.currency, doc.tax_rate, doc.discount_value,
          doc.discount_type, doc.language || 'en',
          doc.payment_mode || 'standard', doc.source_quote_id || null,
        ],
      });

      // Conversion bookkeeping: if this new invoice was created from a quote,
      // mark that quote as 'converted' atomically.
      if (doc.source_quote_id) {
        const ts = new Date().toISOString();
        operations.push({
          sql: 'UPDATE documents SET status = ?, locked = 1 WHERE id = ?',
          params: ['converted', doc.source_quote_id],
        });
        operations.push({
          sql: `INSERT INTO document_events (id, document_id, event_type, payload_json)
                VALUES (?, ?, ?, ?)`,
          params: [
            newId(),
            doc.source_quote_id,
            'status:accepted->converted',
            JSON.stringify({ from: 'accepted', to: 'converted', invoice_id: id, at: ts }),
          ],
        });
      }
    }

    doc.items.forEach((item, i) => {
      operations.push({
        sql: `INSERT INTO document_items (id, document_id, name, description, qty, rate, sort_order)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        params: [
          newId(),
          id, item.name ?? '', item.description ?? '', item.qty, item.rate, i,
        ],
      });
    });

    // Concurrent editors can both read the same "next" number before either saves.
    // The UNIQUE(type, number) index (migration 5) will reject the second INSERT;
    // retry with a numeric suffix so the user doesn't lose their work. Updates are
    // not retried — a UNIQUE failure on update means a real conflict to surface.
    let attemptNumber = doc.number;
    let attempts = 0;
    while (true) {
      try {
        if (!isUpdate) {
          operations[0].params[2] = attemptNumber; // number is param index 2 in INSERT
        }
        await transaction(operations);
        return id;
      } catch (err) {
        if (isUpdate || attempts >= 5 || !/UNIQUE.*number/i.test(err.message || '')) throw err;
        attempts++;
        attemptNumber = `${doc.number}-${attempts + 1}`;
      }
    }
  }, [transaction]);

  const transitionDocument = useCallback(async (doc, nextStatus, extras = {}) => {
    const { updates, event } = applyTransition(doc, nextStatus);

    // Explicit column list — never interpolate user-controlled keys into SQL.
    const operations = [
      {
        sql: `UPDATE documents SET
                status = ?, locked = ?, issued_at = ?, paid_at = ?, cancelled_at = ?
              WHERE id = ?`,
        params: [
          updates.status      ?? doc.status      ?? 'draft',
          updates.locked      ?? doc.locked       ?? 0,
          updates.issued_at   ?? doc.issued_at    ?? null,
          updates.paid_at     ?? doc.paid_at      ?? null,
          updates.cancelled_at ?? doc.cancelled_at ?? null,
          doc.id,
        ],
      },
      {
        sql: `INSERT INTO document_events (id, document_id, event_type, payload_json)
              VALUES (?, ?, ?, ?)`,
        params: [event.id, event.document_id, event.event_type, event.payload_json],
      },
    ];

    // When transitioning to paid, also write a payment row for the full balance
    // unless the caller suppresses it (e.g. partial payments later).
    if (nextStatus === 'paid' && extras.recordPayment !== false) {
      const ts = updates.paid_at || new Date().toISOString();
      const amount = extras.amount ?? doc.total ?? 0;
      operations.push({
        sql: `INSERT INTO payments (id, document_id, amount, currency, method, paid_at, reference, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          newId(),
          doc.id,
          amount,
          doc.currency || 'EUR',
          extras.method || 'bank_transfer',
          ts,
          extras.reference || null,
          extras.notes || null,
        ],
      });
    }

    await transaction(operations);
    return { ...doc, ...updates };
  }, [transaction]);

  const deleteDocument = useCallback(async (id) => {
    await transaction([
      // Unlink any invoice that was converted from this document (FK source_quote_id).
      { sql: 'UPDATE documents SET source_quote_id = NULL WHERE source_quote_id = ?', params: [id] },
      { sql: 'DELETE FROM payments WHERE document_id = ?', params: [id] },
      { sql: 'DELETE FROM document_events WHERE document_id = ?', params: [id] },
      { sql: 'DELETE FROM document_items WHERE document_id = ?', params: [id] },
      { sql: 'DELETE FROM documents WHERE id = ?', params: [id] },
    ]);
  }, [transaction]);

  return {
    fetchDocuments,
    fetchDocumentItems,
    fetchPayments,
    fetchEvents,
    saveDocument,
    transitionDocument,
    deleteDocument,
  };
};

export default useDocuments;
