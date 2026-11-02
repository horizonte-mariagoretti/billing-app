import { useState, useRef, useEffect, useMemo, useId } from 'react';
import { AlertCircle, Check, Info } from 'lucide-react';
import useFocusTrap from '../hooks/useFocusTrap';
import { useBaseballSponsors } from '../hooks/useBaseballSponsors';
import { SPONSOR_STATUS, SPONSOR_ART, findDuplicate, nameKey } from '../utils/baseballSponsors';
import Button from './Button';
import Input from './Input';
import DecimalInput from './DecimalInput';
import StyledSelect from './StyledSelect';
import SegmentedToggle from './SegmentedToggle';
import SponsorStatusIcon from './SponsorStatusIcon';
import './ClientModal.css'; // shared .modal-overlay / .modal-content / .form-row / .address-section / .modal-actions
import './ClientPicker.css'; // shared combobox look (.client-picker-*)
import './BaseballSponsorModal.css';

const IDENT_KEYS = [
  'name', 'contact_name', 'phone', 'email',
  'address_street', 'address_zip', 'address_city', 'address_country', 'vat_number', 'iban',
];

const EMPTY_IDENT = Object.fromEntries(IDENT_KEYS.map((k) => [k, '']));

const MODES = [
  { value: 'library', label: 'Aus Bibliothek' },
  { value: 'new', label: 'Neu' },
];

const str = (v) => (v == null ? '' : String(v));

/** Identity/billing fields of a library entry (sponsors row). */
const identFromLibrary = (lib) => Object.fromEntries(IDENT_KEYS.map((k) => [k, str(lib?.[k])]));

/** Identity/billing fields of a per-year row (joined display columns of useBaseballSponsors). */
const identFromRow = (row) => ({
  ...identFromLibrary(row),
  name: str(row?.sp_name ?? row?.name),
  contact_name: str(row?.sp_contact ?? row?.contact_name),
});

const yearFromRow = (row) => ({
  status: row?.status || 'offen',
  art: str(row?.art),
  amount: row?.amount == null || row?.amount === '' ? '' : String(row.amount),
  invoiced: !!Number(row?.invoiced),
  paid: !!Number(row?.paid),
  special: str(row?.special),
  material_out: str(row?.material_out),
});

/** Changed identity fields (trimmed) compared with `initial`; {} when nothing changed. */
const identPatch = (ident, initial) => Object.fromEntries(
  IDENT_KEYS
    .filter((k) => str(ident[k]).trim() !== str(initial[k]).trim())
    .map((k) => [k, str(ident[k]).trim()])
);

/**
 * Add / edit popup of a Baseballturnier sponsor.
 *
 * Props:
 *   open        default true; false renders nothing
 *   year        scout year
 *   yearLocked  locked year: all inputs disabled, no Save
 *   library     rows of `sponsors` (null while loading; falls back to the hook's own load)
 *   rows        per-year rows of this year (null while loading; same fallback)
 *   editing     a per-year row (from useBaseballSponsors rows) or null for a new one
 *   onClose()   Abbrechen / Escape
 *   onSaved()   after a successful save (the dialog does not close itself; the parent closes it)
 *   onError(msg)
 */
