import React, { useState, useEffect, useRef, useCallback } from 'react';
import useDatabase from '../hooks/useDatabase';
import useFocusTrap from '../hooks/useFocusTrap';
import { useT } from '../hooks/useUiTranslations';
import Button from './Button';
import Input from './Input';
import { Check, X, Loader2, AlertCircle } from 'lucide-react';
import {
  validateEmail,
  validatePhone,
  validateVAT,
  lookupAddress,
  useDebouncedValidator,
} from '../utils/validators';
import './ClientModal.css';

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

const ClientModal = ({ editingClient, onSave, onCancel, triggerRef }) => {
  const { run } = useDatabase();
  const t = useT();
  const [formData, setFormData] = useState(() =>
    editingClient
      ? {
          name:            editingClient.name || '',
          email:           editingClient.email || '',
          phone:           editingClient.phone || '',
          address_street:  editingClient.address_street || editingClient.address || '',
          address_zip:     editingClient.address_zip || '',
          address_city:    editingClient.address_city || '',
          address_country: editingClient.address_country || '',
          vat:             editingClient.vat || '',
        }
      : { ...EMPTY_FORM }
  );
  const [formErrors, setFormErrors] = useState({});

  const modalRef = useRef(null);
  useFocusTrap(modalRef, { active: true, triggerRef });

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
  }, [formData.address_street]);

  const anyPending = [emailState, phoneState, vatState, addressState].some(s => s.status === 'pending');

  const validate = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Name is required';
    if (formData.email && emailState.status === 'invalid') errors.email = t('clients_invalid_email', 'Invalid email format');
    if (formData.phone && phoneState.status === 'invalid') errors.phone = t('clients_invalid_phone', 'Invalid phone format');
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
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

    onSave({ id, ...formData });
  };

  const phoneHint  = phoneState.status === 'valid' ? phoneState.result?.formatted : null;
  const vatCompany = vatState.status === 'valid' ? vatState.result?.name : null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true"
      aria-label={editingClient ? t('clients_edit_title', 'Edit Client') : t('clients_add_title', 'Add New Client')}>
      <div className="modal-content" ref={modalRef}>
        <h2>{editingClient ? t('clients_edit_title', 'Edit Client') : t('clients_add_title', 'Add New Client')}</h2>
        <form onSubmit={handleSubmit}>
          <Input
            label={t('clients_field_name', 'Name')}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={formErrors.name}
            required
          />
          <div className="form-row">
            <div className="input-with-status">
              <Input
                label={t('clients_field_email', 'Email')}
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                error={formErrors.email}
              />
              <ValidationIcon status={emailState.status} />
            </div>
            <div className="input-with-status">
              <Input
                label={t('clients_field_phone', 'Phone')}
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                error={formErrors.phone}
              />
              <ValidationIcon status={phoneState.status} title={phoneHint || undefined} />
            </div>
          </div>
          {phoneHint && (
            <div className="field-hint">Detected: {phoneHint}</div>
          )}

          <div className="address-section">
            <div className="input-with-status">
              <Input
                label={t('clients_field_street', 'Street & Number')}
                value={formData.address_street}
                onChange={(e) => setFormData({ ...formData, address_street: e.target.value })}
              />
              <ValidationIcon
                status={addressState.status}
                title={
                  addressState.status === 'valid' ? t('clients_addr_verified', 'Address verified') :
                  addressState.status === 'invalid' ? t('clients_addr_failed', 'Could not verify address') :
                  addressState.status === 'error' ? t('clients_addr_unavailable', 'Address service unavailable') : ''
                }
              />
            </div>
            <div className="form-row three-col">
              <Input
                label={t('clients_field_zip', 'Zip-Code')}
                value={formData.address_zip}
                onChange={(e) => setFormData({ ...formData, address_zip: e.target.value })}
              />
              <Input
                label={t('clients_field_city', 'City')}
                value={formData.address_city}
                onChange={(e) => setFormData({ ...formData, address_city: e.target.value })}
              />
              <Input
                label={t('clients_field_country', 'Country')}
                value={formData.address_country}
                onChange={(e) => setFormData({ ...formData, address_country: e.target.value })}
              />
            </div>
          </div>

          <div className="input-with-status">
            <Input
              label={t('clients_field_vat', 'VAT Number')}
              value={formData.vat}
              onChange={(e) => setFormData({ ...formData, vat: e.target.value })}
              placeholder={t('clients_vat_placeholder', 'e.g. BE0123456789')}
            />
            <ValidationIcon
              status={vatState.status}
              title={
                vatCompany ||
                (vatState.status === 'error' ? t('clients_service_unavailable', 'Service unavailable') : (vatState.result?.reason || ''))
              }
            />
          </div>
          {vatCompany && (
            <div className="field-hint vat-hint">Registered to: <strong>{vatCompany}</strong></div>
          )}

          <div className="modal-actions">
            <Button variant="ghost" type="button" onClick={onCancel}>{t('btn_cancel', 'Cancel')}</Button>
            <Button
              variant="primary"
              type="submit"
              disabled={anyPending}
              title={anyPending ? t('clients_validating', 'Validating…') : undefined}
            >
              {anyPending ? t('clients_validating', 'Validating…') : t('clients_save', 'Save Client')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ClientModal;
