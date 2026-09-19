import assert from 'node:assert/strict'

const test = await import('node:test')

function resolveCloudAccessToken(freshToken, savedToken = '') {
  const fresh = String(freshToken || '').trim()
  const saved = String(savedToken || '').trim()
  return fresh || saved
}

test.describe('cloud session token recovery', () => {
  test.it('keeps a valid saved cloud token when the fresh login response is empty', () => {
    assert.equal(resolveCloudAccessToken('', 'saved-cloud-token'), 'saved-cloud-token')
  })

  test.it('prefers a fresh cloud token when one is returned', () => {
    assert.equal(resolveCloudAccessToken('fresh-cloud-token', 'saved-cloud-token'), 'fresh-cloud-token')
  })
})
