// Constants for the GitHub data repo. Owner/repo can be overridden at runtime
// via the auth UI (Advanced section) and persisted in localStorage.

export const DEFAULT_DATA_REPO = {
  owner: 'horizonte-mariagoretti',
  repo: 'billing-app-database',
  branch: 'main',
  dbPath: 'data/invoiceforge.db',
};

export const PAT_STORAGE_KEY = 'billing-app-pat';
export const REPO_STORAGE_KEY = 'billing-app-repo';

export const SYNC_DEBOUNCE_MS = 3000;

export const GITHUB_OAUTH_CLIENT_ID = 'Ov23liDcKH8Ox8vsGOaL';
