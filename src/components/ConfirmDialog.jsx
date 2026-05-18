import React, { useEffect, useRef } from 'react';
import Button from './Button';
import { useT } from '../hooks/useUiTranslations';
import './ConfirmDialog.css';

const ConfirmDialog = ({ title, message, confirmLabel, onConfirm, onCancel }) => {
  const t = useT();
  const cancelRef = useRef(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const handleKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="confirm-box">
        <h3 id="confirm-title">{title}</h3>
        <p>{message}</p>
        <div className="confirm-actions">
          <Button ref={cancelRef} variant="ghost" onClick={onCancel}>{t('btn_cancel', 'Cancel')}</Button>
          <Button variant="danger" onClick={onConfirm}>{confirmLabel ?? t('btn_delete', 'Delete')}</Button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
