import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { createReferralWallet } from '../cloud/referral-wallet.mjs'

test('bank name verification is required for visitor and owner payout accounts', async () => {
  const originalFetch = globalThis.fetch, originalKey = process.env.PAYSTACK_SECRET_KEY
  process.env.PAYSTACK_SECRET_KEY = 'test-only'
  let resolvedName = 'BANK RETURNED NAME', rejectLookup = false, saved, recipient
  const collection = { createIndex: async () => {}, findOne: async () => null, updateOne: async (_, update) => { saved = update.$set } }
  const database = { collection: name => name === 'referral_visitors' ? { ...collection, findOne: async () => ({ _id: 'visitor', name: 'Visitor' }) } : collection }
  let claims = { kind: 'visitor', visitorId: 'visitor' }
  globalThis.fetch = async (url, options) => {
    let data
    if (url.includes('/bank?')) data = [{ code: '001', name: 'Example Bank', active: true }]
    else if (url.includes('/bank/resolve')) { if (rejectLookup) return Response.json({ status: false, message: 'Provider internals' }, { status: 400 }); data = { account_name: resolvedName, account_number: '0123456789' } }
    else { recipient = JSON.parse(options.body); data = { recipient_code: 'recipient' } }
    return Response.json({ status: true, data })
  }
  try {
    const wallet = await createReferralWallet({ database, accounts: { findOne: async () => ({ businessId: 'business', name: 'Owner' }) }, verifyToken: () => claims })
    const call = async (path, body) => {
      const request = Readable.from([JSON.stringify(body)])
      Object.assign(request, { url: '/v1/referral-wallet/' + path, method: 'POST', headers: {} })
      let status, result
      await wallet.handle(request, { writeHead: code => { status = code }, end: value => { result = JSON.parse(value) } })
      return { status, ...result }
    }
    const input = { currency: 'NGN', bankCode: '001', accountNumber: '0123456789', name: 'Invented name' }
    assert.equal((await call('resolve', input)).name, resolvedName)
    assert.equal((await call('profile', input)).status, 409)
    assert.equal(saved, undefined)
    assert.equal((await call('profile', { ...input, confirmedName: resolvedName })).status, 200)
    assert.equal(saved.name, resolvedName)
    assert.equal(recipient.name, resolvedName)
    assert.equal(saved.accountNumber, undefined)
    assert.equal(saved.accountLast4, '6789')
    resolvedName = 'CHANGED NAME'
    assert.equal((await call('profile', { ...input, confirmedName: 'BANK RETURNED NAME' })).status, 409)
    assert.equal((await call('resolve', { ...input, currency: 'USD' })).status, 400)
    assert.equal((await call('resolve', { ...input, bankCode: 'unknown' })).status, 400)
    rejectLookup = true
    const failure = await call('resolve', input)
    assert.equal(failure.status, 400)
    assert.doesNotMatch(failure.error, /Provider internals/)
    rejectLookup = false
    claims = { kind: 'access', role: 'owner', businessId: 'business', email: 'owner@example.test' }
    assert.equal((await call('profile', { ...input, confirmedName: resolvedName })).status, 200)
    assert.equal(saved.referrerType, 'business')
    claims = { kind: 'access', role: 'cashier', businessId: 'business', email: 'staff@example.test' }
    assert.equal((await call('resolve', input)).status, 401)
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.PAYSTACK_SECRET_KEY
    else process.env.PAYSTACK_SECRET_KEY = originalKey
  }
})
