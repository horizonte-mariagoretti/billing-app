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
    // Bail out (no re-render) when nothing visibly changed.
    setThumb((p) => (
      p.visible && Math.abs(p.top - top) < 0.5 && Math.abs(p.height - height) < 0.5
        ? p
        : { top, height, visible: true }
    ));
  }, []);

  // Coalesce bursts (scroll, resize, DOM churn) into one measurement per frame.
  const rafRef = useRef(0);
  const scheduleUpdate = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; update(); });
  }, [update]);

  const flash = useCallback(() => {
    setActive(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setActive(false), 900);
  }, []);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return undefined;
    update();
    const ro = new ResizeObserver(scheduleUpdate);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    // Direct children only: a page swap replaces them; inner churn is caught
    // by the ResizeObserver on the child when its height actually changes.
    const mo = new MutationObserver(() => {
      Array.from(el.children).forEach((c) => ro.observe(c));
      scheduleUpdate();
    });
    mo.observe(el, { childList: true });
    return () => {
      ro.disconnect(); mo.disconnect();
      clearTimeout(hideTimer.current);
      cancelAnimationFrame(rafRef.current); rafRef.current = 0;
    };
  }, [update, scheduleUpdate]);

  const onScroll = () => { scheduleUpdate(); if (!active) flash(); else { clearTimeout(hideTimer.current); hideTimer.current = setTimeout(() => setActive(false), 900); } };

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
