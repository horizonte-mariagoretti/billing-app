import React from 'react';
import { ChevronDown, Check, Trash2 } from 'lucide-react';
import './StyledSelect.css';

// Fully custom-rendered dropdown (not a native <select>) so the open list
// matches the app's own styling instead of the OS-native popup — used
// anywhere a <select>'s unstylable native dropdown would look out of place.
// onRemove(value): when given, each option shows a delete button; an <option fixed> gets none.
const StyledSelect = ({ value, onChange, onRemove, children, placeholder, className = '', disabled = false }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const options = React.Children.toArray(children)
    .filter((c) => c.type === 'option')
    .map((c) => ({ value: c.props.value ?? '', label: c.props.children, fixed: !!c.props.fixed }));
  const sel = options.find((o) => String(o.value) === String(value));
  const isEmpty = !sel || String(sel.value) === '';
  return (
    <div ref={ref} className={`ss-root${open ? ' ss-open' : ''}${disabled ? ' ss-disabled' : ''}${className ? ' ' + className : ''}`}>
      <button type="button" className="ss-trigger" onClick={() => !disabled && setOpen((v) => !v)} disabled={disabled}>
        <span className={isEmpty ? 'ss-placeholder' : ''}>{sel?.label || placeholder || ''}</span>
        <ChevronDown size={14} className="ss-chevron" />
      </button>
      {open && (
        <ul className="ss-dropdown" role="listbox">
          {options.map((opt) => (
            <li
              key={String(opt.value)}
              role="option"
              aria-selected={String(opt.value) === String(value)}
              className={`ss-option${String(opt.value) === String(value) ? ' ss-option--selected' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); onChange({ target: { value: opt.value } }); setOpen(false); }}
            >
              {opt.label}
              <span className="ss-option-end">
                {String(opt.value) === String(value) && <Check size={12} className="ss-check" />}
                {onRemove && !opt.fixed && (
                  <button
                    type="button"
                    className="ss-remove"
                    title="Entfernen"
                    aria-label={`Entfernen: ${opt.label}`}
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(opt.value); setOpen(false); }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default StyledSelect;
