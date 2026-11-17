import { useState, useEffect } from 'react';
import { Trash2, Pencil, Check } from 'lucide-react';

// Inline cells of the Baseball tables. A text, date or number cell saves when it loses focus, and only if it changed.
// Numbers are typed with a comma as in the rest of the app (a native number field follows the OS language).
const show = (v, isNum) => (isNum ? String(v ?? '').replace('.', ',') : (v ?? ''));

export const TextCell = ({ value, onSave, disabled, label, placeholder = '', type = 'text', align = 'left' }) => {
  const isNum = type === 'number';
  const [draft, setDraft] = useState(show(value, isNum));
  // eslint-disable-next-line react-hooks/set-state-in-effect -- local draft follows its prop
  useEffect(() => { setDraft(show(value, isNum)); }, [value, isNum]);

  const commit = () => {
    if (isNum) {
      const next = draft.trim() === '' ? 0 : Number(draft.replace(',', '.'));
      if (!Number.isFinite(next)) { setDraft(show(value, true)); return; }
      if (next !== Number(value ?? 0)) onSave(next);
      return;
    }
    const next = draft.trim();
    if (next !== (value ?? '')) onSave(next);
  };

  return (
    <input
      type={isNum ? 'text' : type}
      inputMode={isNum ? 'decimal' : undefined}
      className={`input-field baseball-cell${align === 'right' ? ' baseball-cell--num' : ''}`}
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
    />
  );
};

// A check mark that saves at once: rounded square, filled with the accent colour when checked.
// A native button, so Space and Enter toggle it; role="checkbox" tells screen readers what it is.
export const CheckCell = ({ checked, onChange, disabled, label }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={!!checked}
    aria-label={label}
    title={label}
    className={`baseball-check${checked ? ' baseball-check--on' : ''}`}
    disabled={disabled}
    onClick={() => onChange(!checked)}
  >
    {!!checked && <Check size={13} strokeWidth={3} aria-hidden="true" />}
  </button>
);

// Row action icons: the same plain icon buttons as the Glühweinbude and Lasagnen tables (.baseball-row-actions).
export const DeleteButton = ({ label, disabled, onClick }) => (
  <button type="button" className="baseball-row-btn" disabled={disabled} aria-label={label} title={label} onClick={onClick}>
    <Trash2 size={15} />
  </button>
);

export const EditButton = ({ label, disabled, onClick }) => (
  <button type="button" className="baseball-row-btn" disabled={disabled} aria-label={label} title={label} onClick={onClick}>
    <Pencil size={15} />
  </button>
);

