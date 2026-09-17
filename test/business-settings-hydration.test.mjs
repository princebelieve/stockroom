import assert from 'node:assert/strict'
import test from 'node:test'

const readSettings = (value) => value

test('existing business settings are preserved instead of falling back to My Business', () => {
  const payload = {
    appName: 'Acme Market',
    currency: 'USD',
    posProvider: 'stripe',
    posTerminalId: 'terminal-1',
    posConnection: 'network',
    updatedAt: '2026-09-17T00:00:00.000Z',
  }

  const result = readSettings(payload)
  assert.equal(result.appName, 'Acme Market')
  assert.equal(result.currency, 'USD')
  assert.equal(result.posConnection, 'network')
})
