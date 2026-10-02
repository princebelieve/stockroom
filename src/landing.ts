import './landing.css'
import './landing-effects.css'

const menuButton = document.getElementById('landing-menu-toggle') as HTMLButtonElement | null
const mainNav = document.getElementById('main-nav')
if (menuButton && mainNav) {
  const closeGroups = () => mainNav.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(group => { group.open = false })
  const closeMenu = () => { closeGroups(); menuButton.setAttribute('aria-expanded', 'false'); menuButton.setAttribute('aria-label', 'Open navigation menu'); mainNav.classList.remove('open') }
  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true'
    menuButton.setAttribute('aria-expanded', String(open)); menuButton.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu'); mainNav.classList.toggle('open', open)
  })
  mainNav.querySelectorAll<HTMLDetailsElement>('details').forEach(group => {
    group.addEventListener('toggle', () => { if (group.open) mainNav.querySelectorAll<HTMLDetailsElement>('details').forEach(other => { if (other !== group) other.open = false }) })
  })
  document.addEventListener('pointerdown', event => {
    if (event.target instanceof Node && !mainNav.contains(event.target) && !menuButton.contains(event.target)) closeMenu()
  }, true)
  mainNav.addEventListener('click', event => { if ((event.target as HTMLElement).closest('a')) closeMenu() })
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu() })
}

const appUrl = import.meta.env.VITE_PUBLIC_APP_URL || 'https://stockroom.globalcreest.com/'
const cloud = __STOCKROOM_SYNC_API_URL__.replace(/\/$/, '')
const text = (id: string, value: string) => { document.getElementById(id)!.textContent = value }
if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const animated = document.querySelectorAll('.hero > div, #features article, .offline > div, .installs article, .referrals > div, .registration > div')
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      entry.target.classList.add('is-visible')
      observer.unobserve(entry.target)
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -36px 0px' })
  for (const element of animated) { element.classList.add('reveal'); observer.observe(element) }
  document.documentElement.classList.add('motion-ready')
}
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
  if (!response.ok) throw new Error(`Reward settings returned HTTP ${response.status}.`)
  const data = await response.json()
  const setRate = (id: string, value: unknown) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) return false
    text(id, `${value}%`)
    return true
  }

  const ownerFirstLoaded = setRate('first-rate', data.firstReferralPercent)
  const ownerRenewalLoaded = setRate('recurring-rate', data.recurringReferralPercent)
  const ownerRatesLoaded = ownerFirstLoaded && ownerRenewalLoaded
  text('owner-referral-status', ownerRatesLoaded
    ? 'Business-owner referral rewards are configured. Owners can review their referral records in Stockroom.'
    : 'Business-owner reward percentages could not be loaded.')

  const visitorFirstSet = data.visitorFirstReferralPercent != null
  const visitorRenewalSet = data.visitorRecurringReferralPercent != null
  const visitorFirstLoaded = visitorFirstSet && setRate('visitor-first-rate', data.visitorFirstReferralPercent)
  const visitorRenewalLoaded = visitorRenewalSet && setRate('visitor-recurring-rate', data.visitorRecurringReferralPercent)
  if (!visitorFirstSet) text('visitor-first-rate', 'Not set')
  else if (!visitorFirstLoaded) text('visitor-first-rate', 'Unavailable')
  if (!visitorRenewalSet) text('visitor-recurring-rate', 'Not set')
  else if (!visitorRenewalLoaded) text('visitor-recurring-rate', 'Unavailable')

  const visitorStatus = !visitorFirstSet && !visitorRenewalSet
    ? 'Visitor promoter rewards have not been set by the developer yet.'
    : visitorFirstLoaded && visitorRenewalLoaded
      ? 'Visitor promoter reward percentages are configured.'
      : 'Visitor promoter rewards are only partly configured; contact the developer before sharing a link.'
  text('visitor-referral-status', visitorStatus)
}
void loadReferralRates().catch(async () => {
  text('owner-referral-status', 'Could not load the business-owner reward percentages.')
  text('visitor-referral-status', 'Could not check whether visitor promoter rewards have been set.')
  await new Promise(resolve => setTimeout(resolve, 2500))
  return loadReferralRates()
}).catch(() => {
  text('owner-referral-status', 'Could not reach the settings to load business-owner rewards.')
  text('visitor-referral-status', 'Could not reach the settings to check visitor promoter rewards.')
})

const referral = new URLSearchParams(location.search).get('ref') || ''
for (const [id, screen] of [['register-app', 'register'], ['subscription-app', referral ? 'register' : 'subscription']]) {
  const destination = new URL(appUrl)
  destination.searchParams.set('screen', screen)
  if (/^[a-f0-9]{32}$/.test(referral)) destination.searchParams.set('ref', referral)
  ;(document.getElementById(id) as HTMLAnchorElement).href = destination.href
}
