import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { createSubscriptions } from '../cloud/subscriptions.mjs'

// In-memory Mongo test double: executes the operators used by the routes.
// Production Mongo concurrency and provider delivery still require staging checks.
const field = (row, path) => path.split('.').reduce((value, key) => value?.[key], row)
function matches(row, query) {
  return Object.entries(query).every(([key, value]) => {
    const actual = field(row, key)
    if (value && typeof value === 'object' && !(value instanceof Date)) return Object.entries(value).every(([op, expected]) => {
      if (op === '$exists') return (actual !== undefined) === expected
      if (op === '$ne') return Array.isArray(actual) ? !actual.includes(expected) : actual !== expected
      if (op === '$gt') return actual > expected
      if (op === '$lte') return actual <= expected
      throw new Error('Unsupported test query: ' + op)
    })
    return actual === value || (actual == null && value === null)
  })
}
function expression(value, row, now) {
  if (value === '$$NOW') return now
  if (typeof value === 'string' && value.startsWith('$')) return field(row, value.slice(1))
  if (Array.isArray(value)) return value.map(item => expression(item, row, now))
  if (!value || typeof value !== 'object' || value instanceof Date) return value
  const evaluate = input => expression(input, row, now)
  const [op, input] = Object.entries(value)[0]
  if (!op.startsWith('$')) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, evaluate(item)]))
  if (op === '$ifNull') { const [a, b] = evaluate(input); return a ?? b }
  if (op === '$size') return evaluate(input).length
  if (op === '$eq') { const [a, b] = evaluate(input); return a === b }
  if (op === '$lt') { const [a, b] = evaluate(input); return a < b }
  if (op === '$cond') return evaluate(input[0]) ? evaluate(input[1]) : evaluate(input[2])
  if (op === '$max') return evaluate(input).reduce((a, b) => a > b ? a : b)
  if (op === '$concatArrays') return evaluate(input).flat()
  if (op === '$add') { const args = evaluate(input); const sum = args.reduce((total, item) => total + Number(item), 0); return args.some(item => item instanceof Date) ? new Date(sum) : sum }
  if (op === '$multiply') return evaluate(input).reduce((a, b) => a * b, 1)
  if (op === '$divide') { const [a, b] = evaluate(input); return a / b }
  if (op === '$floor') return Math.floor(evaluate(input))
  throw new Error('Unsupported test expression: ' + op)
}
function memoryDatabase() {
  const collections = new Map()
  return { collection(name) {
    if (collections.has(name)) return collections.get(name)
    const rows = []
    const collection = {
      rows, createIndex: async () => {},
      findOne: async query => structuredClone(rows.find(row => matches(row, query)) || null),
      find(query) { const found = rows.filter(row => matches(row, query)); return { sort() { return this }, limit() { return this }, toArray: async () => structuredClone(found), async *[Symbol.asyncIterator]() { yield* found } } },
      async insertOne(row) { if (rows.some(item => item._id === row._id)) throw Object.assign(new Error('Duplicate'), { code: 11000 }); rows.push(structuredClone(row)) },
      async updateOne(query, update, options = {}) {
        let row = rows.find(item => matches(item, query))
        let inserted = false
        if (!row && options.upsert) { row = { _id: query._id }; rows.push(row); inserted = true }
        if (!row) return { modifiedCount: 0 }
        if (Array.isArray(update)) Object.assign(row, expression(update[0].$set, structuredClone(row), new Date()))
        else Object.assign(row, inserted ? structuredClone(update.$setOnInsert || {}) : {}, structuredClone(update.$set || {}))
        return { modifiedCount: 1 }
      },
      async findOneAndUpdate(query, update, options) { await this.updateOne(query, update, options); return this.findOne(query) },
    }
    collections.set(name, collection)
    return collection
  } }
}

