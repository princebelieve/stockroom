import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { completeOwnerPasswordReset } from '../cloud/password-reset.mjs'

function fixture() {
  const owner = { _id: 'owner-id', businessId: 'shop', email: 'owner@example.test', role: 'owner', passwordHash: 'old-hash' }
  const refreshRows = [
    { tokenHash: 'owner-refresh', accountId: owner._id },
    { tokenHash: 'staff-refresh', accountId: 'staff-id' },
  ]
  const devices = [
    { businessId: 'shop', deviceId: 'windows', revokedAt: null, deviceToken: 'windows-token' },
    { businessId: 'shop', deviceId: 'browser', revokedAt: null, deviceToken: 'browser-token' },
    { businessId: 'shop', deviceId: 'android', revokedAt: null, deviceToken: 'android-token' },
  ]
  const rawToken = 'one-time-reset-code'
  const passwordResets = {
    findOneAndUpdate: async (query, update) => {
      const row = resetRows.find(item => item.tokenHash === query.tokenHash && item.usedAt === null && item.expiresAt > query.expiresAt.$gt)
      if (!row) return null
      row.usedAt = update.$set.usedAt
      return row
    },
  }
  const resetRows = [{ tokenHash: createHmac('sha256', 'jwt-secret').update(rawToken).digest('hex'), accountId: owner._id, expiresAt: new Date(Date.now() + 60_000), usedAt: null }]
  const accounts = {
    findOneAndUpdate: async (query, update) => {
      if (query._id !== owner._id || query.role !== 'owner') return null
      Object.assign(owner, update.$set)
      return owner
    },
  }
  const refreshTokens = {
    deleteMany: async query => {
      const before = refreshRows.length
      for (let index = refreshRows.length - 1; index >= 0; index -= 1) if (refreshRows[index].accountId === query.accountId) refreshRows.splice(index, 1)
      return { deletedCount: before - refreshRows.length }
    },
  }
  return { owner, refreshRows, devices, passwordResets, accounts, refreshTokens, rawToken, resetRows }
}

test('owner password reset invalidates refresh sessions but preserves business devices and data', async () => {
  const state = fixture()
  const savedDevices = structuredClone(state.devices)
  const result = await completeOwnerPasswordReset({
    token: state.rawToken,
    password: 'new-strong-password',
    jwtSecret: 'jwt-secret',
    passwordResets: state.passwordResets,
    accounts: state.accounts,
    refreshTokens: state.refreshTokens,
    hashPassword: password => `hashed:${password}`,
    createAccessToken: account => `access:${account._id}`,
  })

  assert.equal(result.account.passwordHash, 'hashed:new-strong-password')
  assert.equal(result.accessToken, 'access:owner-id')
  assert.deepEqual(state.refreshRows, [{ tokenHash: 'staff-refresh', accountId: 'staff-id' }])
  assert.deepEqual(state.devices, savedDevices)
})

test('invalid or expired reset codes do not change the owner password or revoke sessions', async () => {
  const state = fixture()
  await assert.rejects(completeOwnerPasswordReset({
    token: 'wrong-code',
    password: 'new-strong-password',
    jwtSecret: 'jwt-secret',
    passwordResets: state.passwordResets,
    accounts: state.accounts,
    refreshTokens: state.refreshTokens,
    hashPassword: password => `hashed:${password}`,
    createAccessToken: account => `access:${account._id}`,
  }), /invalid or has expired/)
  assert.equal(state.owner.passwordHash, 'old-hash')
  assert.equal(state.refreshRows.length, 2)
  assert.equal(state.devices.every(device => device.revokedAt === null), true)
})
