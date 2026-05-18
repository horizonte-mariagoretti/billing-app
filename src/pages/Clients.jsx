import React, { useState, useEffect, useRef, useCallback } from 'react';
import useDatabase from '../hooks/useDatabase';
import useFocusTrap from '../hooks/useFocusTrap';
import Button from '../components/Button';
import Input from '../components/Input';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  Plus, Search, Edit2, Trash2,
  Check, X, Loader2, Users, AlertCircle
} from 'lucide-react';
import {
  validateEmail,
  validatePhone,
  validateVAT,
  lookupAddress,
  useDebouncedValidator,
} from '../utils/validators';
import './Clients.css';

const ValidationIcon = ({ status, title }) => {
  if (status === 'pending') return <Loader2 size={14} className="val-icon val-pending" title={title || 'Checking...'} aria-label="Validating" />;
  if (status === 'valid')   return <Check   size={14} className="val-icon val-valid"   title={title || 'Valid'}       aria-label="Valid" />;
  if (status === 'invalid') return <X       size={14} className="val-icon val-invalid" title={title || 'Invalid'}     aria-label="Invalid" />;
  if (status === 'error')   return <AlertCircle size={14} className="val-icon val-error" title={title || 'Service unavailable'} aria-label="Service unavailable" />;
  return null;
};

const EMPTY_FORM = {
  name: '', email: '', phone: '',
  address_street: '', address_zip: '', address_city: '', address_country: '',
  vat: '',
};

