import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Scroll container with a visible but space-free (overlay) scrollbar.
 * The native bar is hidden; a thin thumb floats over the right edge, fades
 * in while scrolling / hovering and can be dragged or clicked.
 */
const MIN_THUMB = 36;

const OverlayScrollArea = ({ className = '', children }) => {
  const bodyRef = useRef(null);
  const [thumb, setThumb] = useState({ top: 0, height: 0, visible: false });
  const [active, setActive] = useState(false);
  const hideTimer = useRef(null);
  const drag = useRef(null);

  const update = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 1) {
      setThumb((p) => (p.visible ? { top: 0, height: 0, visible: false } : p));
      return;
    }
    const height = Math.max(MIN_THUMB, (clientHeight / scrollHeight) * clientHeight);
    const top = (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - height);
    setThumb({ top, height, visible: true });
  }, []);

  const flash = useCallback(() => {
    setActive(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setActive(false), 900);
  }, []);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return undefined;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    const mo = new MutationObserver(() => {
      Array.from(el.children).forEach((c) => ro.observe(c));
      update();
    });
    mo.observe(el, { childList: true, subtree: true });
    return () => { ro.disconnect(); mo.disconnect(); clearTimeout(hideTimer.current); };
  }, [update]);

  const onScroll = () => { update(); flash(); };

  const onThumbDown = (e) => {
    e.preventDefault();
    const el = bodyRef.current;
    drag.current = { startY: e.clientY, startScroll: el.scrollTop };
    setActive(true);
    const move = (ev) => {
      const d = drag.current;
      if (!d) return;
      const ratio = (el.scrollHeight - el.clientHeight) / (el.clientHeight - thumb.height);
      el.scrollTop = d.startScroll + (ev.clientY - d.startY) * ratio;
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      flash();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onTrackDown = (e) => {
    if (e.target !== e.currentTarget) return;
    const el = bodyRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const dir = e.clientY - rect.top < thumb.top ? -1 : 1;
    el.scrollBy({ top: dir * el.clientHeight * 0.9, behavior: 'smooth' });
  };

  return (
    <div
      className="overlay-scroll"
      onMouseEnter={flash}
      onMouseMove={() => { if (thumb.visible && !active) flash(); }}
    >
      <div ref={bodyRef} className={`overlay-scroll-body ${className}`.trim()} onScroll={onScroll}>
        {children}
      </div>
      {thumb.visible && (
        <div className={`overlay-scroll-track${active ? ' active' : ''}`} onPointerDown={onTrackDown} aria-hidden="true">
          <div
            className="overlay-scroll-thumb"
            style={{ transform: `translateY(${thumb.top}px)`, height: thumb.height }}
            onPointerDown={onThumbDown}
          />
        </div>
      )}
    </div>
  );
};

export default OverlayScrollArea;
