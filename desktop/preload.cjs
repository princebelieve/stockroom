const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('stockroomDesktop', {
  openCustomerDisplay: (url) => ipcRenderer.invoke('customer-display:open', url),
  listPrinters: () => ipcRenderer.invoke('printers:list'),
  print: (options) => ipcRenderer.invoke('printers:print', options),
  control: (options) => ipcRenderer.invoke('printers:control', options),
  showNotification: (options) => ipcRenderer.invoke('notifications:show', options),
  notificationsSupported: () => ipcRenderer.invoke('notifications:supported'),
})
