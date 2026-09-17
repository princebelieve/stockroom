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
