import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Trash2 } from 'lucide-react';
import './StyledSelect.css';

const LIST_MAX_HEIGHT = 260;
const LIST_GAP = 4;
const VIEWPORT_MARGIN = 8;

// Fixed position of a portaled list from the trigger's rect: below, or above when there is not enough
// room below and more room above. max-height shrinks to the room on the chosen side.
const portalPosition = (trigger) => {
  const r = trigger.getBoundingClientRect();
  const below = window.innerHeight - r.bottom - LIST_GAP - VIEWPORT_MARGIN;
  const above = r.top - LIST_GAP - VIEWPORT_MARGIN;
  const up = below < LIST_MAX_HEIGHT && above > below;
  const style = {
    position: 'fixed',
    left: r.left,
    // At least as wide as the trigger; wider when an option needs it (narrow table cells), within the viewport.
    minWidth: r.width,
    width: 'max-content',
    maxWidth: Math.max(r.width, window.innerWidth - r.left - VIEWPORT_MARGIN),
    maxHeight: Math.max(80, Math.min(LIST_MAX_HEIGHT, up ? above : below)),
  };
  if (up) style.bottom = window.innerHeight - r.top + LIST_GAP;
  else style.top = r.bottom + LIST_GAP;
  return style;
};

// Fully custom-rendered dropdown (not a native <select>) so the open list
// matches the app's own styling instead of the OS-native popup — used
// anywhere a <select>'s unstylable native dropdown would look out of place.
// onRemove(value): when given, each option shows a delete button; an <option fixed> gets none.
// portal: render the open list in document.body (position fixed from the trigger), so no ancestor with
// overflow hidden/auto can cut it off; it flips upward when there is no room below. Escape closes it.
// dropdownClassName: extra class on the open list (needed for scoped styling when portaled).
const StyledSelect = ({
  value, onChange, onRemove, children, placeholder, className = '', disabled = false,
  portal = false, dropdownClassName = '',
}) => {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState(null);
  const ref = React.useRef(null);
  const listRef = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current?.contains(e.target) || listRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // Portal: the position is set when opening (toggle); while open it follows scrolling and resizing.
  React.useEffect(() => {
    if (!open || !portal) return;
    const update = () => { if (ref.current) setPos(portalPosition(ref.current)); };
    // Scrolling an ancestor (capture: any scroll container) or resizing moves the trigger: follow it.
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, portal]);

  const toggle = () => {
    if (disabled) return;
    if (!open && portal && ref.current) setPos(portalPosition(ref.current));
    setOpen(!open);
  };

  const options = React.Children.toArray(children)
    .filter((c) => c.type === 'option')
    .map((c) => ({ value: c.props.value ?? '', label: c.props.children, fixed: !!c.props.fixed, disabled: !!c.props.disabled, title: c.props.title }));
  const sel = options.find((o) => String(o.value) === String(value));
  const isEmpty = !sel || String(sel.value) === '';

  const list = (
    <ul
      ref={listRef}
      className={`ss-dropdown${portal ? ' ss-dropdown--portal' : ''}${dropdownClassName ? ' ' + dropdownClassName : ''}`}
      role="listbox"
      style={portal ? pos || { visibility: 'hidden' } : undefined}
    >
      {options.map((opt) => (
        <li
          key={String(opt.value)}
          role="option"
          aria-selected={String(opt.value) === String(value)}
          aria-disabled={opt.disabled || undefined}
          title={opt.title}
          className={`ss-option${String(opt.value) === String(value) ? ' ss-option--selected' : ''}${opt.disabled ? ' ss-option--disabled' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); if (opt.disabled) return; onChange({ target: { value: opt.value } }); setOpen(false); }}
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
  );

  return (
    <div ref={ref} className={`ss-root${open ? ' ss-open' : ''}${disabled ? ' ss-disabled' : ''}${className ? ' ' + className : ''}`}>
      <button type="button" className="ss-trigger" onClick={toggle} disabled={disabled}>
        <span className={isEmpty ? 'ss-placeholder' : ''}>{sel?.label || placeholder || ''}</span>
        <ChevronDown size={14} className="ss-chevron" />
      </button>
      {open && (portal ? createPortal(list, document.body) : list)}
    </div>
  );
};

export default StyledSelect;
