import './landing.css'

const appUrl = import.meta.env.VITE_PUBLIC_APP_URL || 'https://stockroom.globalcreest.com/'
const cloud = __STOCKROOM_SYNC_API_URL__.replace(/\/$/, '')
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
async function loadReferralRates() {
  const response = await fetch(`${cloud}/v1/public/landing`, { signal: AbortSignal.timeout(65000), cache: 'no-store' })
  if (!response.ok) throw new Error(`Referral rates returned HTTP ${response.status}.`)
  const data = await response.json()
  for (const [id, value] of [['first-rate', data.firstReferralPercent], ['recurring-rate', data.recurringReferralPercent]] as const) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw new Error('Referral rates are not valid percentages.')
    text(id, `${value}%`)
  }
  text('referral-status', 'Current configured referral rates. See your referral records in the app.')
}
void loadReferralRates().catch(async () => {
  text('referral-status', 'Connecting to load the current referral rates…')
  await new Promise(resolve => setTimeout(resolve, 2500))
  return loadReferralRates()
}).catch(() => text('referral-status', 'Referral rates could not be loaded. Please try again later or check Subscription in the app.'))

const referral = new URLSearchParams(location.search).get('ref') || ''
for (const [id, screen] of [['register-app', 'register'], ['subscription-app', referral ? 'register' : 'subscription']]) {
  const destination = new URL(appUrl)
  destination.searchParams.set('screen', screen)
  if (/^[a-f0-9]{32}$/.test(referral)) destination.searchParams.set('ref', referral)
  ;(document.getElementById(id) as HTMLAnchorElement).href = destination.href
}
