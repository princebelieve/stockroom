import { app, BrowserWindow, dialog } from 'electron'
import { join } from 'node:path'

const port = Number(process.env.PORT || 8787)

function waitForLocalServer() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 15_000
    const check = async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`)
        if (response.ok) return resolve()
      } catch {}
      if (Date.now() >= deadline) return reject(new Error('The local business database could not start.'))
      setTimeout(check, 150)
    }
    check()
  })
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 700, autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  window.loadURL(`http://127.0.0.1:${port}`)
}

app.whenReady().then(async () => {
  // User data is outside the installer, so updates preserve sales and inventory.
  process.env.STOCKROOM_DATA_DIR = join(app.getPath('userData'), 'data')
  process.env.SYNC_CONFIG_PATH = join(app.getPath('userData'), 'sync-config.json')
  process.env.STOCKROOM_LOCAL_ONLY = 'true'
  process.env.PORT = String(port)
  try {
    await import('../server/index.mjs')
    await waitForLocalServer()
    createWindow()
  } catch (error) {
    await dialog.showMessageBox({ type: 'error', title: 'Stockroom could not start', message: error instanceof Error ? error.message : 'Unknown startup error.' })
    app.quit()
  }
})

app.on('window-all-closed', () => app.quit())
