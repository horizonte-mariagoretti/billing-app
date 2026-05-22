const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

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

// NOTE: renderer must pass `html` containing the full <html>...</html> for the
// document preview only. See DocumentEditor.handleExportPDF.
ipcMain.handle('generate-pdf', async (event, { html, filename }) => {
  if (!html || typeof html !== 'string') {
    throw new Error('generate-pdf: html is required');
  }

  const pdfWin = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    // Load HTML via data URL — no filesystem touch.
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    await pdfWin.loadURL(dataUrl);

    const data = await pdfWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      // CSS padding on .pdf-page handles all spacing; no extra Electron margins.
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });

    const safeName = path.basename(String(filename || 'document').replace(/\.pdf$/i, '')) + '.pdf';

    const { filePath } = await dialog.showSaveDialog({
      title: 'Save PDF',
      defaultPath: safeName,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });

    if (filePath) {
      fs.writeFileSync(filePath, data);
      return filePath;
    }
    return null;
  } finally {
    pdfWin.destroy();
  }
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
