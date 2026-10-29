const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')

const db = require('./database')

// Validate that every element of a params array is a SQLite-safe primitive.
function validateParams(params) {
  if (params == null) return
  if (!Array.isArray(params)) throw new Error('IPC: params must be an array')
  for (const p of params) {
    if (p !== null && typeof p !== 'string' && typeof p !== 'number' && typeof p !== 'boolean') {
      throw new Error(`IPC: invalid param type "${typeof p}" — only string, number, boolean, null allowed`)
    }
  }
}

// IPC Handlers
ipcMain.handle('db-query', (event, { sql, params }) => {
  try {
    if (!sql || typeof sql !== 'string') throw new Error('IPC: sql must be a non-empty string')
    validateParams(params)
    const stmt = db.prepare(sql)
    return stmt.all(params || [])
  } catch (err) {
    console.error('DB Query Error:', err)
    throw err
  }
})

ipcMain.handle('db-run', (event, { sql, params }) => {
  try {
    if (!sql || typeof sql !== 'string') throw new Error('IPC: sql must be a non-empty string')
    validateParams(params)
    const stmt = db.prepare(sql)
    return stmt.run(params || [])
  } catch (err) {
    console.error('DB Run Error:', err)
    throw err
  }
})

ipcMain.handle('db-transaction', (event, operations) => {
  try {
    if (!Array.isArray(operations)) throw new Error('IPC: operations must be an array')
    for (const op of operations) {
      if (!op.sql || typeof op.sql !== 'string') throw new Error('IPC: each operation must have a sql string')
      validateParams(op.params)
    }
    const runAll = db.transaction(() => {
      const results = []
      for (const { sql, params } of operations) {
        const stmt = db.prepare(sql)
        results.push(stmt.run(params || []))
      }
      return results
    })
    return runAll()
  } catch (err) {
    console.error('DB Transaction Error:', err)
    throw err
  }
})

const fs = require('fs')
const { dialog } = require('electron')

// Save pre-rendered PDF bytes (from @react-pdf/renderer in the renderer process)
ipcMain.handle('save-pdf-bytes', async (event, { bytes, filename }) => {
  if (!(bytes instanceof Uint8Array) && !Array.isArray(bytes)) {
    throw new Error('save-pdf-bytes: bytes must be a Uint8Array or array');
  }
  const safeName = path.basename(String(filename || 'document').replace(/\.pdf$/i, '')) + '.pdf';
  const { filePath } = await dialog.showSaveDialog({
    title: 'Save PDF',
    defaultPath: safeName,
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
  });
  if (filePath) {
    fs.writeFileSync(filePath, Buffer.from(bytes));
    return filePath;
  }
  return null;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#16181D',
      symbolColor: '#C8FF00',
    }
  })

  // The window has the DB bridge: never open child windows or leave the app.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const appUrl = process.env.VITE_DEV_SERVER_URL
    || pathToFileURL(path.join(__dirname, '../dist/index.html')).href
  win.webContents.on('will-navigate', (event, url) => {
    const strip = (u) => u.split('#')[0]
    const allowed = process.env.VITE_DEV_SERVER_URL
      ? new URL(url).origin === new URL(appUrl).origin
      : strip(url) === strip(appUrl)
    if (!allowed) event.preventDefault()
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
