import React, { useState, useEffect, useRef } from 'react';
import useDatabase from '../hooks/useDatabase';
import { useT } from '../hooks/useUiTranslations';
import Button from '../components/Button';
import ClientModal from '../components/ClientModal';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  Plus, Search, Edit2, Trash2,
  Check, X, Users, AlertCircle
} from 'lucide-react';
import './Clients.css';

const Clients = () => {
  const { query, run } = useDatabase();
  const t = useT();
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [confirm, setConfirm] = useState(null); // { id, name }

  const openBtnRef = useRef(null);

  useEffect(() => { fetchClients(); }, []);

  const fetchClients = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await query(`
        SELECT
          c.*,
          COALESCE(d.doc_count, 0) AS doc_count
        FROM clients c
        LEFT JOIN (
          SELECT client_id, COUNT(*) AS doc_count
          FROM documents
          GROUP BY client_id
        ) d ON d.client_id = c.id
        ORDER BY c.name ASC
      `);
      setClients(data);
    } catch (err) {
      setError(t('clients_load_error', 'Failed to load clients. Please restart the app.'));
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (client) => {
    setEditingClient(client);
    setShowModal(true);
  };

  const handleNew = () => {
    setEditingClient(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingClient(null);
  };

  const handleModalSave = () => {
    setShowModal(false);
    setEditingClient(null);
    fetchClients();
  };

  const handleDeleteConfirmed = async () => {
    if (!confirm) return;
    // Unlink documents before deleting — FK enforcement would block otherwise.
    await run('UPDATE documents SET client_id = NULL WHERE client_id = ?', [confirm.id]);
    await run('DELETE FROM clients WHERE id = ?', [confirm.id]);
    setConfirm(null);
    fetchClients();
  };

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email && c.email.toLowerCase().includes(search.toLowerCase())) ||
    (c.address_city && c.address_city.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="clients-page">
      <div className="page-header">
        <div className="search-bar">
          <Search size={18} />
          <input
            type="text"
            placeholder={t('clients_search', 'Search clients...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('clients_search', 'Search clients...')}
          />
        </div>
        <Button ref={openBtnRef} variant="primary" icon={Plus} onClick={handleNew}>
          {t('clients_add', 'Add Client')}
        </Button>
      </div>

      {error && (
        <div className="page-error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="clients-table-container">
        {!error && filteredClients.length === 0 ? (
          <div className="clients-empty">
            <Users size={36} strokeWidth={1.4} />
            <div className="clients-empty-title">
              {loading ? t('loading', 'Loading…') : search ? `${t('clients_no_match', 'No clients match')} "${search}"` : t('clients_no_clients', 'No clients yet')}
            </div>
            <div className="clients-empty-desc">
              {!loading && !search && t('clients_no_clients_hint', 'Add your first client to start creating invoices and quotes.')}
              {!loading && search && t('try_different_search', 'Try a different search term.')}
            </div>
          </div>
        ) : (
          <table className="clients-table">
            <thead>
              <tr>
                <th>{t('clients_col_name', 'Name')}</th>
                <th>{t('clients_col_email', 'Email')}</th>
                <th>{t('clients_col_phone', 'Phone')}</th>
                <th>{t('clients_col_city', 'City')}</th>
                <th>{t('clients_col_vat', 'VAT')}</th>
                <th>{t('clients_col_documents', 'Documents')}</th>
                <th>{t('col_actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map(client => (
                <tr key={client.id}>
                  <td className="client-name-cell">{client.name}</td>
                  <td>
                    <div className="cell-with-icon">
                      <span>{client.email || '—'}</span>
                      {client.email_valid === 1 && <Check size={14} className="val-icon val-valid" aria-label="Valid email" />}
                      {client.email_valid === 0 && <X     size={14} className="val-icon val-invalid" aria-label="Invalid email" />}
                    </div>
                  </td>
                  <td>
                    <div className="cell-with-icon">
                      <span>{client.phone || '—'}</span>
                      {client.phone_valid === 1 && <Check size={14} className="val-icon val-valid" aria-label="Valid phone" />}
                      {client.phone_valid === 0 && <X     size={14} className="val-icon val-invalid" aria-label="Invalid phone" />}
                    </div>
                  </td>
                  <td>{client.address_city || '—'}</td>
                  <td>
                    <div className="cell-with-icon">
                      <span className="vat-cell">{client.vat || '—'}</span>
                      {client.vat_valid === 1 && <Check size={14} className="val-icon val-valid" aria-label={`VAT valid${client.vat_company_name ? ` — ${client.vat_company_name}` : ''}`} />}
                      {client.vat_valid === 0 && <X     size={14} className="val-icon val-invalid" aria-label="VAT invalid" />}
                    </div>
                  </td>
                  <td className="doc-count-cell">{client.doc_count || 0}</td>
                  <td className="actions-cell">
                    <div className="action-btns">
                      <button
                        title={t('btn_edit', 'Edit')}
                        aria-label={`${t('btn_edit', 'Edit')} ${client.name}`}
                        onClick={() => handleEdit(client)}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        title={t('btn_delete', 'Delete')}
                        aria-label={`${t('btn_delete', 'Delete')} ${client.name}`}
                        onClick={() => setConfirm({ id: client.id, name: client.name })}
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

      {showModal && (
        <ClientModal
          editingClient={editingClient}
          onSave={handleModalSave}
          onCancel={closeModal}
          triggerRef={openBtnRef}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={t('clients_delete_title', 'Delete client?')}
          message={`"${confirm.name}" ${t('clients_delete_body', 'will be permanently deleted. Any linked documents will be kept but unlinked.')}`}
          confirmLabel={t('btn_delete', 'Delete')}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
};

export default Clients;
