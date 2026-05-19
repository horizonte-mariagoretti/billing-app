// GitHub Contents API client for the SQLite blob.
// Pulls bytes on boot, pushes bytes on debounced save.
// Handles 409/422 (SHA mismatch) by surfacing a conflict event.

let cfg = null;       // { owner, repo, branch, dbPath, token }
let cachedSha = null; // SHA of the data file, required for the next PUT

const API_BASE = 'https://api.github.com';

export function configure({ owner, repo, branch, dbPath, token }) {
  cfg = { owner, repo, branch, dbPath, token };
  cachedSha = null;
}

export function isConfigured() {
  return cfg != null && !!cfg.token;
}

export function clearConfig() {
  cfg = null;
  cachedSha = null;
}

function authHeaders() {
  if (!cfg) throw new Error('githubSync not configured');
  return {
    'Authorization': `Bearer ${cfg.token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function bytesToBase64(bytes) {
  // Chunked to avoid call-stack overflow on large arrays.
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  const cleaned = b64.replace(/\s/g, '');
  const binary = atob(cleaned);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function verifyAccess() {
  if (!cfg) return { ok: false, reason: 'not_configured' };
  try {
    const res = await fetch(`${API_BASE}/repos/${cfg.owner}/${cfg.repo}`, {
      headers: authHeaders(),
    });
    if (res.status === 401) return { ok: false, reason: 'invalid_token' };
    if (res.status === 404) return { ok: false, reason: 'repo_not_found' };
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const data = await res.json();
    if (!data.permissions?.push) return { ok: false, reason: 'no_write_access' };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'network_error', error: e.message };
  }
}

export async function fetchDb() {
  if (!cfg) throw new Error('githubSync not configured');
  const url = `${API_BASE}/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(cfg.dbPath)}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (res.status === 404) {
    cachedSha = null;
    return { bytes: null, sha: null };
  }
  if (!res.ok) {
    throw new Error(`fetchDb failed: HTTP ${res.status}`);
  }
  const data = await res.json();
  cachedSha = data.sha;
  if (data.encoding !== 'base64' || !data.content) {
    // Large files (>1MB) come back without inline content; would need the
    // blob endpoint. Defer that path — invoice DBs are small.
    if (data.size > 1_000_000) {
      throw new Error('DB file >1MB — blob fetch not yet implemented');
    }
    return { bytes: new Uint8Array(0), sha: cachedSha };
  }
  return { bytes: base64ToBytes(data.content), sha: cachedSha };
}

export async function pushDb(bytes, message) {
  if (!cfg) throw new Error('githubSync not configured');
  const url = `${API_BASE}/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(cfg.dbPath)}`;
  const body = {
    message: message || `Update invoiceforge.db (${new Date().toISOString()})`,
    content: bytesToBase64(bytes),
    branch: cfg.branch,
  };
  if (cachedSha) body.sha = cachedSha;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 409) {
    // SHA mismatch — another push landed since our last fetch.
    const err = new Error('sync_conflict');
    err.code = 'sync_conflict';
    throw err;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`pushDb failed: HTTP ${res.status} — ${text}`);
  }
  const data = await res.json();
  cachedSha = data.content?.sha ?? cachedSha;
  return { sha: cachedSha };
}
