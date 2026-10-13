import React, { useState } from 'react';

// German-style decimal field: the user types and sees a comma (12,5), while
// callers keep working with plain dot numbers — onChange receives an
// event-like { target: { value: '12.5', name } }, so existing handlers that
// do parseFloat(e.target.value) / store the string work unchanged.
// A native <input type="number"> can't do this: it follows the browser
// locale, so the separator would depend on the user's OS language.

const toDisplay = (v) => (v === '' || v == null ? '' : String(v).replace('.', ','));
const toNumber = (s) => {
  const n = parseFloat(String(s ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const DecimalInput = React.forwardRef(({
  value,
  onChange,
  onBlur,
  min,
  max, // eslint-disable-line no-unused-vars -- accepted so callers can keep their number-input props
  step, // eslint-disable-line no-unused-vars
  ...rest
}, ref) => {
  const [text, setText] = useState(() => toDisplay(value));
  const allowNegative = min !== undefined && Number(min) < 0;

  // Re-sync when the value is changed from outside (arrow keys, loading a
  // record, clamping) — but not while the typed text already means the same
  // number, so "1," doesn't collapse to "1" mid-typing. Done during render
  // (not in an effect) so the field never paints a stale value.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    const ext = value === '' || value == null ? null : Number(value);
    if (toNumber(text) !== ext) setText(toDisplay(value));
  }

  const handleChange = (e) => {
    let raw = e.target.value;
    // typed dot -> comma; "1.234,56" (pasted German thousands) -> "1234,56"
    raw = raw.includes(',') ? raw.replace(/\./g, '') : raw.replace(/\./g, ',');
    const pattern = allowNegative ? /^-?\d*,?\d*$/ : /^\d*,?\d*$/;
    if (!pattern.test(raw)) return;
    setText(raw);
    onChange?.({ target: { value: raw.replace(',', '.'), name: rest.name } });
  };

  const handleBlur = (e) => {
    const n = toNumber(text);
    setText(n === null ? '' : toDisplay(n));
    onBlur?.(e);
  };

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
});

DecimalInput.displayName = 'DecimalInput';

export default DecimalInput;
