import { isNativeMobile } from './mobileDatabase'
import type { HardwareCommand } from './nativePrinting'

export type HardwareSettings = Omit<HardwareCommand, 'action'>
export function hardwareSettings(): HardwareSettings {
  try {
    const value = JSON.parse(localStorage.getItem('stockroom-hardware') || '{}')
    return { host: typeof value.host === 'string' ? value.host : '', port: Number.isInteger(value.port) ? value.port : 9100, pin: value.pin === 1 ? 1 : 0, cut: value.cut === 'full' ? 'full' : 'partial' }
  } catch { return { host: '', port: 9100, pin: 0, cut: 'partial' } }
}
export function saveHardwareSettings(settings: HardwareSettings) {
  const normalized = { ...settings, host: settings.host.trim() }
  if (!/^[a-zA-Z0-9.-]{1,253}$/.test(normalized.host) || !Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65535) throw new Error('Enter a printer hostname/IP and a port from 1 to 65535.')
  localStorage.setItem('stockroom-hardware', JSON.stringify(normalized))
  return normalized
}
let controlling = false
export async function controlHardware(action: HardwareCommand['action'], settings = hardwareSettings()) {
  if (controlling) throw new Error('A hardware command is already in progress.')
  controlling = true
  try {
    if (isNativeMobile()) {
      const { NativePrinting } = await import('./nativePrinting')
      await NativePrinting.control({ ...settings, action })
    } else if (window.stockroomDesktop) await window.stockroomDesktop.control({ ...settings, action })
    else throw new Error('Drawer and cutter controls require the Windows or Android app.')
  } finally { controlling = false }
}
