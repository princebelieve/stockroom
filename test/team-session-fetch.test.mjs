import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const source = stripTypeScriptTypes(readFileSync(new URL('../src/lib/teamSessionFetch.ts', import.meta.url), 'utf8'))
const { teamSessionFetch } = await import(`data:text/javascript,${encodeURIComponent(source)}`)

test('every desktop team action receives the shared refreshed session without changing its payload', async () => {
  const calls = []
  let token = 'refreshed-owner'
  const request = teamSessionFetch(async (input, init) => { calls.push({ input, init }); return Response.json({}) }, 'http://localhost', async () => token)
  for (const [path, method] of [['/api/users', 'GET'], ['/api/users', 'POST'], ['/api/users/staff/role', 'PUT'], ['/api/users/staff/operational-access', 'PUT'], ['/api/users/staff/password', 'PUT']]) {
    const body = method === 'GET' ? undefined : JSON.stringify({ ownerPassword: 'confirmation', role: 'cashier' })
    await request(path, { method, body, headers: { Authorization: 'Bearer local-session', 'X-Cloud-Access-Token': 'stale-token' } })
    assert.equal(calls.at(-1).init.headers.get('X-Cloud-Access-Token'), token)
    assert.equal(calls.at(-1).init.headers.get('Authorization'), 'Bearer local-session')
    assert.equal(calls.at(-1).init.body, body)
    token = 'next-refreshed-owner'
  }
  for (const path of ['/api/products', 'https://other.example/api/users']) {
    await request(path)
    assert.equal(calls.at(-1).init, undefined)
  }
})

test('offline Team reads use the cache but failed session recovery never submits staff mutations', async () => {
  const calls = []
  const request = teamSessionFetch(async (input, init) => { calls.push({ input, init }); return Response.json({ users: [] }) }, 'http://localhost', async () => { throw new Error('Cloud unavailable') })
  assert.equal((await request('/api/users', { headers: { 'X-Cloud-Access-Token': 'expired' } })).status, 200)
  assert.equal(calls[0].init.headers.has('X-Cloud-Access-Token'), false)
  const response = await request('/api/users/staff/role', { method: 'PUT', body: '{}' })
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error, 'Cloud unavailable')
  assert.equal(calls.length, 1)
})
