import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')

function workerHarness({ cache, fetch: fetchImpl }) {
  const listeners = new Map()
  const calls = { skipWaiting: 0, claim: 0 }
  const self = {
    location: { origin: 'https://stockroom.example' },
    addEventListener: (name, callback) => listeners.set(name, callback),
    skipWaiting: async () => { calls.skipWaiting += 1 },
    clients: { claim: async () => { calls.claim += 1 }, matchAll: async () => [], openWindow: async () => undefined },
  }
  const caches = { open: async () => cache, keys: async () => [], delete: async () => true }
  vm.runInNewContext(source, { self, caches, fetch: fetchImpl, URL, Response, Promise })
  return { listeners, calls }
}

test('service worker activates even if an individual cached shell resource fails', async () => {
  const attempted = []
  const cache = {
    add: async url => { attempted.push(url); if (url === '/features') throw new Error('optional page unavailable') },
    match: async () => undefined,
  }
  const { listeners, calls } = workerHarness({ cache, fetch: async () => new Response('unused') })
  let install
  listeners.get('install')({ waitUntil: promise => { install = promise } })
  await install
  assert.ok(attempted.includes('/'))
  assert.equal(calls.skipWaiting, 1)
})

test('online navigation gets the current app shell before any cached copy', async () => {
  const cache = { add: async () => undefined, match: async () => new Response('old shell') }
  const { listeners } = workerHarness({ cache, fetch: async (_url, options) => {
    assert.equal(options.cache, 'no-store')
    return new Response('fresh shell')
  } })
  let responsePromise
  listeners.get('fetch')({
    request: { method: 'GET', mode: 'navigate', url: 'https://stockroom.example/inventory' },
    respondWith: promise => { responsePromise = promise },
  })
  assert.equal(await (await responsePromise).text(), 'fresh shell')
})

test('offline navigation falls back to its cached app shell', async () => {
  const cache = { add: async () => undefined, match: async () => new Response('cached shell') }
  const { listeners } = workerHarness({ cache, fetch: async () => { throw new Error('offline') } })
  let responsePromise
  listeners.get('fetch')({
    request: { method: 'GET', mode: 'navigate', url: 'https://stockroom.example/inventory' },
    respondWith: promise => { responsePromise = promise },
  })
  assert.equal(await (await responsePromise).text(), 'cached shell')
})
