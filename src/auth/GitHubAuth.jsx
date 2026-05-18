import React, { useState } from 'react';
import { Cloud, AlertCircle } from 'lucide-react';
import Button from '../components/Button';
import { DEFAULT_DATA_REPO, REPO_STORAGE_KEY, GITHUB_OAUTH_CLIENT_ID } from '../sync/config';
import './GitHubAuth.css';

const GitHubAuth = ({ authError }) => {
  const stored = (() => {
    try { return JSON.parse(localStorage.getItem(REPO_STORAGE_KEY) || 'null'); }
    catch { return null; }
  })() || DEFAULT_DATA_REPO;

  const [owner, setOwner] = useState(stored.owner);
  const [repo, setRepo] = useState(stored.repo);
  const [branch, setBranch] = useState(stored.branch || 'main');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleLogin = () => {
    localStorage.setItem(REPO_STORAGE_KEY, JSON.stringify({
      owner: owner.trim(),
      repo: repo.trim(),
      branch: branch.trim() || 'main',
      dbPath: stored.dbPath || DEFAULT_DATA_REPO.dbPath,
    }));
    const state = crypto.randomUUID();
    sessionStorage.setItem('oauth_state', state);
    const params = new URLSearchParams({
      client_id: GITHUB_OAUTH_CLIENT_ID,
      scope: 'repo',
      state,
    });
    window.location.href = `https://github.com/login/oauth/authorize?${params}`;
  };

  return (
    <div className="gh-auth-page">
      <div className="gh-auth-card">
        <div className="gh-auth-header">
          <div className="gh-auth-logo"><Cloud size={28} /></div>
          <h1>Connect to GitHub</h1>
          <p>InvoiceForge stores your data in a private GitHub repository. Sign in to read and save invoices.</p>
        </div>

        {authError && (
          <div className="gh-auth-hint error">
            <AlertCircle size={14} />
            <span>Authentication failed ({authError}). Please try again.</span>
          </div>
        )}

        <details className="gh-auth-advanced" open={showAdvanced} onToggle={(e) => setShowAdvanced(e.target.open)}>
          <summary>Advanced — repository</summary>
          <div className="gh-auth-grid">
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

        <Button variant="primary" onClick={handleLogin}>
          Login with GitHub
        </Button>
      </div>
    </div>
  );
};

export default GitHubAuth;
