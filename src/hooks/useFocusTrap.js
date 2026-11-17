import { useEffect } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Traps keyboard focus inside `containerRef` while active.
 * The first focusable child receives focus on mount.
 * Pass `triggerRef` to return focus to the trigger element on unmount.
 */
const useFocusTrap = (containerRef, { active = true, triggerRef } = {}) => {
  useEffect(() => {
    if (!active || !containerRef.current) return;

    const container = containerRef.current;
    const previous = document.activeElement;

    const getFocusable = () => Array.from(container.querySelectorAll(FOCUSABLE));

    // Focus first element immediately.
    const first = getFocusable()[0];
    if (first) first.focus();

    const handleKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) { e.preventDefault(); return; }
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      } else {
        if (document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Return focus to the element that opened the modal.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- trigger list is intentional
      const returnTarget = triggerRef?.current || previous;
      if (returnTarget && typeof returnTarget.focus === 'function') returnTarget.focus();
    };
  }, [active, containerRef, triggerRef]);
};

export default useFocusTrap;
