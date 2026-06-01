const { contextBridge, ipcRenderer } = require('electron')

// Marker for runtime detection in the renderer (so the React shell can pick
// the Electron path vs the web path without sniffing user-agent).
contextBridge.exposeInMainWorld('__ELECTRON_PRELOAD__', true)

contextBridge.exposeInMainWorld('electron', {
  db: {
    query: (sql, params) => ipcRenderer.invoke('db-query', { sql, params }),
    run: (sql, params) => ipcRenderer.invoke('db-run', { sql, params }),
    transaction: (operations) => ipcRenderer.invoke('db-transaction', operations),
  },
  pdf: {
    generate: (options) => ipcRenderer.invoke('generate-pdf', options),
    save:     (options) => ipcRenderer.invoke('save-pdf-bytes', options),
  },
  versions: {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron,
  }
})
