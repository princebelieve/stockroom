import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('stockroomDesktop', {
  openCustomerDisplay: (pairingUrl) => ipcRenderer.invoke('customer-display:open', pairingUrl),
})
