import './landing.css'

const appUrl = import.meta.env.VITE_PUBLIC_APP_URL || 'https://stockroom.globalcreest.com/'
const cloud = (import.meta.env.VITE_SYNC_API_URL || 'https://stockroom-0vm5.onrender.com').replace(/\/$/, '')
const text = (id: string, value: string) => { document.getElementById(id)!.textContent = value }
for (const [id, configured, label] of [['apk', import.meta.env.VITE_APK_DOWNLOAD_URL, 'Download Android APK'], ['desktop', import.meta.env.VITE_DESKTOP_DOWNLOAD_URL, 'Download Windows installer']]) {
  if (!configured) continue
  try {
    const url = new URL(configured)
    if (url.protocol !== 'https:') continue
    const link = document.getElementById(id) as HTMLAnchorElement
    link.href = url.href; link.removeAttribute('aria-disabled'); link.textContent = label
    text(`${id}-note`, id === 'desktop' ? 'Download and open the installer, then follow the installation steps.' : 'Download the APK and follow Android’s install prompts.')
  } catch { /* Downloads remain visibly unavailable until configured. */ }
}
let installPrompt: (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); installPrompt = event as typeof installPrompt
  text('pwa', 'Install PWA')
})
document.getElementById('pwa')!.addEventListener('click', async () => {
  if (!installPrompt) { location.assign(appUrl); return }
  const prompt = installPrompt; installPrompt = null
  try { await prompt.prompt(); await prompt.userChoice } finally { text('pwa', 'Open PWA') }
})
// Installation still works through the app if this browser has no install prompt.
if (new URL(appUrl).origin === location.origin && 'serviceWorker' in navigator) {
  const manifest = document.createElement('link'); manifest.rel = 'manifest'; manifest.href = '/manifest.webmanifest'; document.head.append(manifest)
  void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
}
void fetch(`${cloud}/v1/public/landing`, { signal: AbortSignal.timeout(8000) }).then(async response => {
  if (!response.ok) throw new Error()
  const data = await response.json()
  for (const [id, value] of [['first-rate', data.firstReferralPercent], ['recurring-rate', data.recurringReferralPercent]] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error()
    text(id, `${value}%`)
  }
  text('referral-status', 'Current configured referral rates. See your referral records in the app.')
}).catch(() => text('referral-status', 'Current rates are unavailable. Check Subscription in the app for the configured percentages.'))

const referral = new URLSearchParams(location.search).get('ref') || ''
for (const [id, screen] of [['register-app', 'register'], ['subscription-app', 'subscription']]) {
  const destination = new URL(appUrl)
  destination.searchParams.set('screen', screen)
  if (/^[a-f0-9]{32}$/.test(referral)) destination.searchParams.set('ref', referral)
  ;(document.getElementById(id) as HTMLAnchorElement).href = destination.href
}
