import test from 'node:test'
import assert from 'node:assert/strict'
import { createRegistration, registrationInput, registrationKeyHash, canIssueRegistrationKey } from '../cloud/registration.mjs'

test('only an existing configured developer owner can issue registration keys', async () => {
  const claims = { kind: 'access', role: 'owner', email: 'developer@test.com', businessId: 'developer-business' }
  const accounts = { findOne: async () => ({ id: 'developer' }) }
  assert.equal(await canIssueRegistrationKey(claims, claims.email, accounts), true)
  for (const changed of [null, { ...claims, kind: 'device' }, { ...claims, role: 'cashier' }, { ...claims, email: 'customer@test.com' }]) assert.equal(await canIssueRegistrationKey(changed, claims.email, accounts), false)
  assert.equal(await canIssueRegistrationKey(claims, '', accounts), false)
  assert.equal(await canIssueRegistrationKey(claims, claims.email, { findOne: async () => null }), false)
})

function fixture() {
  let state = {}
  let queue = Promise.resolve()
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) => key === '$or' ? value.some(part => matches(row, part)) : value && typeof value === 'object' && '$gt' in value ? row[key] > value.$gt : row[key] === value)
  const database = { collection(name) {
    const rows = () => state[name] ||= []
    return {
      createIndex: async () => {},
      findOne: async filter => rows().find(row => matches(row, filter)),
      insertOne: async row => {
        if (name === 'accounts' && rows().some(saved => saved.email === row.email || saved.businessId === row.businessId)) throw Object.assign(new Error('Duplicate'), { code: 11000 })
        rows().push(structuredClone(row))
      },
      findOneAndUpdate: async (filter, update) => {
        const row = rows().find(row => matches(row, filter))
        if (!row) return null
        Object.assign(row, update.$set); return structuredClone(row)
      },
      updateOne: async (filter, update) => {
        let row = rows().find(row => matches(row, filter))
        if (!row) { row = { ...filter, ...update.$setOnInsert }; rows().push(row) }
        Object.assign(row, update.$set)
      },
    }
  } }
  const client = { withSession: action => action({ withTransaction: work => {
    const run = queue.then(async () => {
      const before = structuredClone(state)
      try { return await work() } catch (error) { state = before; throw error }
    })
    queue = run.catch(() => {})
    return run
  } }) }
  return { database, client, accounts: database.collection('accounts'), hashPassword: value => `hashed:${value}`, rows: name => state[name] || [] }
}
const registrationService = db => createRegistration({ database: db.database, client: db.client, accounts: db.accounts, hashPassword: db.hashPassword })
const details = { businessId: 'new-shop', businessName: 'New Shop', email: 'owner@test.com', expiresInDays: 7 }
const owner = { ownerName: 'Shop Owner', email: 'owner@test.com', password: 'strong-password', currency: 'NGN' }

test('keys are unpredictable, hashed at rest and bound to email and business', async () => {
  const db = fixture(); const service = await registrationService(db)
  const issued = await service.issue(details)
  assert.match(issued.key, /^SBIT-[a-f0-9]{48}$/)
  assert.equal(db.rows('business_registration_keys')[0]._id, registrationKeyHash(issued.key))
  assert.ok(!JSON.stringify(db.rows('business_registration_keys')).includes(issued.key))
  await assert.rejects(service.redeem({ ...owner, email: 'other@test.com', key: issued.key }), /another email/)
  const result = await service.redeem({ ...owner, key: issued.key, businessId: 'attacker-chosen' })
  assert.equal(result.businessId, details.businessId)
  assert.equal(db.rows('accounts')[0].passwordHash, 'hashed:strong-password')
  assert.equal(db.rows('business_settings')[0].settings.appName, details.businessName)
  assert.equal(db.rows('sync_operations')[0].payload.currency, 'NGN')
  await assert.rejects(service.redeem({ ...owner, key: issued.key }), /already used/)
  await assert.rejects(service.issue(details), /already registered/)
})

test('expired keys fail and concurrent redemption has a single winner', async () => {
  const db = fixture(); const service = await registrationService(db)
  const expired = await service.issue(details)
  db.rows('business_registration_keys')[0].expiresAt = new Date(0)
  await assert.rejects(service.redeem({ ...owner, key: expired.key }), /expired/)
  const issued = await service.issue(details)
  const results = await Promise.allSettled([service.redeem({ ...owner, key: issued.key }), service.redeem({ ...owner, key: issued.key })])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(db.rows('accounts').length, 1)
})

test('failed registration rolls back key use and referral binding is committed with the account', async () => {
  const db = fixture(); const service = await registrationService(db)
  const issued = await service.issue(details)
  await assert.rejects(service.redeem({ ...owner, key: issued.key, referralCode: 'missing' }), /referral code/)
  assert.equal(db.rows('business_registration_keys')[0].usedAt, null)
  assert.equal(db.rows('accounts').length, 0)
  await db.database.collection('subscription_referrals').insertOne({ _id: 'referring-shop', code: 'a'.repeat(32) })
  await service.redeem({ ...owner, key: issued.key, referralCode: 'a'.repeat(32) })
  assert.equal(db.rows('subscriptions')[0].referrerId, 'referring-shop')
  assert.deepEqual(db.rows('subscriptions')[0].references, [])
})

test('registration input rejects invalid key scope and excessive expiry', () => {
  assert.throws(() => registrationInput({ ...details, expiresInDays: 31 }))
  assert.throws(() => registrationInput({ ...details, businessId: '../other' }))
  assert.throws(() => registrationInput({ ...details, email: '' }))
})
