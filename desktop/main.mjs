import { app, BrowserWindow, dialog, ipcMain, screen, session, shell } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sendHardwareCommand } from './hardware.mjs'

const port = Number(process.env.PORT || 8787)
let customerDisplayWindow = null

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

async function createWindow() {
  await session.defaultSession.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] })
  const window = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 700, autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)) },
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const external = new URL(url)
      if (external.origin === 'https://stockroom.globalcreest.com' && external.pathname === '/welcome') void shell.openExternal(url)
    } catch {}
    return { action: 'deny' }
  })
  window.loadURL(`http://127.0.0.1:${port}`)
}

async function openCustomerDisplay(pairingUrl) {
  const url = new URL(String(pairingUrl || ''))
  if (url.protocol !== 'http:' || url.port !== String(Number(process.env.CUSTOMER_DISPLAY_PORT || 8788)) || url.pathname !== '/pair') throw new Error('Invalid customer display link.')
  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  const target = displays.find((display) => display.id !== primary.id) || primary
  if (!customerDisplayWindow || customerDisplayWindow.isDestroyed()) {
    customerDisplayWindow = new BrowserWindow({
      x: target.bounds.x, y: target.bounds.y, width: target.bounds.width, height: target.bounds.height,
      title: 'Customer Display', autoHideMenuBar: true, fullscreen: target.id !== primary.id,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    })
    customerDisplayWindow.on('closed', () => { customerDisplayWindow = null })
  }
  await customerDisplayWindow.loadURL(url.toString())
  customerDisplayWindow.show()
  customerDisplayWindow.focus()
}

app.whenReady().then(async () => {
  // User data is outside the installer, so updates preserve sales and inventory.
  process.env.STOCKROOM_DATA_DIR = join(app.getPath('userData'), 'data')
  process.env.SYNC_CONFIG_PATH = join(app.getPath('userData'), 'sync-config.json')
  process.env.STOCKROOM_LOCAL_ONLY = 'true'
  process.env.PORT = String(port)
  try {
    const trustedSender = (event) => {
      if (event.senderFrame !== event.sender.mainFrame || new URL(event.senderFrame.url).origin !== `http://127.0.0.1:${port}`) throw new Error('Untrusted printer request.')
    }
    ipcMain.handle('printers:list', async (event) => {
      trustedSender(event)
      return (await event.sender.getPrintersAsync()).map(({ name, displayName }) => ({ name, displayName }))
    })
    ipcMain.handle('printers:control', async (event, options) => {
      trustedSender(event)
      await sendHardwareCommand(options)
    })
    ipcMain.handle('printers:print', async (event, options) => {
      trustedSender(event)
      if (!options || !['receipt', 'report'].includes(options.kind) || typeof options.deviceName !== 'string' || ![58, 80].includes(options.width)) throw new Error('Invalid print settings.')
      if (options.deviceName && !(await event.sender.getPrintersAsync()).some(printer => printer.name === options.deviceName)) throw new Error('Selected printer is unavailable. Select another printer in Admin Settings.')
      await new Promise((resolve, reject) => event.sender.print({
        deviceName: options.deviceName, silent: Boolean(options.deviceName), printBackground: true,
        ...(options.kind === 'report' ? { pageSize: 'A4' } : { usePrinterDefaultPageSize: true }),
      }, (success, reason) => success ? resolve() : reject(new Error(reason || 'Print job failed.'))))
    })
    ipcMain.handle('customer-display:open', (_event, pairingUrl) => openCustomerDisplay(pairingUrl))
    await import('../server/index.mjs')
    await waitForLocalServer()
    createWindow()
  } catch (error) {
    await dialog.showMessageBox({ type: 'error', title: 'Stockroom could not start', message: error instanceof Error ? error.message : 'Unknown startup error.' })
    app.quit()
  }
})

app.on('window-all-closed', () => app.quit())
