import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './Bootstrap.css'
import Bootstrap from './Bootstrap.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// Pre-Bootstrap noop shim so anything that touches window.appDb before
// Bootstrap finishes wiring it (e.g., during module init) doesn't crash.
// Bootstrap will overwrite this shim with a real engine binding once the
// SQLite WASM is initialised.
if (!window.appDb?.query) {
  const noop = async () => [];
  window.appDb = {
    query: noop,
    run: async () => ({ changes: 0, lastInsertRowid: 0 }),
    transaction: async () => [],
  };
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <Bootstrap />
    </ErrorBoundary>
  </StrictMode>,
)
