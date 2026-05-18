import { AlertTriangle } from 'lucide-react';
import Button from '../components/Button';
import { useT } from '../hooks/useUiTranslations';
import './SyncConflictModal.css';

// Two-button modal for the 409/422 SHA-mismatch case.
// Discard local: re-fetch remote, drop local mutations, reload.
// Force overwrite: re-fetch SHA, push local bytes anyway.
const SyncConflictModal = ({ onDiscardLocal, onForceOverwrite, onClose }) => {
  const t = useT();
  return (
    <div className="sync-conflict-overlay" role="dialog" aria-modal="true">
      <div className="sync-conflict-card">
        <div className="sync-conflict-header">
          <AlertTriangle size={28} className="sync-conflict-icon" />
          <h2>{t('sync_conflict_title', 'Sync conflict')}</h2>
        </div>
        <p>
          {t('sync_conflict_desc', 'Another device pushed changes to data/invoiceforge.db after you started editing. Your local changes have not been saved to GitHub yet.')}
        </p>
        <p>{t('sync_pick', 'Pick one:')}</p>
        <div className="sync-conflict-actions">
          <Button variant="outline" onClick={onDiscardLocal}>
            {t('sync_discard', 'Discard my changes & reload')}
          </Button>
          <Button variant="danger" onClick={onForceOverwrite}>
            {t('sync_overwrite', 'Overwrite remote with my version')}
          </Button>
        </div>
        <button type="button" className="sync-conflict-close" onClick={onClose}>
          {t('sync_decide_later', 'Decide later')}
        </button>
      </div>
    </div>
  );
};

export default SyncConflictModal;