const BaseballSponsorModal = ({
  open = true, year, yearLocked, library: libraryProp, rows: rowsProp, editing, onClose, onSaved, onError,
}) => {
  const sponsors = useBaseballSponsors(year, yearLocked, onError);
  const library = libraryProp ?? sponsors.library ?? [];
  const rows = useMemo(() => rowsProp ?? sponsors.rows ?? [], [rowsProp, sponsors.rows]);
  const isEdit = !!editing;

  const initialIdent = useMemo(() => (editing ? identFromRow(editing) : EMPTY_IDENT), [editing]);
  const [mode, setMode] = useState('library');
  const [newIdent, setNewIdent] = useState(() => (editing ? identFromRow(editing) : { ...EMPTY_IDENT }));
  const [selectedId, setSelectedId] = useState(null);
  const [libIdent, setLibIdent] = useState({ ...EMPTY_IDENT });
  const [libEditing, setLibEditing] = useState(false);
  const [yearFields, setYearFields] = useState(() => yearFromRow(editing));
  const [duplicate, setDuplicate] = useState(null);
  const [nameError, setNameError] = useState('');
  const [saving, setSaving] = useState(false);
  const createdIdRef = useRef(null); // library entry created by a save whose year row then failed

  const modalRef = useRef(null);
  const nameRef = useRef(null);
  useFocusTrap(modalRef, { active: open });

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const usedIds = useMemo(
    () => new Set(rows.map((r) => r.sponsor_id || r.library_id).filter(Boolean)),
    [rows]
  );
  const selected = library.find((l) => l.id === selectedId) || null;
  const selectedUsed = !!selected && usedIds.has(selected.id);

  if (!open) return null;

  const setYear = (key, value) => setYearFields((f) => ({ ...f, [key]: value }));
  const setNew = (key, value) => {
    setNewIdent((f) => ({ ...f, [key]: value }));
    if (key === 'name') { setDuplicate(null); setNameError(''); }
  };
  const setLib = (key, value) => setLibIdent((f) => ({ ...f, [key]: value }));

  const pickLibrary = (lib) => {
    setSelectedId(lib?.id ?? null);
    setLibIdent(lib ? identFromLibrary(lib) : { ...EMPTY_IDENT });
    setLibEditing(false);
  };

  // Duplicate check of a name. Edit mode: other library entries only (renaming onto an existing name is refused).
  const checkDuplicate = (name) => {
    if (isEdit) {
      const own = editing.sponsor_id || editing.library_id;
      if (!own) return null; // an unlinked row is linked to an entry of the same name on save
      return findDuplicate(library.filter((l) => l.id !== own), name);
    }
    return findDuplicate(library, name);
  };

  const handleNameBlur = () => {
    if (!nameKey(newIdent.name)) return;
    if (isEdit) {
      setNameError(checkDuplicate(newIdent.name) ? 'Diesen Namen gibt es schon in der Bibliothek.' : '');
    } else {
      setDuplicate(checkDuplicate(newIdent.name));
    }
  };

  const useExisting = () => {
    if (!duplicate) return;
    setMode('library');
    pickLibrary(duplicate);
    setDuplicate(null);
  };

  const changeName = () => {
    setDuplicate(null);
    nameRef.current?.focus();
    nameRef.current?.select();
  };

  const yearPayload = () => {
    const amount = Number(String(yearFields.amount).replace(',', '.'));
    return {
      status: yearFields.status || 'offen',
      art: yearFields.art || '',
      amount: Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0,
      invoiced: yearFields.invoiced ? 1 : 0,
      paid: yearFields.paid ? 1 : 0,
      special: yearFields.special.trim(),
      material_out: yearFields.material_out.trim(),
    };
  };

  const save = async () => {
    const fields = yearPayload();

    if (isEdit) {
      if (!nameKey(newIdent.name)) { setNameError('Bitte einen Namen eingeben.'); return false; }
      if (checkDuplicate(newIdent.name)) { setNameError('Diesen Namen gibt es schon in der Bibliothek.'); return false; }
      if (!(await sponsors.updateYearRow(editing.id, fields))) return false;
      const patch = identPatch(newIdent, initialIdent);
      if (!Object.keys(patch).length) return true;
      const libId = editing.sponsor_id || editing.library_id;
      if (libId) return sponsors.updateLibrary(libId, patch);
      const data = Object.fromEntries(IDENT_KEYS.map((k) => [k, str(newIdent[k]).trim()]));
      return (await sponsors.linkOrCreate(editing.id, data)) !== null;
    }

    if (mode === 'library') {
      if (!selected) { onError?.('Bitte einen Sponsor aus der Bibliothek wählen.'); return false; }
      if (selectedUsed) return false;
      if (libEditing) {
        if (!nameKey(libIdent.name)) { onError?.('Bitte einen Namen eingeben.'); return false; }
        const patch = identPatch(libIdent, identFromLibrary(selected));
        if (Object.keys(patch).length && !(await sponsors.updateLibrary(selected.id, patch))) return false;
      }
      return sponsors.addYearRow(selected.id, fields);
    }

    // Neu
    if (!nameKey(newIdent.name)) { setNameError('Bitte einen Namen eingeben.'); nameRef.current?.focus(); return false; }
    let libraryId = createdIdRef.current;
    if (!libraryId) {
      const dup = findDuplicate(library, newIdent.name);
      if (dup) { setDuplicate(dup); return false; }
      const data = Object.fromEntries(IDENT_KEYS.map((k) => [k, str(newIdent[k]).trim()]));
      const result = await sponsors.createLibrary(data);
      if (!result) return false;
      if (result.duplicate) { setDuplicate(result.duplicate); return false; }
      libraryId = result.id;
      createdIdRef.current = libraryId;
    }
    return sponsors.addYearRow(libraryId, fields);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (yearLocked || saving) return;
    setSaving(true);
    const ok = await save();
    setSaving(false);
    if (ok) {
      onSaved?.();
      onClose?.();
    }
  };

  const title = isEdit ? 'Sponsor bearbeiten' : 'Sponsor hinzufügen';
  const saveBlocked = !isEdit && (
    (mode === 'library' && (!selected || selectedUsed))
    || (mode === 'new' && !!duplicate)
  );

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bb-sponsor-modal-title">
      <div className="modal-content bb-sponsor-modal" ref={modalRef}>
        <h2 id="bb-sponsor-modal-title">{title}</h2>
        <form onSubmit={handleSubmit} noValidate>
          <fieldset className="bb-sponsor-fieldset" disabled={yearLocked}>
            {yearLocked && (
              <div className="bb-sponsor-hint">
                <Info size={14} aria-hidden="true" />
                <span>Das Jahr ist gesperrt. Änderungen sind nicht möglich.</span>
              </div>
            )}

            {!isEdit && (
              <SegmentedToggle
                options={MODES}
                value={mode}
                onChange={(m) => { setMode(m); setDuplicate(null); setNameError(''); }}
                ariaLabel="Sponsor wählen oder neu anlegen"
              />
            )}

            {!isEdit && mode === 'library' && (
              <LibrarySection
                library={library}
                usedIds={usedIds}
                selected={selected}
                selectedUsed={selectedUsed}
                onPick={pickLibrary}
                ident={libIdent}
                setIdent={setLib}
                editable={libEditing}
                onToggleEditable={() => {
                  if (libEditing && selected) setLibIdent(identFromLibrary(selected));
                  setLibEditing((v) => !v);
                }}
                disabled={yearLocked}
              />
            )}

            {(isEdit || mode === 'new') && (
              <>
                {duplicate && (
                  <div className="bb-sponsor-duplicate" role="alert">
                    <AlertCircle size={16} aria-hidden="true" />
                    <span className="bb-sponsor-duplicate-text">
                      „{duplicate.name}“ gibt es schon in der Bibliothek. Vorhandenen verwenden?
                    </span>
                    <div className="bb-sponsor-duplicate-actions">
                      <Button variant="primary" size="sm" type="button" onClick={useExisting}>Vorhandenen verwenden</Button>
                      <Button variant="ghost" size="sm" type="button" onClick={changeName}>Name ändern</Button>
                    </div>
                  </div>
                )}
                <IdentityFields
                  ident={newIdent}
                  setIdent={setNew}
                  nameRef={nameRef}
                  nameError={nameError}
                  onNameBlur={handleNameBlur}
                  disabled={yearLocked}
                />
                {isEdit && (editing.sponsor_id || editing.library_id) && (
                  <div className="bb-sponsor-hint">
                    <Info size={14} aria-hidden="true" />
                    <span>Änderungen an Name, Kontakt und Rechnungsdaten gelten für alle Jahre.</span>
                  </div>
                )}
              </>
            )}

            <YearSection fields={yearFields} setField={setYear} disabled={yearLocked} />
          </fieldset>

          <div className="modal-actions">
            <Button variant="ghost" type="button" onClick={onClose}>Abbrechen</Button>
            {!yearLocked && (
              <Button variant="primary" type="submit" disabled={saving || saveBlocked}>
                {saving ? 'Speichern…' : 'Speichern'}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

/** Name, Kontakt, Telefon, E-Mail + Rechnungsdaten. */
const IdentityFields = ({ ident, setIdent, nameRef, nameError, onNameBlur, disabled, readOnly = false }) => {
  const field = (key, label, extra = {}) => (
    <Input
      label={label}
      value={ident[key]}
      onChange={(e) => setIdent(key, e.target.value)}
      disabled={disabled}
      readOnly={readOnly}
      {...extra}
    />
  );
  return (
    <div className="bb-sponsor-ident">
      {field('name', 'Name', {
        required: !readOnly,
        error: nameError || undefined,
        onBlur: onNameBlur,
        ...(nameRef ? { ref: nameRef } : {}),
      })}
      <div className="form-row">
        {field('contact_name', 'Kontakt (Ansprechpartner)')}
        {field('phone', 'Telefon')}
      </div>
      {field('email', 'E-Mail', { type: 'email' })}
      <div className="address-section">
        <div className="bb-sponsor-section-title">Rechnungsdaten</div>
        {field('address_street', 'Straße')}
        <div className="form-row three-col">
          {field('address_zip', 'PLZ')}
          {field('address_city', 'Ort')}
          {field('address_country', 'Land')}
        </div>
        <div className="form-row">
          {field('vat_number', 'UID/MwSt-Nr.')}
        </div>
      </div>
    </div>
  );
};

/** Searchable list of library sponsors + read-only (or editable) data of the picked one. */
const LibrarySection = ({
  library, usedIds, selected, selectedUsed, onPick, ident, setIdent, editable, onToggleEditable, disabled,
}) => {
  const autoId = useId();
  const inputId = `bb-sponsor-lib-${autoId}`;
  const listId = `${inputId}-list`;
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [focusIdx, setFocusIdx] = useState(-1);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const q = nameKey(search);
  const filtered = library.filter((l) => nameKey(l.name).includes(q));

  const closeList = () => { setOpen(false); setSearch(''); setFocusIdx(-1); };
  const choose = (lib) => {
    if (!lib || usedIds.has(lib.id)) return;
    onPick(lib);
    closeList();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (open) { e.preventDefault(); e.stopPropagation(); closeList(); }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); setFocusIdx(0); return; }
      setFocusIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (!open) return;
      e.preventDefault();
      if (focusIdx >= 0) choose(filtered[focusIdx]);
    } else if (e.key === 'Tab' && open) {
      closeList();
    }
  };

  const optionId = (lib) => `${listId}-${lib.id}`;
  const activeDescendant = open && focusIdx >= 0 && filtered[focusIdx] ? optionId(filtered[focusIdx]) : undefined;

  return (
    <div className="bb-sponsor-library">
      <div className="client-picker" ref={wrapRef}>
        <label className="input-label" htmlFor={inputId}>Sponsor aus der Bibliothek</label>
        <div className="client-picker-control">
          <input
            id={inputId}
            className="client-picker-input"
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeDescendant}
            autoComplete="off"
            placeholder="Sponsor suchen…"
            disabled={disabled}
            value={open ? search : (selected?.name || '')}
            onChange={(e) => { setSearch(e.target.value); setFocusIdx(-1); if (!open) setOpen(true); }}
            onFocus={() => { setSearch(''); setFocusIdx(-1); setOpen(true); }}
            onClick={() => { if (!open) { setSearch(''); setFocusIdx(-1); setOpen(true); } }}
            onKeyDown={handleKeyDown}
          />
        </div>
        {open && (
          <ul className="client-picker-list" id={listId} role="listbox" aria-label="Bibliothek">
            {filtered.length === 0 && (
              <li className="client-picker-empty" role="presentation">
                {library.length ? 'Kein Sponsor gefunden' : 'Die Bibliothek ist noch leer.'}
              </li>
            )}
            {filtered.map((lib, i) => {
              const used = usedIds.has(lib.id);
              const isSel = selected?.id === lib.id;
              return (
                <li
                  key={lib.id}
                  id={optionId(lib)}
                  role="option"
                  aria-selected={isSel}
                  aria-disabled={used || undefined}
                  className={`client-picker-option${isSel ? ' is-selected' : ''}${i === focusIdx ? ' is-focused' : ''}${used ? ' bb-sponsor-option--used' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); choose(lib); }}
                >
                  <span className="client-picker-name">{lib.name}</span>
                  {used
                    ? <span className="bb-sponsor-used-tag">bereits in diesem Jahr</span>
                    : isSel && <Check size={12} className="client-picker-check" aria-hidden="true" />}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selected && selectedUsed && (
        <div className="bb-sponsor-hint bb-sponsor-hint--warn">
          <AlertCircle size={14} aria-hidden="true" />
          <span>„{selected.name}“ ist bereits in diesem Jahr eingetragen.</span>
        </div>
      )}

      {selected && (
        <>
          <div className="bb-sponsor-lib-head">
            <span className="bb-sponsor-section-title">Bibliotheksdaten</span>
            <label className="bb-sponsor-check bb-sponsor-check--small">
              <input type="checkbox" checked={editable} onChange={onToggleEditable} disabled={disabled} />
              <span>Bibliothekseintrag bearbeiten</span>
            </label>
          </div>
          {editable && (
            <div className="bb-sponsor-hint bb-sponsor-hint--warn">
              <AlertCircle size={14} aria-hidden="true" />
              <span>Änderungen am Bibliothekseintrag gelten für alle Jahre.</span>
            </div>
          )}
          <IdentityFields
            ident={ident}
            setIdent={setIdent}
            disabled={disabled}
            readOnly={!editable}
          />
        </>
      )}
    </div>
  );
};

/** Per-year data: Status, Art, Betrag, Rechnung gestellt, Überwiesen, Sonderabsprache, Material. */
const YearSection = ({ fields, setField, disabled }) => (
  <div className="bb-sponsor-year">
    <div className="bb-sponsor-section-title">Dieses Jahr</div>
    <div className="form-row three-col">
      <div className="input-group">
        <span className="input-label">Status</span>
        <div className="bb-sponsor-status">
          <SponsorStatusIcon status={fields.status} />
          <StyledSelect
            value={fields.status}
            onChange={(e) => setField('status', e.target.value)}
            disabled={disabled}
            className="bb-sponsor-select"
            portal
          >
            {SPONSOR_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </StyledSelect>
        </div>
      </div>
      <div className="input-group">
        <span className="input-label">Art</span>
        <StyledSelect
          value={fields.art}
          onChange={(e) => setField('art', e.target.value)}
          placeholder="—"
          disabled={disabled}
          className="bb-sponsor-select"
          portal
        >
          <option value="">—</option>
          {SPONSOR_ART.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </StyledSelect>
      </div>
      <div className="input-group">
        <label className="input-label" htmlFor="bb-sponsor-amount">Betrag</label>
        <DecimalInput
          id="bb-sponsor-amount"
          min="0"
          className="input-field"
          value={fields.amount}
          placeholder="0,00"
          disabled={disabled}
          onChange={(e) => setField('amount', e.target.value)}
          onFocus={(e) => e.target.select()}
        />
      </div>
    </div>
    <div className="bb-sponsor-checks">
      <label className="bb-sponsor-check">
        <input type="checkbox" checked={fields.invoiced} disabled={disabled}
          onChange={(e) => setField('invoiced', e.target.checked)} />
        <span>Rechnung gestellt</span>
      </label>
      <label className="bb-sponsor-check">
        <input type="checkbox" checked={fields.paid} disabled={disabled}
          onChange={(e) => setField('paid', e.target.checked)} />
        <span>Überwiesen</span>
      </label>
    </div>
    <Input
      label="Werbematerial"
      value={fields.material_out}
      onChange={(e) => setField('material_out', e.target.value)}
      disabled={disabled}
    />
  </div>
);

export default BaseballSponsorModal;
