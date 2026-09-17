import { isNativeMobile } from './mobileDatabase'

// Explicit opt-in. Standard Android/Windows builds never enable this adapter.
export function isBrowserPwa() {
  const isHostedBrowser = window.location.protocol === 'https:' && !['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
  return (import.meta.env.VITE_APP_MODE === 'pwa' || isHostedBrowser) && !isNativeMobile() && !window.stockroomDesktop && !navigator.userAgent.includes('Electron')
}
