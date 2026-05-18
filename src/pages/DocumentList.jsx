import React, { useState, useEffect } from 'react';
import useDocuments from '../hooks/useDocuments';
import Button from '../components/Button';
import StatusBadge from '../components/StatusBadge';
import ConfirmDialog from '../components/ConfirmDialog';
import { effectiveStatus } from '../utils/documentLifecycle';
import { useT } from '../hooks/useUiTranslations';
import { Plus, Search, Edit2, Trash2, FileCheck, AlertCircle } from 'lucide-react';
import './DocumentList.css';

const DocumentList = ({ type = 'invoice', onEdit, onNew }) => {
  const { fetchDocuments, deleteDocument } = useDocuments();
  const t = useT();
  const [docs, setDocs] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null); // { id, number }

  useEffect(() => { loadDocs(); }, [type]);

  const loadDocs = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchDocuments(type);
      setDocs(data);
    } catch (_err) {
      setError(t('doclist_load_error', 'Failed to load. Please restart the app.'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!confirm) return;
    await deleteDocument(confirm.id);
    setConfirm(null);
    loadDocs();
  };

  const filteredDocs = docs.filter(d =>
    d.number.toLowerCase().includes(search.toLowerCase()) ||
    (d.client_name && d.client_name.toLowerCase().includes(search.toLowerCase())) ||
    (d.title && d.title.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="doc-list-page">
      <div className="page-header">
        <div className="search-bar">
          <Search size={18} />
          <input
            type="text"
            placeholder={type === 'invoice' ? t('doclist_search_invoices', 'Search invoices...') : t('doclist_search_quotes', 'Search quotes...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={type === 'invoice' ? t('doclist_search_invoices', 'Search invoices...') : t('doclist_search_quotes', 'Search quotes...')}
          />
        </div>
        <Button variant="primary" icon={Plus} onClick={onNew}>
          {t('doclist_new', 'New')} {type === 'invoice' ? t('editor_invoice_label', 'Invoice') : t('editor_quote_label', 'Quote')}
        </Button>
      </div>

      {error && (
        <div className="page-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="doc-table-container">
        {!error && filteredDocs.length === 0 ? (
          <div className="doc-empty">
            <FileCheck size={36} strokeWidth={1.4} />
            <div className="doc-empty-title">
              {loading ? t('loading', 'Loading…') : search ? `${t('doclist_no_match', 'No match for')} "${search}"` : t('doclist_no_docs_yet', 'No documents yet')}
            </div>
            <div className="doc-empty-desc">
              {!loading && !search && (type === 'invoice' ? t('doclist_create_first_invoice', 'Click "New Invoice" to create your first one.') : t('doclist_create_first_quote', 'Click "New Quote" to create your first one.'))}
              {!loading && search && t('try_different_search', 'Try a different search term.')}
            </div>
          </div>
        ) : (
          <table className="doc-table">
            <thead>
              <tr>
                <th>{t('col_number', 'Number')}</th>
                <th>{t('col_client', 'Client')}</th>
                <th>{t('col_name', 'Name')}</th>
                <th>{t('col_date', 'Date')}</th>
                <th>{t('col_status', 'Status')}</th>
                <th>{t('col_amount', 'Amount')}</th>
                <th>{t('col_actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map(doc => (
                <tr key={doc.id}>
                  <td className="doc-num">{doc.number}</td>
                  <td className="client-name">{doc.client_name || t('doc_no_client', 'No Client')}</td>
                  <td className="doc-title-cell">{doc.title || '—'}</td>
                  <td>{doc.date}</td>
                  <td><StatusBadge status={effectiveStatus(doc)} /></td>
                  <td className="doc-amount">
                    {(doc.total || 0).toLocaleString('de-DE', { style: 'currency', currency: doc.currency || 'EUR' })}
                  </td>
                  <td className="actions-cell">
                    <div className="action-btns">
                      <button
                        title={t('btn_edit', 'Edit')}
                        aria-label={`${t('btn_edit', 'Edit')} ${type} ${doc.number}`}
                        onClick={() => onEdit(doc)}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        title={t('btn_delete', 'Delete')}
                        aria-label={`${t('btn_delete', 'Delete')} ${type} ${doc.number}`}
                        onClick={() => setConfirm({ id: doc.id, number: doc.number })}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          title={t('doclist_delete_title', 'Delete?')}
          message={`"${confirm.number}" ${t('doclist_delete_body', 'will be permanently deleted along with all its line items and payment records.')}`}
          confirmLabel={t('btn_delete', 'Delete')}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
};

export default DocumentList;
