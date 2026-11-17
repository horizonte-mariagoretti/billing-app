import { useEffect, useRef } from 'react';

// Native modal <dialog>: the browser provides the top layer, inert background,
// focus return and the Esc key. `onClose` runs on Esc; without it Esc is
// ignored, so a modal's own Esc handler stays in charge.
const Modal = ({ onClose, ref, className = 'modal-overlay', children, ...rest }) => {
  const inner = useRef(null);
  useEffect(() => {
    const d = inner.current;
    if (d && !d.open) d.showModal();
  }, []);
  const setRef = (node) => {
    inner.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };
  return (
    <dialog
      ref={setRef}
      className={className}
      onCancel={(e) => { e.preventDefault(); onClose?.(); }}
      {...rest}
    >
      {children}
    </dialog>
  );
};

export default Modal;
