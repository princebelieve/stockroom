import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const source = stripTypeScriptTypes(readFileSync(new URL('../src/lib/localSessionFetch.ts', import.meta.url), 'utf8'))
const { localSessionFetch } = await import(`data:text/javascript,${encodeURIComponent(source)}`)

test('all desktop pages share the current session, including after login and logout', async () => {
  let token = 'owner-session'
  const calls = []
  const request = localSessionFetch(async (input, init) => { calls.push({ input, init }); return new Response('{}') }, 'http://localhost:8787', () => token)
  for (const path of ['/api/expenses', '/api/products', '/api/reports', '/api/auth/session']) {
    await request(path)
    assert.equal(calls.at(-1).init.headers.get('Authorization'), 'Bearer owner-session')
  }
  token = 'cashier-session'
  await request('/api/products')
  assert.equal(calls.at(-1).init.headers.get('Authorization'), 'Bearer cashier-session')
  token = ''
  await request('/api/products')
  assert.equal(calls.at(-1).init.headers.has('Authorization'), false)
})

test('preserves request data and explicit credentials without leaking local tokens', async () => {
  const calls = []
  const request = localSessionFetch(async (input, init) => { calls.push({ input, init }); return new Response('{}') }, 'http://localhost:8787', () => 'local-secret')
  const input = new Request('http://localhost:8787/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"total":10}' })
  await request(input)
  assert.equal(calls.at(-1).input, input)
  assert.equal(calls.at(-1).init.headers.get('Content-Type'), 'application/json')
  assert.equal(await input.text(), '{"total":10}')
  await request('/api/users', { headers: { Authorization: 'Bearer explicit', 'X-Cloud-Access-Token': 'cloud' } })
  assert.equal(calls.at(-1).init.headers.get('Authorization'), 'Bearer explicit')
  assert.equal(calls.at(-1).init.headers.get('X-Cloud-Access-Token'), 'cloud')
  for (const path of ['https://cloud.example/api/users', '//other.example/api/users', '/assets/app.js']) {
    await request(path)
    assert.equal(calls.at(-1).init, undefined)
  }
})
