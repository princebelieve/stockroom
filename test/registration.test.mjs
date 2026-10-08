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
        if (Array.isArray(update)) {
          const active = row.expiresAt > new Date()
          row.count = active ? (row.count || 0) + 1 : 1
          if (!active) row.expiresAt = new Date(Date.now() + 3600000)
          return
        }
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
const details = { businessName: 'New Shop', email: 'owner@test.com', expiresInDays: 7 }
const owner = { ownerName: 'Shop Owner', email: 'owner@test.com', password: 'strong-password', currency: 'NGN' }

test('uncertain Gmail delivery keeps an emailed key redeemable and limits retries', async () => {
  const db = fixture(); let delivered
  const service = await createRegistration({ ...db, sendBusinessRegistrationKey: async message => { delivered = message; throw new Error('Provider response timeout') } })
  await assert.rejects(service.issuePublic({ ...details, businessName: '' }, '127.0.0.1'), /business name/)
  assert.equal(db.rows('public_registration_key_rate_limits').length, 0)
  await assert.rejects(service.issuePublic(details, '127.0.0.1'), /any key received is still valid/)
  assert.equal(db.rows('business_registration_keys')[0].deliveryStatus, 'unconfirmed')
  for (let attempt = 0; attempt < 2; attempt++) await assert.rejects(service.issuePublic(details, '127.0.0.1'), /confirm email delivery/)
  await assert.rejects(service.issuePublic(details, '127.0.0.1'), /Too many key requests/)
  assert.ok((await service.redeem({ ...owner, key: delivered.key })).businessId)
})

test('successful public requests return delivery details without exposing the key', async () => {
  const db = fixture(); let delivered
  const service = await createRegistration({ ...db, sendBusinessRegistrationKey: async message => { delivered = message } })
  const result = await service.issuePublic(details, '127.0.0.1')
  assert.equal(result.email, details.email)
  assert.equal(result.key, undefined)
  assert.equal(db.rows('business_registration_keys')[0].deliveryStatus, 'sent')
  assert.ok((await service.redeem({ ...owner, key: delivered.key })).businessId)
})

test('registration retains safe actionable mail diagnostics without leaking secrets',async()=>{
  const db=fixture()
  const service=await createRegistration({...db,sendBusinessRegistrationKey:async()=>{throw Object.assign(new Error('secret-token and private email'),{mailStage:'authorization',mailCode:'invalid_grant',responseCode:400})}})
  await assert.rejects(service.issuePublic(details,'127.0.0.1'),error=>error.statusCode===503&&!error.message.includes('secret-token'))
  const row=db.rows('business_registration_keys')[0]
  assert.deepEqual(row.deliveryFailure,{stage:'authorization',code:'invalid_grant',status:400})
  assert.equal(JSON.stringify(row).includes('secret-token'),false)
})

test('keys are unpredictable, hashed at rest and bound to email and business', async () => {
  const db = fixture(); const service = await registrationService(db)
  const issued = await service.issue(details)
  assert.match(issued.businessId, /^new-shop-[a-f0-9]{10}$/)
  assert.match(issued.key, /^SBIT-[a-f0-9]{48}$/)
  assert.equal(db.rows('business_registration_keys')[0]._id, registrationKeyHash(issued.key))
  assert.ok(!JSON.stringify(db.rows('business_registration_keys')).includes(issued.key))
  await assert.rejects(service.redeem({ ...owner, email: 'other@test.com', key: issued.key }), /another email/)
  const result = await service.redeem({ ...owner, key: issued.key, businessId: 'attacker-chosen' })
  assert.equal(result.businessId, issued.businessId)
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

test('registration generates a safe business ID and rejects invalid email and excessive expiry', () => {
  assert.throws(() => registrationInput({ ...details, expiresInDays: 31 }))
  assert.throws(() => registrationInput({ ...details, email: '' }))
  const generated = registrationInput({ ...details, businessId: '../other' })
  assert.match(generated.businessId, /^new-shop-[a-f0-9]{10}$/)
})
