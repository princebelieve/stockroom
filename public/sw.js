// This release replaces the original cache-first shell. That shell could keep
// an old index.html (and therefore old authentication code) alive indefinitely
// after a deployment.
const CACHE_NAME = 'stockroom-shell-v2'
const APP_SHELL = ['/', '/welcome', '/manifest.webmanifest', '/icon.svg']
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('stockroom-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting()
})
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  // Never cache API responses, tokens, errors, or unrelated origins.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/')) return
  if (event.request.mode === 'navigate') {
    // Keep an HTML shell and its hashed assets together. An older worker can
    // see a newly deployed index.html before its replacement worker has
    // precached that deployment's assets. Saving that HTML in the older cache
    // would make the next offline launch request JavaScript that it does not
    // have. The replacement worker is activated immediately and reloads the
    // client, so cache-first navigation does not leave the app on an old
    // release once the new shell is ready.
    const shellUrl = ['/welcome', '/welcome.html'].includes(url.pathname) ? '/welcome' : '/'
    event.respondWith(caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(shellUrl)
      // Fetch canonical clean URLs, not the incoming navigation Request. On
      // Vercel, legacy *.html URLs redirect and navigation requests may use a
      // manual redirect mode that cannot be returned from a service worker.
      return cached || fetch(new URL(shellUrl, self.location.origin))
    }))
    return
  }
  if (!APP_SHELL.includes(url.pathname)) return
  event.respondWith(caches.open(CACHE_NAME).then(cache => cache.match(event.request)).then(cached => cached || fetch(event.request).then(async response => {
    if (response.ok) (await caches.open(CACHE_NAME)).put(event.request, response.clone())
    return response
  }).catch(() => Response.error())))
})
