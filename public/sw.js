// This release replaces the original cache-first shell. That shell could keep
// an old index.html (and therefore old authentication code) alive indefinitely
// after a deployment.
const CACHE_NAME = 'stockroom-shell-v2'
const APP_SHELL = ['/', '/welcome', '/developer', '/visitor', '/manifest.webmanifest', '/icon.svg']
self.addEventListener('install', event => {
  // A single unavailable optional shell resource must not block the update.
  // In particular, large OCR assets are fetched only when OCR is used.
  event.waitUntil(caches.open(CACHE_NAME).then(cache => Promise.all(APP_SHELL.map(url => cache.add(url).catch(() => undefined)))).then(() => self.skipWaiting()))
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('stockroom-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting()
})
self.addEventListener('push', event => {
  let data = {}
  try { data = event.data?.json() || {} } catch { data = { body: event.data?.text() || '' } }
  const title = String(data.title || 'Stockroom update').slice(0, 100)
  const options = { body: String(data.body || '').slice(0, 300), icon: '/icon-192.png', badge: '/icon.svg', tag: String(data.id || 'stockroom-notification'), data: { url: String(data.url || '/') } }
  event.waitUntil(self.registration.showNotification(title, options))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/', self.location.origin)
  if (target.origin !== self.location.origin) target.href = self.location.origin + '/'
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const client = clients.find(item => new URL(item.url).origin === self.location.origin)
    if (client) { void client.navigate(target.href); return client.focus() }
    return self.clients.openWindow(target.href)
  }))
})
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  // Never cache API responses, tokens, errors, or unrelated origins.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/')) return
  if (event.request.mode === 'navigate') {
    // These are real static documents. Do not turn their navigations into the
    // app shell: doing so makes sitemap.xml render Stockroom instead of XML.
    if (['/sitemap.xml', '/robots.txt', '/privacy', '/privacy.html', '/terms', '/terms.html'].includes(url.pathname)) return
    // Prefer the deployed HTML whenever online. An old controlling worker
    // must not keep returning its cached app document after a deployment.
    // Retain the cached document only as an offline fallback.
    const publicPages = ['features','workspaces','hardware','getting-started','downloads','referrals','support']
    const publicPage = publicPages.find(page => url.pathname === '/' + page || url.pathname === '/' + page + '.html')
    const shellUrl = publicPage ? '/' + publicPage : ['/welcome', '/welcome.html'].includes(url.pathname) ? '/welcome'
      : ['/developer', '/developer.html'].includes(url.pathname) ? '/developer'
        : ['/visitor', '/visitor.html'].includes(url.pathname) ? '/visitor' : '/'
    event.respondWith(caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(shellUrl)
      // Fetch canonical clean URLs, not the incoming navigation Request. On
      // Vercel, legacy *.html URLs redirect and navigation requests may use a
      // manual redirect mode that cannot be returned from a service worker.
      try {
        const fresh = await fetch(new URL(shellUrl, self.location.origin), { cache: 'no-store' })
        if (fresh.ok) return fresh
      } catch { /* use the cached app shell while offline */ }
      return cached || Response.error()
    }))
    return
  }
  if (!APP_SHELL.includes(url.pathname)) return
  event.respondWith(caches.open(CACHE_NAME).then(cache => cache.match(event.request)).then(cached => cached || fetch(event.request).then(async response => {
    if (response.ok) (await caches.open(CACHE_NAME)).put(event.request, response.clone())
    return response
  }).catch(() => Response.error())))
})