const Clients = () => {
  const { query, run } = useDatabase();
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [confirm, setConfirm] = useState(null); // { id, name }

  const modalRef = useRef(null);
  const openBtnRef = useRef(null);
  useFocusTrap(modalRef, { active: showModal, triggerRef: openBtnRef });

  const COUNTRY_CODE_MAP = {
    belgium: 'BE', germany: 'DE', deutschland: 'DE', france: 'FR',
    luxembourg: 'LU', netherlands: 'NL', nederland: 'NL',
    'united kingdom': 'GB', uk: 'GB', switzerland: 'CH', schweiz: 'CH',
    'united states': 'US', usa: 'US', austria: 'AT', österreich: 'AT',
    italy: 'IT', italia: 'IT', spain: 'ES', españa: 'ES', portugal: 'PT',
  };
  const phoneCountry = COUNTRY_CODE_MAP[(formData.address_country || '').trim().toLowerCase()] || 'BE';

  const emailValidator = useCallback((v) => validateEmail(v), []);
  const phoneValidator = useCallback((v) => validatePhone(v, phoneCountry), [phoneCountry]);
  const vatValidator   = useCallback((v) => validateVAT(v), []);

  const emailState   = useDebouncedValidator(formData.email, emailValidator, 400);
  const phoneState   = useDebouncedValidator(formData.phone, phoneValidator, 400);
  const vatState     = useDebouncedValidator(formData.vat,   vatValidator,   800);

  const [addressState, setAddressState] = useState({ status: 'idle', result: null });
  const lastQueriedRef = useRef('');
  useEffect(() => {
    if (!showModal) return undefined;
    const street = formData.address_street?.trim();
    if (!street) { setAddressState({ status: 'idle', result: null }); return undefined; }
    if (street === lastQueriedRef.current) return undefined;
    setAddressState((s) => ({ status: 'pending', result: s.result }));
    const handle = setTimeout(async () => {
      lastQueriedRef.current = street;
      const result = await lookupAddress(formData.address_street, formData.address_city);
      if (!result || result.valid === null) {
        setAddressState({ status: result?.error === 'service_unavailable' ? 'error' : 'idle', result });
        return;
      }
      if (!result.valid) { setAddressState({ status: 'invalid', result }); return; }
      setAddressState({ status: 'valid', result });
    }, 800);
    return () => clearTimeout(handle);
  }, [formData.address_street, showModal]);

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
      setError('Failed to load clients. Please restart the app.');
    } finally {
      setLoading(false);
    }
  };

  const anyPending = [emailState, phoneState, vatState, addressState].some(s => s.status === 'pending');

  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (formData.email && emailState.status === 'invalid') newErrors.email = 'Invalid email format';
    if (formData.phone && phoneState.status === 'invalid') newErrors.phone = 'Invalid phone format';
    setFormErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setFormErrors({});
    setAddressState({ status: 'idle', result: null });
    lastQueriedRef.current = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const id = editingClient ? editingClient.id : crypto.randomUUID();
    const flag = (s) => s.status === 'valid' ? 1 : (s.status === 'invalid' ? 0 : null);
    const flags = {
      email_valid:      formData.email          ? flag(emailState)   : null,
      phone_valid:      formData.phone          ? flag(phoneState)   : null,
      address_verified: formData.address_street ? flag(addressState) : null,
      vat_valid:        formData.vat            ? flag(vatState)     : null,
      vat_company_name: vatState.result?.name || null,
      vat_validated_at: formData.vat ? new Date().toISOString() : null,
    };

    if (editingClient) {
      await run(
        `UPDATE clients SET
           name = ?, email = ?, phone = ?,
           address_street = ?, address_zip = ?, address_city = ?, address_country = ?,
           vat = ?,
           email_valid = ?, phone_valid = ?, address_verified = ?,
           vat_valid = ?, vat_company_name = ?, vat_validated_at = ?
         WHERE id = ?`,
        [
          formData.name, formData.email, formData.phone,
          formData.address_street, formData.address_zip, formData.address_city, formData.address_country,
          formData.vat,
          flags.email_valid, flags.phone_valid, flags.address_verified,
          flags.vat_valid, flags.vat_company_name, flags.vat_validated_at,
          id,
        ]
      );
    } else {
      await run(
        `INSERT INTO clients (
           id, name, email, phone,
           address_street, address_zip, address_city, address_country,
           vat,
           email_valid, phone_valid, address_verified,
           vat_valid, vat_company_name, vat_validated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, formData.name, formData.email, formData.phone,
          formData.address_street, formData.address_zip, formData.address_city, formData.address_country,
          formData.vat,
          flags.email_valid, flags.phone_valid, flags.address_verified,
          flags.vat_valid, flags.vat_company_name, flags.vat_validated_at,
        ]
      );
    }

    setShowModal(false);
    setEditingClient(null);
    resetForm();
    fetchClients();
  };

  const handleEdit = (client) => {
    setEditingClient(client);
    setFormData({
      name:            client.name || '',
      email:           client.email || '',
      phone:           client.phone || '',
      address_street:  client.address_street || client.address || '',
      address_zip:     client.address_zip || '',
      address_city:    client.address_city || '',
      address_country: client.address_country || '',
      vat:             client.vat || '',
    });
    setFormErrors({});
    lastQueriedRef.current = '';
    setShowModal(true);
  };

  const handleDeleteConfirmed = async () => {
    if (!confirm) return;
    // Unlink documents before deleting — FK enforcement would block otherwise.
    await run('UPDATE documents SET client_id = NULL WHERE client_id = ?', [confirm.id]);
    await run('DELETE FROM clients WHERE id = ?', [confirm.id]);
    setConfirm(null);
    fetchClients();
  };

  const handleNew = () => {
    setEditingClient(null);
    resetForm();
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingClient(null);
    resetForm();
  };

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email && c.email.toLowerCase().includes(search.toLowerCase())) ||
    (c.address_city && c.address_city.toLowerCase().includes(search.toLowerCase()))
  );

  const phoneHint  = phoneState.status === 'valid' ? phoneState.result?.formatted : null;
  const vatCompany = vatState.status === 'valid' ? vatState.result?.name : null;

  return (
    <div className="clients-page">
      <div className="page-header">
        <div className="search-bar">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search clients"
          />
        </div>
        <Button ref={openBtnRef} variant="primary" icon={Plus} onClick={handleNew}>
          Add Client
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
              {loading ? 'Loading…' : search ? `No clients match "${search}"` : 'No clients yet'}
            </div>
            <div className="clients-empty-desc">
              {!loading && !search && 'Add your first client to start creating invoices and quotes.'}
              {!loading && search && 'Try a different search term.'}
            </div>
          </div>
        ) : (
          <table className="clients-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>City</th>
                <th>VAT</th>
                <th>Documents</th>
                <th>Actions</th>
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
                        title="Edit"
                        aria-label={`Edit ${client.name}`}
                        onClick={() => handleEdit(client)}
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        title="Delete"
                        aria-label={`Delete ${client.name}`}
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
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={editingClient ? 'Edit Client' : 'Add New Client'}>
          <div className="modal-content" ref={modalRef}>
            <h2>{editingClient ? 'Edit Client' : 'Add New Client'}</h2>
            <form onSubmit={handleSubmit}>
              <Input
                label="Client Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                error={formErrors.name}
                required
              />
              <div className="form-row">
                <div className="input-with-status">
                  <Input
                    label="Email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    error={formErrors.email}
                  />
                  <ValidationIcon status={emailState.status} />
                </div>
                <div className="input-with-status">
                  <Input
                    label="Phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    error={formErrors.phone}
                  />
                  <ValidationIcon
                    status={phoneState.status}
                    title={phoneHint || undefined}
                  />
                </div>
              </div>
              {phoneHint && (
                <div className="field-hint">Detected: {phoneHint}</div>
              )}

              <div className="address-section">
                <div className="input-with-status">
                  <Input
                    label="Street & Number"
                    value={formData.address_street}
                    onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
                  />
                  <ValidationIcon
                    status={addressState.status}
                    title={
                      addressState.status === 'valid' ? 'Address verified' :
                      addressState.status === 'invalid' ? 'Could not verify address' :
                      addressState.status === 'error' ? 'Address service unavailable' : ''
                    }
                  />
                </div>
                <div className="form-row three-col">
                  <Input
                    label="Zip-Code"
                    value={formData.address_zip}
                    onChange={(e) => setFormData({ ...formData, address_zip: e.target.value })}
                  />
                  <Input
                    label="City"
                    value={formData.address_city}
                    onChange={(e) => setFormData({ ...formData, address_city: e.target.value })}
                  />
                  <Input
                    label="Country"
                    value={formData.address_country}
                    onChange={(e) => setFormData({ ...formData, address_country: e.target.value })}
                  />
                </div>
              </div>

              <div className="input-with-status">
                <Input
                  label="VAT Number"
                  value={formData.vat}
                  onChange={(e) => setFormData({ ...formData, vat: e.target.value })}
                  placeholder="e.g. BE0123456789"
                />
                <ValidationIcon
                  status={vatState.status}
                  title={
                    vatCompany ||
                    (vatState.status === 'error' ? 'VAT service unavailable — enter manually' : (vatState.result?.reason || ''))
                  }
                />
              </div>
              {vatCompany && (
                <div className="field-hint vat-hint">Registered to: <strong>{vatCompany}</strong></div>
              )}

              <div className="modal-actions">
                <Button variant="ghost" type="button" onClick={closeModal}>Cancel</Button>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={anyPending}
                  title={anyPending ? 'Please wait for validation to complete' : undefined}
                >
                  {anyPending ? 'Validating…' : 'Save Client'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title="Delete client?"
          message={`"${confirm.name}" will be permanently deleted. Any linked documents will be kept but unlinked.`}
          confirmLabel="Delete"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
};

export default Clients;
