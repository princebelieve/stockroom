import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { validatePlan, validSignature, paymentMatches } from '../cloud/subscriptions.mjs'
import { graceEndsAt, subscriptionAccess, referralPercentages } from '../server/subscription-policy.mjs'
import { loadSubscriptionAccess } from '../server/subscription-client.mjs'

test('grace is one UTC calendar month, preserving time and clamping month end', () => {
  assert.equal(graceEndsAt('2026-01-31T15:30:00Z'), '2026-02-28T15:30:00.000Z')
  assert.equal(graceEndsAt('2028-01-31T15:30:00Z'), '2028-02-29T15:30:00.000Z')
  assert.equal(graceEndsAt('2026-12-15T00:00:00Z'), '2027-01-15T00:00:00.000Z')
  assert.equal(graceEndsAt('bad-date'), null)
})
test('POS works through grace and blocks exactly at its end', () => {
  const snapshot = { testMode: false, expiresAt: '2026-01-31T15:30:00Z' }
  assert.equal(subscriptionAccess(snapshot, Date.parse('2026-01-30')).status, 'active')
  assert.equal(subscriptionAccess(snapshot, Date.parse(snapshot.expiresAt)).status, 'grace')
  assert.equal(subscriptionAccess(snapshot, Date.parse('2026-02-28T15:29:59.999Z')).blocked, false)
  assert.equal(subscriptionAccess(snapshot, Date.parse('2026-02-28T15:30:00Z')).blocked, true)
  assert.equal(subscriptionAccess({ testMode: false }).blocked, true)
  assert.equal(subscriptionAccess(null).blocked, true)
})
test('developer test mode lifts unpaid, expired and invalid-date blocks', () => {
  for (const expiresAt of [null, '2000-01-01', 'invalid']) assert.equal(subscriptionAccess({ testMode: true, expiresAt }).blocked, false)
  assert.equal(subscriptionAccess({ testMode: false, expiresAt: 'invalid' }).blocked, true)
})
test('referral percentages accept zero, fractional rates and 100, rejecting invalid inputs', () => {
  assert.deepEqual(referralPercentages({}), { firstReferralPercent: 0, recurringReferralPercent: 0 })
  assert.deepEqual(referralPercentages({ firstReferralPercent: '12.25', recurringReferralPercent: 100 }), { firstReferralPercent: 12.25, recurringReferralPercent: 100 })
  for (const rate of [-1, 100.01, Infinity, 'oops', 1.001]) {
    assert.throws(() => referralPercentages({ firstReferralPercent: rate }))
    assert.throws(() => referralPercentages({ recurringReferralPercent: rate }))
  }
})
function accessFixture(snapshot) {
  let saved = JSON.stringify(snapshot)
  return { config: { url: 'https://cloud.test', token: 'device', businessId: 'shop' }, read: async () => saved, write: async (_, value) => { saved = value }, fetcher: async () => { throw new Error('Offline') } }
}
test('offline cache still blocks expired subscriptions, and isolates businesses', async () => {
  assert.equal((await loadSubscriptionAccess(accessFixture({ businessId: 'shop', testMode: false, expiresAt: '2000-01-01' }))).blocked, true)
  assert.equal((await loadSubscriptionAccess(accessFixture({ businessId: 'other-shop', testMode: true }))).blocked, true)
  assert.equal((await loadSubscriptionAccess(accessFixture({ businessId: 'shop', testMode: true }))).blocked, false)
  assert.equal((await loadSubscriptionAccess(accessFixture(null))).blocked, true)
})
test('fresh cloud test mode unlocks expired POS and renewed dates replace expired cache', async () => {
  const fixture = accessFixture({ businessId: 'shop', testMode: false, expiresAt: '2000-01-01' })
  fixture.fetcher = async () => Response.json({ businessId: 'shop', testMode: true, expiresAt: '2000-01-01' })
  assert.equal((await loadSubscriptionAccess(fixture)).blocked, false)
  fixture.fetcher = async () => Response.json({ businessId: 'shop', testMode: false, expiresAt: new Date(Date.now() + 86400000).toISOString() })
  assert.equal((await loadSubscriptionAccess({ ...fixture, force: true })).status, 'active')
})
test('disabling test mode replaces cached bypass and revoked credentials clear it', async () => {
  const fixture = accessFixture({ businessId: 'shop', testMode: true })
  fixture.fetcher = async () => Response.json({ businessId: 'shop', testMode: false, expiresAt: '2000-01-01' })
  assert.equal((await loadSubscriptionAccess(fixture)).blocked, true)
  const revoked = accessFixture({ businessId: 'shop', testMode: true })
  revoked.fetcher = async () => new Response('', { status: 403 })
  assert.equal((await loadSubscriptionAccess(revoked)).blocked, true)
  assert.equal(await revoked.read(), 'null')
})

test('plan accepts integer minor units and rejects unsafe amounts and periods', () => {
  const plan = { amount: 500000, currency: 'NGN', days: 30, reminderDays: 7 }
  assert.deepEqual(validatePlan(plan), plan)
  for (const patch of [{ amount: -1 }, { amount: 1.5 }, { days: 0 }, { days: 731 }, { reminderDays: 0 }, { currency: 'BAD' }]) assert.throws(() => validatePlan({ ...plan, ...patch }))
})
test('webhook requires a signature over the exact raw bytes', () => {
  const raw = Buffer.from('{"event":"charge.success"}')
  const signature = createHmac('sha512', 'secret').update(raw).digest('hex')
  assert.equal(validSignature(raw, signature, 'secret'), true)
  assert.equal(validSignature(Buffer.from('{}'), signature, 'secret'), false)
  assert.equal(validSignature(raw, '', 'secret'), false)
  assert.equal(validSignature(raw, signature, ''), false)
  assert.equal(validSignature(raw, 'é'.repeat(128), 'secret'), false)
})
test('payment must match successful status, reference, amount, currency and owner email', () => {
  const payment = { _id: 'sub-123', amount: 500000, currency: 'NGN', email: 'owner@example.com' }
  const data = { reference: payment._id, amount: payment.amount, currency: payment.currency, customer: { email: payment.email }, status: 'success' }
  assert.equal(paymentMatches(payment, data), true)
  for (const patch of [{ status: 'pending' }, { reference: 'another' }, { amount: 1 }, { currency: 'USD' }, { customer: { email: 'other@example.com' } }]) assert.equal(paymentMatches(payment, { ...data, ...patch }), false)
})
