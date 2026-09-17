// The production build replaces these values with its exact asset list/hash.
const CACHE_NAME = 'stockroom-shell-dev'
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg']
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)))
})
self.addEventListener('message', event => {
  if (event.data === 'ACTIVATE_UPDATE') self.skipWaiting()
})
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('stockroom-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  // Never cache API responses, tokens, errors, or unrelated origins.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/')) return
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE_NAME).then(cache => cache.match('/index.html')).then(cached => cached || fetch(event.request)))
    return
  }
  if (!APP_SHELL.includes(url.pathname)) return
  event.respondWith(caches.open(CACHE_NAME).then(cache => cache.match(event.request)).then(cached => cached || fetch(event.request)))
})
