import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const source = stripTypeScriptTypes(readFileSync(new URL('../src/lib/cloudRequest.ts', import.meta.url), 'utf8'))
const { cloudRequest, CloudAuthenticationError } = await import(`data:text/javascript,${encodeURIComponent(source)}`)

test('desktop subscription and startup share one refresh and reuse the new credentials', async () => {
  const originalFetch = globalThis.fetch
  const originalStorage = globalThis.localStorage
  const saved = new Map([['stockroom-token', 'local'], ['stockroom-cloud-access-token', 'expired'], ['stockroom-cloud-refresh-token', 'refresh']])
  globalThis.localStorage = { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) }
  let renewals = 0
  globalThis.fetch = async (url, init) => {
    assert.equal(init.headers['X-Local-Session'], 'local')
    if (url.endsWith('/auth/refresh')) {
      renewals++
      await new Promise(resolve => setTimeout(resolve, 10))
      return Response.json({ accessToken: 'fresh', refreshToken: 'rotated' })
    }
    return init.headers.Authorization === 'Bearer fresh' ? Response.json({ ok: true }) : Response.json({ error: 'Sign in with your cloud owner account.' }, { status: 403 })
  }
  try {
    const result = await Promise.all(['/v1/auth/me', '/v1/subscriptions'].map(path => cloudRequest('/api/cloud', path, {}, () => {})))
    assert.ok(result.every(value => value.ok))
    assert.equal(renewals, 1)
    await cloudRequest('/api/cloud', '/v1/subscriptions/referrals', {}, () => {}, 'expired')
    assert.equal(renewals, 1)
    assert.equal(saved.get('stockroom-cloud-refresh-token'), 'rotated')
    globalThis.fetch = async () => Response.json({ error: 'Service unavailable' }, { status: 503 })
    await assert.rejects(cloudRequest('/api/cloud', '/v1/subscriptions', {}, () => {}), error => !(error instanceof CloudAuthenticationError))
    saved.delete('stockroom-cloud-refresh-token')
    globalThis.fetch = async () => Response.json({ error: 'Sign in with your cloud owner account.' }, { status: 403 })
    await assert.rejects(cloudRequest('/api/cloud', '/v1/subscriptions', {}, () => {}), CloudAuthenticationError)
  } finally { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage }
})
