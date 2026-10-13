import React, { useState, useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus, X } from 'lucide-react';
import ClientModal from './ClientModal';
import { useT } from '../hooks/useUiTranslations';
import './ClientPicker.css';

/**
 * Searchable client combobox with a "create new client" entry (opens
 * ClientModal) — same behaviour as the client field in DocumentEditor, but
 * reusable and self-contained.
 *
 * Props:
 *   clients          [{ id, name }]
 *   value            selected client id ('' / null = none)
 *   onChange(id)     called with the picked id ('' when cleared)
 *   onClientCreated(client)  called with the newly created client (incl. id)
 *                    so the parent can add it to its list; it is then selected.
 *   label            optional visible label
 */
const ClientPicker = ({ clients = [], value, onChange, onClientCreated, label, id: idProp }) => {
  const t = useT();
  const autoId = useId();
  const inputId = idProp || `client-picker-${autoId}`;
  const listId = `${inputId}-list`;

  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  // ClientModal hands focus back to the input when it closes; without this the
  // input's onFocus would re-open the dropdown right after a client was created.
  const skipFocusOpenRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [focusIdx, setFocusIdx] = useState(-1);
  const [showModal, setShowModal] = useState(false);

  const selected = clients.find((c) => String(c.id) === String(value)) || null;

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // ClientModal has no Escape handling of its own — close it here.
  useEffect(() => {
    if (!showModal) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setShowModal(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showModal]);

  const q = search.trim().toLowerCase();
  const filtered = clients.filter((c) => (c.name || '').toLowerCase().includes(q));

  // Flat option list for keyboard navigation: [clear?] + clients + create.
  const entries = [
    ...(selected ? [{ kind: 'clear', key: '__clear' }] : []),
    ...filtered.map((c) => ({ kind: 'client', key: String(c.id), client: c })),
    { kind: 'create', key: '__create' },
  ];

  const closeList = () => { setOpen(false); setSearch(''); setFocusIdx(-1); };

  const choose = (entry) => {
    if (!entry) return;
    if (entry.kind === 'clear') onChange?.('');
    else if (entry.kind === 'client') onChange?.(entry.client.id);
    else if (entry.kind === 'create') { closeList(); setShowModal(true); return; }
    closeList();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (open) { e.preventDefault(); closeList(); }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); setFocusIdx(0); return; }
      setFocusIdx((i) => Math.min(i + 1, entries.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (!open) return;
      e.preventDefault();
      if (focusIdx >= 0) choose(entries[focusIdx]);
    } else if (e.key === 'Tab' && open) {
      closeList();
    }
  };

  const optionId = (entry) => `${listId}-${entry.key}`;
  const activeDescendant = open && focusIdx >= 0 && entries[focusIdx] ? optionId(entries[focusIdx]) : undefined;

  return (
    <div className="client-picker" ref={wrapRef}>
      {label && <label className="input-label" htmlFor={inputId}>{label}</label>}
      <div className="client-picker-control">
        <input
          ref={inputRef}
          id={inputId}
          className="client-picker-input"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeDescendant}
          autoComplete="off"
          placeholder={t('editor_select_client', 'Kunden suchen…')}
          value={open ? search : (selected?.name || '')}
          onChange={(e) => {
            setSearch(e.target.value);
            setFocusIdx(-1);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            if (skipFocusOpenRef.current) { skipFocusOpenRef.current = false; return; }
            setSearch(''); setFocusIdx(-1); setOpen(true);
          }}
          onClick={() => { if (!open) { setSearch(''); setFocusIdx(-1); setOpen(true); } }}
          onKeyDown={handleKeyDown}
        />
        {selected && !open && (
          <button
            type="button"
            className="client-picker-clear"
            onClick={() => { onChange?.(''); inputRef.current?.focus(); }}
            aria-label={t('client_picker_clear', 'Kunde entfernen')}
            title={t('client_picker_clear', 'Kunde entfernen')}
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      {open && (
        <ul className="client-picker-list" id={listId} role="listbox" aria-label={label || t('arbeiten_field_client', 'Kunde')}>
          {entries.map((entry, i) => {
            const focused = i === focusIdx;
            if (entry.kind === 'clear') {
              return (
                <li
                  key={entry.key}
                  id={optionId(entry)}
                  role="option"
                  aria-selected={false}
                  className={`client-picker-option client-picker-option--muted${focused ? ' is-focused' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); choose(entry); }}
                >
                  {t('client_picker_none', '— Kein Kunde —')}
                </li>
              );
            }
            if (entry.kind === 'create') {
              return (
                <React.Fragment key={entry.key}>
                {filtered.length === 0 && q && (
                  <li className="client-picker-empty" role="presentation">
                    {t('client_picker_no_match', 'Kein Kunde gefunden')}
                  </li>
                )}
                <li
                  id={optionId(entry)}
                  role="option"
                  aria-selected={false}
                  className={`client-picker-option client-picker-option--create${focused ? ' is-focused' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); choose(entry); }}
                >
                  <Plus size={13} aria-hidden="true" />
                  <span>{t('editor_create_new_client', 'Neuen Kunden anlegen')}</span>
                </li>
                </React.Fragment>
              );
            }
            const isSel = selected && String(entry.client.id) === String(selected.id);
            return (
              <li
                key={entry.key}
                id={optionId(entry)}
                role="option"
                aria-selected={!!isSel}
                className={`client-picker-option${isSel ? ' is-selected' : ''}${focused ? ' is-focused' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); choose(entry); }}
              >
                <span className="client-picker-name">{entry.client.name}</span>
                {isSel && <Check size={12} className="client-picker-check" aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}

      {/* Portalled to <body> so it isn't clipped by a scrolling parent modal.
          React still bubbles synthetic events through portals, so stop the
          ClientModal's submit here — otherwise it would also submit a parent
          <form> (e.g. JobModal). */}
      {showModal && createPortal(
        <div className="client-picker-portal" onSubmit={(e) => e.stopPropagation()}>
        <ClientModal
          editingClient={null}
          triggerRef={inputRef}
          onSave={(newClient) => {
            skipFocusOpenRef.current = true;
            setTimeout(() => { skipFocusOpenRef.current = false; }, 400);
            setShowModal(false);
            onClientCreated?.(newClient);
            onChange?.(newClient.id);
            closeList(); // otherwise the field keeps showing the (empty) search text instead of the new name
          }}
          onCancel={() => {
            skipFocusOpenRef.current = true;
            setTimeout(() => { skipFocusOpenRef.current = false; }, 400);
            setShowModal(false);
          }}
        />
        </div>,
        document.body
      )}
    </div>
  );
};

export default ClientPicker;
