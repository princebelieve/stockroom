import { Capacitor, registerPlugin } from '@capacitor/core'

type AppLinkEvent = { url?: string }
type AppLinksPlugin = {
  getLaunchUrl(): Promise<AppLinkEvent>
  addListener(eventName: 'appUrlOpen', listener: (event: AppLinkEvent) => void): Promise<{ remove: () => Promise<void> }>
}

const NativeAppLinks = registerPlugin<AppLinksPlugin>('StockroomAppLinks')
const allowedQueries = new Set([
  'business', 'customer', 'catalog', 'ref', 'screen', 'hospitalityPayment',
  'paystackPayment', 'paystackPurpose', 'paystackTarget', 'paystackRequestId',
])

function appRouteFor(urlText: string): string | null {
  try {
    const url = new URL(urlText)
    if (url.protocol !== 'https:' || url.hostname !== 'stockroom.globalcreest.com') return null
    const referralMatch = url.pathname.match(/^\/r\/([a-f0-9]{32})$/i)
    if (url.pathname !== '/' && !referralMatch) return null

    const params = new URLSearchParams()
    for (const [key, value] of url.searchParams) {
      if (allowedQueries.has(key)) params.append(key, value)
    }
    if (referralMatch) {
      params.set('ref', referralMatch[1].toLowerCase())
      params.set('screen', 'register')
    }
    const query = params.toString()
    return `${window.location.origin}/${query ? `?${query}` : ''}${url.hash}`
  } catch {
    return null
  }
}

function openAppRoute(url: string, initial: boolean) {
  const route = appRouteFor(url)
  if (!route || route === `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`) return
  if (initial) window.history.replaceState(null, '', route)
  else window.location.replace(route)
}

/** Process Android verified links before React reads startup query parameters. */
export async function prepareNativeAppLinks() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return
  try {
    await NativeAppLinks.addListener('appUrlOpen', ({ url }) => { if (url) openAppRoute(url, false) })
    const launch = await NativeAppLinks.getLaunchUrl()
    if (launch.url) openAppRoute(launch.url, true)
  } catch (error) {
    console.warn('Could not initialize Android app links.', error)
  }
}
