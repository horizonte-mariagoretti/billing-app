import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Overlay scrollbar: the native bar is hidden; a thin thumb floats over the
 * right edge, fades in while scrolling / hovering and can be dragged or
 * clicked. Two flavours share one hook:
 *   - OverlayScrollArea (default): wrapper div + scroll body; for page-level
 *     containers and lists (`as` picks the body tag, e.g. "ul").
 *   - OverlayScrollBox: the box itself scrolls (dialogs with their own
 *     padding/border); the track is a zero-height sticky child.
 */
const MIN_THUMB = 36;

function useOverlayScroll(bodyRef, externalRef) {
  const [thumb, setThumb] = useState({ top: 0, height: 0, visible: false, view: 0 });
  const [active, setActive] = useState(false);
  const hideTimer = useRef(null);
  const rafRef = useRef(0);
  const thumbRef = useRef(thumb);
  useEffect(() => { thumbRef.current = thumb; }, [thumb]);

  // eslint-disable-next-line react-hooks/immutability -- merging a caller's ref object
  const setBody = useCallback((node) => {
    bodyRef.current = node;
    if (typeof externalRef === 'function') externalRef(node);
    // eslint-disable-next-line react-hooks/immutability
    else if (externalRef) externalRef.current = node;
  }, [bodyRef, externalRef]);

  const update = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 1) {
      setThumb((p) => (p.visible ? { top: 0, height: 0, visible: false, view: 0 } : p));
      return;
    }
    const height = Math.max(MIN_THUMB, (clientHeight / scrollHeight) * clientHeight);
    const top = (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - height);
    // Bail out (no re-render) when nothing visibly changed.
    setThumb((p) => (
      p.visible && p.view === clientHeight
        && Math.abs(p.top - top) < 0.5 && Math.abs(p.height - height) < 0.5
        ? p
        : { top, height, visible: true, view: clientHeight }
    ));
  }, [bodyRef]);

  // Coalesce bursts (scroll, resize, DOM churn) into one measurement per frame.
  const scheduleUpdate = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; update(); });
  }, [update]);

  const hideSoon = useCallback(() => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setActive(false), 900);
  }, []);

  const flash = useCallback(() => { setActive(true); hideSoon(); }, [hideSoon]);

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
  }, [bodyRef, update, scheduleUpdate]);

  const onScroll = () => { scheduleUpdate(); if (active) hideSoon(); else flash(); };
  const onMouseEnter = flash;
  const onMouseMove = () => { if (thumbRef.current.visible && !active) flash(); };

  const onThumbDown = (e) => {
    e.preventDefault();
    const el = bodyRef.current;
    const start = { y: e.clientY, scroll: el.scrollTop };
    setActive(true);
    const move = (ev) => {
      const ratio = (el.scrollHeight - el.clientHeight) / (el.clientHeight - thumbRef.current.height);
      el.scrollTop = start.scroll + (ev.clientY - start.y) * ratio;
    };
    const up = () => {
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
    const dir = e.clientY - rect.top < thumbRef.current.top ? -1 : 1;
    el.scrollBy({ top: dir * el.clientHeight * 0.9, behavior: 'smooth' });
  };

  const track = thumb.visible && (
    <div
      className={`overlay-scroll-track${active ? ' active' : ''}`}
      style={thumb.view ? { height: thumb.view } : undefined}
      onPointerDown={onTrackDown}
      aria-hidden="true"
    >
      <div
        className="overlay-scroll-thumb"
        style={{ transform: `translateY(${thumb.top}px)`, height: thumb.height }}
        onPointerDown={onThumbDown}
      />
    </div>
  );

  return { setBody, track, onScroll, onMouseEnter, onMouseMove };
}

const OverlayScrollArea = ({ className = '', as: Tag = 'div', children, ...rest }) => {
  const bodyRef = useRef(null);
  const { setBody, track, onScroll, onMouseEnter, onMouseMove } = useOverlayScroll(bodyRef);

  return (
    <div className="overlay-scroll" onMouseEnter={onMouseEnter} onMouseMove={onMouseMove}>
      <Tag ref={setBody} className={`overlay-scroll-body ${className}`.trim()} onScroll={onScroll} {...rest}>
        {children}
      </Tag>
      {track}
    </div>
  );
};

export const OverlayScrollBox = ({ className = '', innerRef, children, ...rest }) => {
  const bodyRef = useRef(null);
  const { setBody, track, onScroll, onMouseEnter, onMouseMove } = useOverlayScroll(bodyRef, innerRef);

  return (
    <div
      ref={setBody}
      className={`overlay-scroll-body ${className}`.trim()}
      onScroll={onScroll}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      {...rest}
    >
      <div className="overlay-scroll-sticky">{track}</div>
      {children}
    </div>
  );
};

export default OverlayScrollArea;
