import { useState, useEffect } from 'react';
import { Trash2, Pencil, Check } from 'lucide-react';

// Inline cells of the Baseball tables. A text, date or number cell saves when it loses focus, and only if it changed.
export const TextCell = ({ value, onSave, disabled, label, placeholder = '', type = 'text', step, align = 'left' }) => {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => { setDraft(value ?? ''); }, [value]);

  const commit = () => {
    if (type === 'number') {
      const next = draft === '' ? 0 : Number(draft);
      if (next !== Number(value ?? 0)) onSave(next);
      return;
    }
    const next = draft.trim();
    if (next !== (value ?? '')) onSave(next);
  };

  return (
    <input
      type={type}
      step={step}
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

export const money = (value, locale = 'de-DE') => Number(value || 0).toLocaleString(locale, { style: 'currency', currency: 'EUR' });