test('cloud routes enforce developer authorization and attribute first/recurring credits once', async () => {
  const oldUrl = process.env.SUBSCRIPTION_PUBLIC_URL
  const oldKey = process.env.PAYSTACK_SECRET_KEY
  const oldDeveloperEmail = process.env.DEVELOPER_EMAIL
  process.env.SUBSCRIPTION_PUBLIC_URL = 'https://app.test'
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_fake'
  process.env.DEVELOPER_EMAIL = 'buyer@test.local'
  try {
    const database = memoryDatabase()
    const accounts = database.collection('accounts')
    await accounts.insertOne({ _id: 'a', businessId: 'buyer', email: 'buyer@test.local', role: 'owner' })
    await accounts.insertOne({ _id: 'b', businessId: 'referrer', email: 'referrer@test.local', role: 'owner' })
    const handler = await createSubscriptions({ database, accounts, verifyToken: request => request.claims,
      send: (response, status, data) => { response.status = status; response.data = data },
      fetcher: async (url, options) => {
        if (url.endsWith('/initialize')) {
          const input = JSON.parse(options.body)
          assert.equal(input.plan, undefined)
          assert.equal(input.authorization_code, undefined)
          return Response.json({ status: true, data: { authorization_url: 'https://checkout.paystack.com/test' } })
        }
        const reference = url.split('/').at(-1)
        const payment = await database.collection('subscription_payments').findOne({ _id: reference })
        return Response.json({ status: true, data: { reference, amount: payment.amount, currency: payment.currency, status: 'success', customer: { email: payment.email } } })
      },
    })
    const call = async (path, { method = 'GET', input, businessId = 'buyer' } = {}) => {
      const request = Readable.from([Buffer.from(JSON.stringify(input || {}))])
      Object.assign(request, { url: '/v1/subscriptions' + path, method, headers: {}, claims: { kind: 'access', role: 'owner', businessId, email: `${businessId}@test.local` } })
      const response = { setHeader() {} }
      await handler(request, response)
      return response
    }
    assert.equal((await call('/setup', { businessId: 'referrer' })).status, 403)
    assert.equal((await call('/setup')).data.testMode, true)
    assert.equal((await call('/test-mode', { method: 'PUT', input: { testMode: false } })).status, 409)
    assert.equal((await call('/setup', { method: 'PUT', input: { amount: 999, currency: 'NGN', days: 30, reminderDays: 7, firstReferralPercent: 15, recurringReferralPercent: 5 } })).status, 200)
    const info = await call('/referrals', { businessId: 'referrer' })
    const code = new URL(info.data.link).searchParams.get('ref')
    assert.equal((await call('/referrals', { method: 'POST', businessId: 'referrer', input: { code } })).status, 400)
    assert.equal((await call('/referrals', { method: 'POST', input: { code } })).status, 200)
    assert.equal((await call('/referrals', { method: 'POST', input: { code } })).status, 409)
    const first = (await call('/checkout', { method: 'POST' })).data.reference
    const second = (await call('/checkout', { method: 'POST' })).data.reference
    const [firstVerification, secondVerification] = await Promise.all([call('/verify', { method: 'POST', input: { reference: first } }), call('/verify', { method: 'POST', input: { reference: second } })])
    assert.equal(firstVerification.status, 200)
    assert.equal(secondVerification.status, 200)
    const before = await database.collection('subscriptions').findOne({ _id: 'buyer' })
    await Promise.all([call('/verify', { method: 'POST', input: { reference: first } }), call('/verify', { method: 'POST', input: { reference: first } })])
    const after = await database.collection('subscriptions').findOne({ _id: 'buyer' })
    assert.equal(+before.expiresAt, +after.expiresAt)
    assert.equal(after.references.length, 2)
    const credits = database.collection('referral_commissions').rows
    assert.equal(credits.length, 2)
    assert.equal(credits.find(row => row.kind === 'first').amount, 149)
    assert.equal(credits.find(row => row.kind === 'recurring').amount, 49)
    assert.equal((await call('/verify', { method: 'POST', businessId: 'referrer', input: { reference: first } })).status, 400)
    assert.equal((await call('/test-mode', { method: 'PUT', input: { testMode: false } })).status, 200)
    assert.equal((await call('/access', { businessId: 'referrer' })).data.blocked, true)
    assert.equal((await call('/test-mode', { method: 'PUT', input: { testMode: true } })).status, 200)
    assert.equal((await call('/access', { businessId: 'referrer' })).data.blocked, false)

    assert.equal((await call('/setup', { method: 'PUT', input: { monthlyAmount: 999, yearlyAmount: 9999, enterpriseAmount: 50000, enterpriseDays: 365, currency: 'NGN', reminderDays: 7, freeTrialDays: 0, firstReferralPercent: 15, recurringReferralPercent: 5 } })).status, 200)
    assert.equal((await call('/enterprise-request', { method: 'POST', businessId: 'referrer', input: { message: 'Two locations and onboarding support.' } })).status, 201)
    const request = (await call('/enterprise-requests')).data.requests[0]
    assert.equal((await call('/checkout', { method: 'POST', businessId: 'referrer', input: { planId: 'enterprise' } })).status, 409)
    assert.equal((await call('/enterprise-requests/approve', { method: 'POST', input: { requestId: request.id, amount: 175000, currency: 'NGN', days: 400, note: 'Includes onboarding support.' } })).status, 200)
    const enterprisePayment = (await call('/enterprise-checkout', { method: 'POST', businessId: 'referrer' })).data.reference
    assert.ok(enterprisePayment)
    assert.equal((await call('/verify', { method: 'POST', businessId: 'referrer', input: { reference: enterprisePayment } })).status, 200)
    assert.equal((await database.collection('enterprise_subscription_requests').findOne({ _id: request.id })).status, 'paid')
  } finally {
    if (oldUrl === undefined) delete process.env.SUBSCRIPTION_PUBLIC_URL; else process.env.SUBSCRIPTION_PUBLIC_URL = oldUrl
    if (oldKey === undefined) delete process.env.PAYSTACK_SECRET_KEY; else process.env.PAYSTACK_SECRET_KEY = oldKey
    if (oldDeveloperEmail === undefined) delete process.env.DEVELOPER_EMAIL; else process.env.DEVELOPER_EMAIL = oldDeveloperEmail
  }
})
