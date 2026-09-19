import { isNativeMobile } from './mobileDatabase'

// Explicit opt-in. Standard Android/Windows builds never enable this adapter.
export function isBrowserPwa() {
  return import.meta.env.VITE_APP_MODE === 'pwa' && !isNativeMobile() && !window.stockroomDesktop && !navigator.userAgent.includes('Electron')
}
