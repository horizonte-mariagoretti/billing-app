import React, { useLayoutEffect, useRef, useState } from 'react';
import './SegmentedToggle.css';

/**
 * Pill-style view switcher with a sliding highlight.
 * options: [{ value, label, icon?: ReactNode, count?: number }]
 */
const SegmentedToggle = ({ options, value, onChange, ariaLabel, className = '' }) => {
  const trayRef = useRef(null);
  const [thumb, setThumb] = useState(null); // { left, width } | null until measured
  const [ready, setReady] = useState(false); // skip the transition on first paint

  useLayoutEffect(() => {
    const measure = () => {
      const tray = trayRef.current;
      const el = tray?.querySelector('[aria-selected="true"]');
      if (!tray || !el) return;
      setThumb({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    const raf = requestAnimationFrame(() => setReady(true));
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && trayRef.current) {
      ro.observe(trayRef.current);
      trayRef.current.querySelectorAll('button').forEach((b) => ro.observe(b));
    }
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); };
  }, [value, options]);

  return (
    <div ref={trayRef} className={`seg-toggle ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
      {thumb && (
        <span
          className={`seg-toggle-thumb${ready ? ' animated' : ''}`}
          style={{ transform: `translateX(${thumb.left}px)`, width: thumb.width }}
          aria-hidden="true"
        />
      )}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={`seg-toggle-btn${value === o.value ? ' active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.icon}
          {o.label}
          {o.count != null && <span className="seg-toggle-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
};

export default SegmentedToggle;
