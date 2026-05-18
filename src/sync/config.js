// Constants for the GitHub data repo. Owner/repo can be overridden at runtime
// via the auth UI (Advanced section) and persisted in localStorage.

export const DEFAULT_DATA_REPO = {
  owner: 'Lexon245',
  repo: 'maria-goretti-invoices',
  branch: 'main',
  dbPath: 'data/invoiceforge.db',
};

export const PAT_STORAGE_KEY = 'mg-invoices-pat';
export const REPO_STORAGE_KEY = 'mg-invoices-repo';

export const SYNC_DEBOUNCE_MS = 3000;

// GitHub App Client ID for Device Flow. Public value (safe to commit).
// Override at build time via VITE_GITHUB_CLIENT_ID env var, otherwise use
// the InvoiceForge Sync App installed on Lexon245/maria-goretti-invoices.
export const GITHUB_CLIENT_ID =
  import.meta.env.VITE_GITHUB_CLIENT_ID || 'Iv23litSguzRIBwiv4LV';

export const CLIENT_ID_STORAGE_KEY = 'mg-invoices-client-id';
