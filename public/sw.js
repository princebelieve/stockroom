// This release replaces the original cache-first shell. That shell could keep
// an old index.html (and therefore old authentication code) alive indefinitely
// after a deployment.
const CACHE_NAME = 'stockroom-shell-v2'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg']
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
    // Always prefer the deployed application shell. The cached shell is only
    // an offline fallback, so an update cannot preserve obsolete app code.
    event.respondWith(fetch(event.request).then(async response => {
      if (response.ok) (await caches.open(CACHE_NAME)).put('/index.html', response.clone())
      return response
    }).catch(() => caches.open(CACHE_NAME).then(cache => cache.match('/index.html')).then(cached => cached || Response.error())))
    return
  }
  if (!APP_SHELL.includes(url.pathname)) return
  event.respondWith(fetch(event.request).then(async response => {
    if (response.ok) (await caches.open(CACHE_NAME)).put(event.request, response.clone())
    return response
  }).catch(() => caches.open(CACHE_NAME).then(cache => cache.match(event.request)).then(cached => cached || Response.error())))
})
