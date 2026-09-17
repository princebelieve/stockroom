import test from 'node:test'
import assert from 'node:assert/strict'
import { corsHeadersFor } from '../cloud/cors.mjs'
test('CORS preserves Android and only adds explicitly configured PWA origins', () => {
  assert.equal(corsHeadersFor('https://localhost')['Access-Control-Allow-Origin'], 'https://localhost')
  assert.equal(corsHeadersFor('https://shop.example', 'https://shop.example')['Access-Control-Allow-Origin'], 'https://shop.example')
  assert.equal(corsHeadersFor('https://evil.example', 'https://shop.example')['Access-Control-Allow-Origin'], undefined)
  assert.equal(corsHeadersFor(undefined)['Access-Control-Allow-Origin'], undefined)
})
