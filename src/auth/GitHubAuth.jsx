import { useEffect, useRef, useState } from 'react';
import { Cloud, AlertCircle, ExternalLink, Copy, Check } from 'lucide-react';
import Button from '../components/Button';
import * as githubSync from '../sync/githubSync';
import { startDeviceFlow, pollForToken } from './deviceFlow';
import {
  DEFAULT_DATA_REPO,
  PAT_STORAGE_KEY,
  REPO_STORAGE_KEY,
  GITHUB_CLIENT_ID,
  CLIENT_ID_STORAGE_KEY,
} from '../sync/config';
import './GitHubAuth.css';

const ERROR_MESSAGES = {
  invalid_token:    'Sign-in succeeded but the token is invalid. Try again.',
  repo_not_found:   'Repo not found, or the GitHub App is not installed on it.',
  no_write_access:  'Token has read but not write access. Re-install the GitHub App with Contents: Read and write.',
  network_error:    'Network error. Check your connection and try again.',
  not_configured:   'Configuration error.',
};

const GitHubAuth = ({ onAuthenticated }) => {
  const storedRepo = (() => {
    try { return JSON.parse(localStorage.getItem(REPO_STORAGE_KEY) || 'null'); }
    catch { return null; }
  })() || DEFAULT_DATA_REPO;

  const storedClientId = localStorage.getItem(CLIENT_ID_STORAGE_KEY) || '';
  const initialClientId = GITHUB_CLIENT_ID || storedClientId;

  const [clientId, setClientId] = useState(initialClientId);
  const [owner, setOwner] = useState(storedRepo.owner);
  const [repo, setRepo] = useState(storedRepo.repo);
  const [branch, setBranch] = useState(storedRepo.branch || 'main');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [phase, setPhase] = useState('idle');   // idle | starting | awaiting | verifying | error
  const [deviceData, setDeviceData] = useState(null); // { user_code, verification_uri, ... }
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef(null);

  // Cancel any in-flight poll on unmount.
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const beginSignIn = async (e) => {
    e?.preventDefault();
    setError(null);
    const cid = clientId.trim();
    if (!cid) {
      setError('GitHub App Client ID required. Open Advanced and paste it.');
      setShowAdvanced(true);
      return;
    }
    // Persist Client ID so the user doesn't re-paste on next visit.
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, cid);

    setPhase('starting');
    try {
      const data = await startDeviceFlow(cid);
      setDeviceData(data);
      setPhase('awaiting');

      // Start polling
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const result = await pollForToken(cid, data.device_code, data.interval, data.expires_in, abortRef.current.signal);

      // Got a token — verify it works against the data repo before saving.
      setPhase('verifying');
      githubSync.configure({
        owner: owner.trim(),
        repo: repo.trim(),
        branch: branch.trim() || 'main',
        dbPath: storedRepo.dbPath || DEFAULT_DATA_REPO.dbPath,
        token: result.access_token,
      });
      const access = await githubSync.verifyAccess();
      if (!access.ok) {
        setError(ERROR_MESSAGES[access.reason] || `Verification failed: ${access.reason}`);
        setPhase('error');
        return;
      }

      localStorage.setItem(PAT_STORAGE_KEY, result.access_token);
      localStorage.setItem(REPO_STORAGE_KEY, JSON.stringify({
        owner: owner.trim(),
        repo: repo.trim(),
        branch: branch.trim() || 'main',
        dbPath: storedRepo.dbPath || DEFAULT_DATA_REPO.dbPath,
      }));
      onAuthenticated();
    } catch (err) {
      if (err.code === 'aborted') return;
      setError(err.message || 'Sign-in failed.');
      setPhase('error');
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setPhase('idle');
    setDeviceData(null);
    setError(null);
  };

  const handleCopy = async () => {
    if (!deviceData?.user_code) return;
    try {
      await navigator.clipboard.writeText(deviceData.user_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_e) { /* ignore */ }
  };

  // -- Renders ----------------------------------------------------------------

  if (phase === 'awaiting' && deviceData) {
    return (
      <div className="gh-auth-page">
        <div className="gh-auth-card">
          <div className="gh-auth-header">
            <div className="gh-auth-logo"><Cloud size={28} /></div>
            <h1>Authorise on GitHub</h1>
            <p>Open the link below, paste the code, and approve the request. This page will detect the approval automatically.</p>
          </div>

          <div className="device-code-wrap">
            <span className="device-code-label">Your code</span>
            <div className="device-code-value">
              <code>{deviceData.user_code}</code>
              <button type="button" className="device-code-copy" onClick={handleCopy} title="Copy code">
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>

          <a
            className="device-open-btn"
            href={deviceData.verification_uri}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open GitHub <ExternalLink size={14} />
          </a>

          <p className="device-hint">
            Waiting for approval… expires in {Math.round((deviceData.expires_in || 900) / 60)} min.
          </p>

          {error && (
            <div className="gh-auth-hint error">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <button type="button" className="gh-auth-link-btn" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'verifying') {
    return (
      <div className="gh-auth-page">
        <div className="gh-auth-card">
          <div className="gh-auth-header">
            <div className="gh-auth-logo"><Cloud size={28} /></div>
            <h1>Verifying access…</h1>
            <p>Confirming your token can read and write the data repository.</p>
          </div>
        </div>
      </div>
    );
  }

  // idle | starting | error
  const submitting = phase === 'starting';
  return (
    <div className="gh-auth-page">
      <div className="gh-auth-card">
        <div className="gh-auth-header">
          <div className="gh-auth-logo"><Cloud size={28} /></div>
          <h1>Sign in to InvoiceForge</h1>
          <p>Connect your GitHub account to load and save your invoices from the private data repo.</p>
        </div>

        <form onSubmit={beginSignIn} className="gh-auth-form">
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Starting…' : 'Sign in with GitHub'}
          </Button>

          <details className="gh-auth-advanced" open={showAdvanced} onToggle={(e) => setShowAdvanced(e.target.open)}>
            <summary>Advanced — App + repository</summary>
            <div className="gh-auth-grid">
              <label className="gh-auth-label">
                <span>GitHub App Client ID</span>
                <input
                  className="gh-auth-input"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="Iv1.xxxxxxxxxxxxxxxx or Iv23li..."
                  autoComplete="off"
                />
              </label>
              <label className="gh-auth-label">
                <span>Owner</span>
                <input className="gh-auth-input" value={owner} onChange={(e) => setOwner(e.target.value)} />
              </label>
              <label className="gh-auth-label">
                <span>Repo</span>
                <input className="gh-auth-input" value={repo} onChange={(e) => setRepo(e.target.value)} />
              </label>
              <label className="gh-auth-label">
                <span>Branch</span>
                <input className="gh-auth-input" value={branch} onChange={(e) => setBranch(e.target.value)} />
              </label>
            </div>
          </details>

          {error && (
            <div className="gh-auth-hint error">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}
        </form>

        <div className="gh-auth-help">
          <h3>How it works</h3>
          <ol>
            <li>Click <strong>Sign in with GitHub</strong>.</li>
            <li>A short code appears. Open <a href="https://github.com/login/device" target="_blank" rel="noopener noreferrer">github.com/login/device <ExternalLink size={11} /></a> and paste it.</li>
            <li>Approve the <code>InvoiceForge</code> GitHub App.</li>
            <li>The page detects approval and loads your data.</li>
          </ol>
          <p className="gh-auth-warning">
            <AlertCircle size={12} /> The token lives in this browser's <code>localStorage</code>. Don't use this app on a shared computer.
          </p>
        </div>
      </div>
    </div>
  );
};

export default GitHubAuth;
