import { useEffect, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, AlertTriangle, Check } from 'lucide-react';
import * as engine from '../db/sqliteEngine';
import { useT } from '../hooks/useUiTranslations';
import './SyncStatusBadge.css';

const SyncStatusBadge = () => {
  const t = useT();
  const [state, setState] = useState('idle');

  const LABELS = {
    idle:    { icon: Cloud,         text: t('sync_synced', 'Synced'),       cls: 'idle'    },
    dirty:   { icon: Cloud,         text: t('sync_unsaved', 'Unsaved'),      cls: 'dirty'   },
    saving:  { icon: RefreshCw,     text: t('sync_saving', 'Saving…'),      cls: 'saving'  },
    saved:   { icon: Check,         text: t('sync_saved', 'Saved'),        cls: 'saved'   },
    conflict:{ icon: AlertTriangle, text: t('sync_conflict', 'Conflict'),     cls: 'conflict'},
    error:   { icon: CloudOff,      text: t('sync_error', 'Sync error'),   cls: 'error'   },
  };

  useEffect(() => {
    const unsub = engine.subscribe((event) => {
      if (event === 'mutation') setState((s) => (s === 'saving' ? s : 'dirty'));
    });
    const onSync = (e) => {
      const detail = e.detail;
      if (detail === 'sync-start') setState('saving');
      else if (detail === 'sync-ok') {
        setState('saved');
        setTimeout(() => setState((s) => (s === 'saved' ? 'idle' : s)), 2000);
      }
      else if (detail === 'sync-conflict') setState('conflict');
      else if (detail === 'sync-error') setState('error');
    };
    window.addEventListener('mg-sync', onSync);
    return () => { unsub(); window.removeEventListener('mg-sync', onSync); };
  }, []);

  const meta = LABELS[state] || LABELS.idle;
  const Icon = meta.icon;
  const clickable = state === 'dirty' || state === 'error';

  const handleClick = () => {
    if (!clickable) return;
    window.dispatchEvent(new CustomEvent('mg-save-now'));
  };

  return (
    <button
      type="button"
      className={`sync-badge sync-${meta.cls}`}
      onClick={handleClick}
      title={clickable ? t('sync_click_to_save', 'Click to save now') : meta.text}
      disabled={!clickable}
    >
      <Icon size={14} className={state === 'saving' ? 'spin' : ''} />
      <span>{meta.text}</span>
    </button>
  );
};

export default SyncStatusBadge;
