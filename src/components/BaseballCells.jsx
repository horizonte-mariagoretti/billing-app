import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import Button from './Button';

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

// A checkbox that saves at once.
export const CheckCell = ({ checked, onChange, disabled, label }) => (
  <input
    type="checkbox"
    className="baseball-check"
    checked={!!checked}
    disabled={disabled}
    aria-label={label}
    onChange={(e) => onChange(e.target.checked)}
  />
);

export const DeleteButton = ({ label, disabled, onClick }) => (
  <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={label} title={label} onClick={onClick}>
    <Trash2 size={14} />
  </Button>
);

export const money = (value, locale = 'de-DE') => Number(value || 0).toLocaleString(locale, { style: 'currency', currency: 'EUR' });
