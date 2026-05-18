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

// Detect Electron at boot. The preload script writes a real db.query function;
// the noop shim in main.jsx only writes async () => []. We treat the absence
// of a real `electronAPI` flag as "browser web mode."
function isElectronRuntime() {
  // electron/preload.js sets a marker we can rely on.
  return typeof window !== 'undefined' && window.__ELECTRON_PRELOAD__ === true;
}

const Bootstrap = () => {
  const electronMode = isElectronRuntime();
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
  const [phase, setPhase] = useState(electronMode ? 'ready' : 'init'); // init | auth | loading | ready | error
  const [loadMessage, setLoadMessage] = useState('Connecting to GitHub…');
  const [loadError, setLoadError] = useState(null);
  const [conflict, setConflict] = useState(false);
  const debounceRef = useRef(null);
  const pushingRef = useRef(false);

  // -- Web boot ---------------------------------------------------------------
  useEffect(() => {
    if (electronMode) return;

    // DEV BYPASS: skip GitHub auth in local Vite dev server.
    // Uses an empty in-memory DB — data does not persist across reloads.
    // This code path is tree-shaken out of production builds (import.meta.env.DEV = false).
    if (import.meta.env.DEV) {
      let cancelled = false;
      (async () => {
        try {
          setLoadMessage('Dev mode — loading in-memory DB…');
          await engine.init(null);
          engine.migrate();
          engine.installAsElectronShim();
          if (!cancelled) setPhase('ready');
        } catch (err) {
          if (!cancelled) { setLoadError(err.message); setPhase('error'); }
        }
      })();
      return () => { cancelled = true; };
    }

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
        engine.installAsElectronShim();

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
  }, [pat, electronMode]);

  // -- Debounced sync ---------------------------------------------------------
  async function pushNow(message) {
    if (pushingRef.current) return;
    if (!engine.isDirty()) return;
    pushingRef.current = true;
    try {
      window.dispatchEvent(new CustomEvent('mg-sync', { detail: 'sync-start' }));
      const bytes = engine.exportBytes();
      await githubSync.pushDb(bytes, message);
      engine.markClean();
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
  }

  useEffect(() => {
    if (electronMode || phase !== 'ready') return;
    const unsub = engine.subscribe((event) => {
      if (event !== 'mutation') return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => { pushNow(); }, SYNC_DEBOUNCE_MS);
    });
    const flush = (e) => {
      if (engine.isDirty()) {
        // beforeunload: synchronous best-effort push via keepalive fetch.
        // The structured pushDb function uses async fetch, so we duplicate
        // the minimum here with keepalive: true to survive the unload.
        try {
          const stored = JSON.parse(localStorage.getItem(REPO_STORAGE_KEY) || 'null') || DEFAULT_DATA_REPO;
          const bytes = engine.exportBytes();
          let binary = '';
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
          }
          const body = JSON.stringify({
            message: `Autosave on unload (${new Date().toISOString()})`,
            content: btoa(binary),
            branch: stored.branch || 'main',
          });
          fetch(`https://api.github.com/repos/${stored.owner}/${stored.repo}/contents/${encodeURIComponent(stored.dbPath)}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${pat}`,
              'Accept': 'application/vnd.github+json',
              'Content-Type': 'application/json',
            },
            body,
            keepalive: true,
          });
        } catch (_e) { /* best effort — ignore */ }
      }
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      unsub();
      window.removeEventListener('beforeunload', flush);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [phase, electronMode, pat]);

  // Listen for manual save requests from the badge.
  useEffect(() => {
    if (electronMode) return;
    const handler = () => pushNow('Manual save');
    window.addEventListener('mg-save-now', handler);
    return () => window.removeEventListener('mg-save-now', handler);
  }, [electronMode]);

  // -- Conflict resolution ----------------------------------------------------
  const handleDiscardLocal = () => {
    setConflict(false);
    window.location.reload();
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
  if (electronMode) return <App />;

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
          onDiscardLocal={handleDiscardLocal}
          onForceOverwrite={handleForceOverwrite}
          onClose={() => setConflict(false)}
        />
      )}
    </>
  );
};

export default Bootstrap;
