import { useEffect, useRef, useState } from 'react';
import App from './App.jsx';
import GitHubAuth from './auth/GitHubAuth.jsx';
import SyncConflictModal from './sync/SyncConflictModal.jsx';
import * as engine from './db/sqliteEngine';
import * as githubSync from './sync/githubSync';
import {
  DEFAULT_DATA_REPO,
  PAT_STORAGE_KEY,
  REPO_STORAGE_KEY,
  SYNC_DEBOUNCE_MS,
} from './sync/config';

const Bootstrap = () => {
  const [authError] = useState(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    return hash.get('auth_error') || null;
  });
  const [pat, setPat] = useState(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const token = hash.get('token');
    if (token || hash.get('auth_error')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    if (token) {
      localStorage.setItem(PAT_STORAGE_KEY, token);
      return token;
    }
    return localStorage.getItem(PAT_STORAGE_KEY) || '';
  });
  const [phase, setPhase] = useState('init'); // init | auth | loading | ready | error
  const [loadMessage, setLoadMessage] = useState('Connecting to GitHub…');
  const [loadError, setLoadError] = useState(null);
  const [conflict, setConflict] = useState(false);
  const debounceRef = useRef(null);
  const pushingRef = useRef(false);
  const changesRef = useRef(0); // counts edits, so a save knows if more came in while it ran

  // -- Web boot ---------------------------------------------------------------
  useEffect(() => {
    // DEV BYPASS: skip GitHub auth in local Vite dev server.
    // Uses an in-memory DB pre-filled with sample data — nothing persists across reloads.
    // This code path is tree-shaken out of production builds (import.meta.env.DEV = false).
    if (import.meta.env.DEV) {
      let cancelled = false;
      (async () => {
        try {
          setLoadMessage('Dev mode — loading in-memory DB…');
          await engine.init(null);
          engine.migrate();
          engine.installDbBridge();
          // Fill the throw-away DB with sample content so every page has data
          // to look at. Add ?empty to the URL for a blank database instead.
          if (!new URLSearchParams(window.location.search).has('empty')) {
            const { buildSampleStatements } = await import('./dev/sampleData.js');
            // StrictMode runs this effect twice; only seed a still-empty database.
            // (engine calls are synchronous, so check + insert cannot interleave.)
            if (engine.query('SELECT COUNT(*) AS n FROM clients')[0].n === 0) {
              engine.transaction(buildSampleStatements());
            }
          }
          if (!cancelled) setPhase('ready');
        } catch (err) {
          if (!cancelled) { setLoadError(err.message); setPhase('error'); }
        }
      })();
      return () => { cancelled = true; };
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- local draft follows its prop
    if (!pat) { setPhase('auth'); return; }

    let cancelled = false;
    (async () => {
      try {
        const stored = (() => {
          try { return JSON.parse(localStorage.getItem(REPO_STORAGE_KEY) || 'null'); }
          catch { return null; }
        })() || DEFAULT_DATA_REPO;

        githubSync.configure({ ...stored, token: pat });

        setLoadMessage('Verifying access…');
        const access = await githubSync.verifyAccess();
        if (cancelled) return;
        if (!access.ok) {
          // Bad PAT or revoked — clear and re-prompt.
          localStorage.removeItem(PAT_STORAGE_KEY);
          setPat('');
          setPhase('auth');
          return;
        }

        setLoadMessage('Downloading database…');
        const { bytes } = await githubSync.fetchDb();
        if (cancelled) return;

        setLoadMessage('Loading SQLite engine…');
        await engine.init(bytes);

        setLoadMessage('Running migrations…');
        engine.migrate();
        engine.installDbBridge();

        // If the DB came back empty (404 first run) or migrations ran, push
        // immediately so the data repo has a baseline file.
        if (engine.isDirty()) {
          await pushNow('Initial DB seed');
        }

        if (cancelled) return;
        setPhase('ready');
      } catch (err) {
        if (cancelled) return;
        console.error('Bootstrap failed:', err);
        setLoadError(err.message || 'Failed to load database.');
        setPhase('error');
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pat]);

  // -- Debounced sync ---------------------------------------------------------
  async function pushNow(message) {
    if (pushingRef.current || !githubSync.isConfigured()) return; // not configured: dev mode
    if (!engine.isDirty()) return;
    pushingRef.current = true;
    const seen = changesRef.current;
    let ok = false;
    try {
      window.dispatchEvent(new CustomEvent('mg-sync', { detail: 'sync-start' }));
      const bytes = engine.exportBytes();
      await githubSync.pushDb(bytes, message);
      // Edits made during the upload are not in `bytes`: keep them marked as unsaved.
      if (changesRef.current === seen) engine.markClean();
      ok = true;
      window.dispatchEvent(new CustomEvent('mg-sync', { detail: 'sync-ok' }));
    } catch (err) {
      if (err.code === 'sync_conflict') {
        setConflict(true);
        window.dispatchEvent(new CustomEvent('mg-sync', { detail: 'sync-conflict' }));
      } else {
        console.error('pushDb failed:', err);
        window.dispatchEvent(new CustomEvent('mg-sync', { detail: 'sync-error' }));
      }
    } finally {
      pushingRef.current = false;
    }
    if (ok && engine.isDirty()) pushNow();
  }

  useEffect(() => {
    if (phase !== 'ready') return;
    const unsub = engine.subscribe((event) => {
      if (event !== 'mutation') return;
      changesRef.current += 1;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => { pushNow(); }, SYNC_DEBOUNCE_MS);
    });
    // A background upload cannot carry the database (64 KB limit, needs the file SHA),
    // so warn instead of losing the last edits, and save as soon as the tab is hidden.
    const warn = (e) => {
      if (engine.isDirty()) { e.preventDefault(); e.returnValue = ''; }
    };
    const onHide = () => { if (document.visibilityState === 'hidden') pushNow(); };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      unsub();
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('visibilitychange', onHide);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- trigger list is intentional
  }, [phase]);

  // Listen for manual save requests from the badge.
  useEffect(() => {
    const handler = () => pushNow('Manual save');
    window.addEventListener('mg-save-now', handler);
    return () => window.removeEventListener('mg-save-now', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- trigger list is intentional
  }, []);

  // -- Conflict resolution ----------------------------------------------------
  const handleDiscardLocal = () => {
    setConflict(false);
    window.location.reload();
  };
  const handleDownloadCopy = () => {
    const url = URL.createObjectURL(new Blob([engine.exportBytes()], { type: 'application/octet-stream' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'invoiceforge-my-copy.db' });
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleForceOverwrite = async () => {
    setConflict(false);
    try {
      // Re-fetch current SHA so the next push wins.
      await githubSync.fetchDb();
      await pushNow('Force overwrite from local');
    } catch (err) {
      console.error('Force overwrite failed:', err);
      window.dispatchEvent(new CustomEvent('mg-sync', { detail: 'sync-error' }));
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem(PAT_STORAGE_KEY);
    githubSync.clearConfig();
    setPat('');
    setPhase('auth');
  };

  // -- Render -----------------------------------------------------------------
  if (phase === 'auth') {
    return <GitHubAuth authError={authError} />;
  }

  if (phase === 'init' || phase === 'loading') {
    return (
      <div className="boot-splash">
        <div className="boot-splash-card">
          <div className="boot-splash-spinner" />
          <p>{loadMessage}</p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="boot-splash">
        <div className="boot-splash-card error">
          <h2>Failed to load</h2>
          <p>{loadError}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
          <button onClick={handleSignOut}>Sign out and try again</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <App onSignOut={handleSignOut} />
      {conflict && (
        <SyncConflictModal
          onDownloadCopy={handleDownloadCopy}
          onDiscardLocal={handleDiscardLocal}
          onForceOverwrite={handleForceOverwrite}
          onClose={() => setConflict(false)}
        />
      )}
    </>
  );
};

export default Bootstrap;
