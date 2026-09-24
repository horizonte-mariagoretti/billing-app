import React from 'react';
import { ChevronDown, Check } from 'lucide-react';
import './StyledSelect.css';

// Fully custom-rendered dropdown (not a native <select>) so the open list
// matches the app's own styling instead of the OS-native popup — used
// anywhere a <select>'s unstylable native dropdown would look out of place.
const StyledSelect = ({ value, onChange, children, placeholder, className = '', disabled = false }) => {
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
    .map((c) => ({ value: c.props.value ?? '', label: c.props.children }));
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
              {String(opt.value) === String(value) && <Check size={12} className="ss-check" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default StyledSelect;
