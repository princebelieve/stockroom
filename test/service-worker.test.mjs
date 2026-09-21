import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

test('service worker excludes APIs, external requests and writes from caching', () => {
  const listeners = {}
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    URL, self: { location: { origin: 'https://shop.example' }, addEventListener: (event, handler) => listeners[event] = handler },
  })
  for (const [url, method] of [['https://shop.example/api/settings', 'GET'], ['https://shop.example/v1/auth/me', 'GET'], ['https://api.example/v1/sync/pull', 'GET'], ['https://shop.example/', 'POST']]) {
    let intercepted = false
    listeners.fetch({ request: { url, method }, respondWith: () => { intercepted = true } })
    assert.equal(intercepted, false, url)
  }
})

test('service worker serves its matching cached shell before attempting navigation', async () => {
  const listeners = {}
  const shell = new Response('<!doctype html><title>cached shell</title>')
  vm.runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    URL,
    fetch: () => { throw new Error('Navigation must not replace the cached shell') },
    caches: { open: async () => ({ match: async path => path === '/index.html' ? shell : undefined }) },
    self: { location: { origin: 'https://shop.example' }, addEventListener: (event, handler) => listeners[event] = handler },
  })
  let response
  listeners.fetch({ request: { url: 'https://shop.example/products', method: 'GET', mode: 'navigate' }, respondWith: value => { response = value } })
  assert.equal(await (await response).text(), '<!doctype html><title>cached shell</title>')
})
