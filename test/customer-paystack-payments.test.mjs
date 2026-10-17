import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createCustomerPaystackPayments } from '../cloud/customer-paystack-payments.mjs'
import { posSettings } from '../server/pos-pricing.mjs'

function matches(record, filter = {}) {
  return Object.entries(filter).every(([key, value]) => {
    const actual = record?.[key]
    if (value && typeof value === 'object' && '$in' in value) return value.$in.includes(actual)
    return actual === value
  })
}

function setup({ purpose = 'wallet', currency = 'USD' } = {}) {
  const sessions = new Map(), operationRows = new Map(), calls = []
  const accountUpdatedAt = new Date('2026-01-01T00:00:00.000Z')
  const claims = purpose === 'wallet'
    ? { kind: 'customer', sub: '0123456789abcdef01234567', businessId: 'shop', customerId: 'customer-1', authVersion: accountUpdatedAt.getTime() }
    : { kind: 'customer', guest: true, sub: 'guest', businessId: 'shop', customerId: 'guest-1' }
  const order = {
    id: 'online-order-1', kind: 'counter-order', source: 'customer-portal', customerPortalId: claims.customerId,
    acceptedTillId: 'till-123456789012', status: 'queued', branchId: 'main', tillId: 'customer-portal',
    currency, businessName: 'Test Shop', customerName: 'Ada', total: 10, retailOrder: true,
    diningOption: 'Takeaway', lines: [{ id: 'line-1', name: 'Coffee', quantity: 1, price: 10, productId: '', options: [] }],
    pos: { tillId: 'customer-portal', customerId: '', customerName: 'Ada', discountType: 'amount', discountValue: 0, loyaltyRedeemed: 0, tax: posSettings(), note: '' },
  }
  let initialization
  const sessionCollection = {
    createIndex: async () => {},
    findOne: async filter => [...sessions.values()].find(row => matches(row, filter)) || null,
    insertOne: async row => { if ([...sessions.values()].some(saved => saved.state === row.state || saved.reference === row.reference || saved.businessId === row.businessId && saved.requestId === row.requestId || row.activeKey && saved.businessId === row.businessId && saved.activeKey === row.activeKey)) throw Object.assign(new Error('duplicate'), { code: 11000 }); sessions.set(row.state, structuredClone(row)) },
    updateOne: async (filter, update) => { const row = [...sessions.values()].find(saved => matches(saved, filter)); if (!row) return { modifiedCount: 0 }; Object.assign(row, update.$set || {}); for (const key of Object.keys(update.$unset || {})) delete row[key]; return { modifiedCount: 1 } },
  }
  const accountDeletions = { findOne: async () => null }
  const database = { collection: name => name === 'customer_paystack_sessions' ? sessionCollection : accountDeletions }
  const entityHeads = { findOne: async filter => {
    if (filter.entityType === 'customer') return { payload: { id: claims.customerId } }
    if (filter.entityType === 'pos_record' && filter.entityId === order.id) return { payload: order }
    return null
  } }
  const operations = {
    findOne: async filter => [...operationRows.values()].find(row => matches(row, filter)) || null,
    updateOne: async (filter, update) => { if (!operationRows.has(filter.operationId)) operationRows.set(filter.operationId, update.$setOnInsert); return { upsertedCount: 1 } },
  }
  const businessSettings = { findOne: async () => ({ settings: { currency, paymentPolicy: { allowWallet: true } } }) }
  const customerPortalAccounts = { findOne: async () => ({ _id: claims.sub, businessId: 'shop', customerId: 'customer-1', active: true, updatedAt: accountUpdatedAt }) }
  const fetcher = async (url, options) => {
    calls.push({ url, options })
    if (url.endsWith('/transaction/initialize')) {
      initialization = JSON.parse(options.body)
      return { ok: true, json: async () => ({ status: true, data: { reference: initialization.reference, authorization_url: 'https://checkout.paystack.com/test-code', access_code: 'test-code' } }) }
    }
    return { ok: true, json: async () => ({ status: true, data: { id: 123, status: 'success', reference: initialization.reference, amount: Number(initialization.amount), currency: initialization.currency, metadata: JSON.parse(initialization.metadata) } }) }
  }
  const responses = []
  const send = (response, status, body) => { response.status = status; response.body = body; responses.push(response); return true }
  const ObjectId = class { constructor(value) { this.value = value } toString() { return this.value } static isValid(value) { return /^[a-f\d]{24}$/i.test(String(value)) } }
  const handler = createCustomerPaystackPayments({ database, entityHeads, operations, businessSettings, customerPortalAccounts, verifyToken: () => claims, readJson: async request => request.input, send, serialize: (_businessId, job) => job(), configFor: async () => ({ secretKey: 'sk_test_for-test' }), env: { SUBSCRIPTION_PUBLIC_URL: 'https://app.example.test' }, fetcher, ObjectId })
  const request = (path, input) => ({ method: input ? 'POST' : 'GET', socket: { remoteAddress: '127.0.0.1' }, headers: {}, input })
  const response = () => ({ writeHead(status, headers) { this.status = status; this.headers = headers }, end() { this.ended = true } })
  return { handler, request, response, sessions, operationRows, calls, order, claims }
}

test('wallet checkout verifies Paystack and credits the customer ledger once', async () => {
  const f = setup()
  await f.handler.ensure()
  const startResponse = f.response()
  await f.handler.handle(f.request('/start', { purpose: 'wallet', amount: 25.5, requestId: 'wallet-request-1234', email: 'ada@example.test' }), startResponse, new URL('https://api.test/v1/customer-portal/paystack/start'))
  assert.equal(startResponse.status, 200)
  assert.equal(startResponse.body.authorizationUrl, 'https://checkout.paystack.com/test-code')
  assert.equal(f.calls[0].options.headers.Authorization, 'Bearer sk_test_for-test')
  const session = [...f.sessions.values()][0]
  const callback = () => f.handler.handle(f.request('/return'), f.response(), new URL(`https://api.test/v1/customer-portal/paystack-return?state=${session.state}`))
  await callback()
  await callback()
  const credits = [...f.operationRows.values()].filter(row => row.entityType === 'wallet')
  assert.equal(credits.length, 1)
  assert.equal(credits[0].payload.amount, 25.5)
  assert.equal(f.sessions.get(session.state).status, 'paid')
})

test('wallet webhook rejects unsigned events and applies a signed verified event', async () => {
  const f = setup()
  const startUrl = new URL('https://api.test/v1/customer-portal/paystack/start')
  await f.handler.handle(f.request('/start', { purpose: 'wallet', amount: 5, requestId: 'wallet-webhook-1234', email: 'ada@example.test' }), f.response(), startUrl)
  const session = [...f.sessions.values()][0]
  const body = { event: 'charge.success', data: { reference: session.reference } }
  const raw = Buffer.from(JSON.stringify(body))
  const response = f.response()
  await f.handler.handleWebhookPayload({ headers: { 'x-paystack-signature': 'invalid' } }, response, raw, body)
  assert.equal(response.status, 401)
  assert.equal(f.operationRows.size, 0)

  const signature = createHmac('sha512', 'sk_test_for-test').update(raw).digest('hex')
  const signedResponse = f.response()
  await f.handler.handleWebhookPayload({ headers: { 'x-paystack-signature': signature } }, signedResponse, raw, body)
  assert.equal(signedResponse.status, 200)
  assert.equal([...f.operationRows.values()].filter(row => row.entityType === 'wallet').length, 1)
  assert.equal(f.sessions.get(session.state).status, 'paid')
})

test('wallet checkout enforces Paystack currency minimums and whole-franc XOF amounts', async () => {
  for (const [currency, amount] of [['USD', 1], ['NGN', 20], ['KES', 2], ['XOF', 1.25]]) {
    const f = setup({ currency })
    const response = f.response()
    await f.handler.handle(f.request('/start', { purpose: 'wallet', amount, requestId: `minimum-${currency}-1234`, email: 'ada@example.test' }), response, new URL('https://api.test/v1/customer-portal/paystack/start'))
    assert.equal(response.status, 400, `${currency} amount ${amount} should be refused before Paystack initialization`)
    assert.equal(f.calls.length, 0)
  }
  const xof = setup({ currency: 'XOF' })
  const accepted = xof.response()
  await xof.handler.handle(xof.request('/start', { purpose: 'wallet', amount: 1, requestId: 'minimum-XOF-valid-1234', email: 'ada@example.test' }), accepted, new URL('https://api.test/v1/customer-portal/paystack/start'))
  assert.equal(accepted.status, 200)
})

test('accepted retail order checkout creates one verified sale; unaccepted orders cannot start checkout', async () => {
  const f = setup({ purpose: 'order' })
  const startUrl = new URL('https://api.test/v1/customer-portal/paystack/start')
  const request = amount => f.handler.handle(f.request('/start', { purpose: 'order', orderId: f.order.id, amount, requestId: 'order-request-1234', email: 'ada@example.test', catalogMode: 'retail' }), f.response(), startUrl)
  await f.handler.ensure()
  const unaccepted = f.order.acceptedTillId
  f.order.acceptedTillId = ''
  const refused = f.response()
  await f.handler.handle(f.request('/start', { purpose: 'order', orderId: f.order.id, requestId: 'refused-request-1234', email: 'ada@example.test' }), refused, startUrl)
  assert.equal(refused.status, 409)
  f.order.acceptedTillId = unaccepted
  const mismatch = f.response()
  await f.handler.handle(f.request('/start', { purpose: 'order', orderId: f.order.id, amount: 11, requestId: 'mismatch-request-1234', email: 'ada@example.test' }), mismatch, startUrl)
  assert.equal(mismatch.status, 409)
  await request(10)
  assert.equal(f.calls.filter(call => call.url.endsWith('/transaction/initialize')).length, 1)
  const session = [...f.sessions.values()][0]
  await f.handler.handle(f.request('/return'), f.response(), new URL(`https://api.test/v1/customer-portal/paystack-return?state=${session.state}`))
  await f.handler.handle(f.request('/return'), f.response(), new URL(`https://api.test/v1/customer-portal/paystack-return?state=${session.state}`))
  const sales = [...f.operationRows.values()].filter(row => row.entityType === 'sale')
  assert.equal(sales.length, 1)
  assert.equal(sales[0].payload.id, 'counter-payment:online-order-1')
  assert.equal(sales[0].payload.paymentReference, session.reference)
  assert.equal(await f.handler.verifiesOnlineOrderSale('shop', sales[0].payload), true)
  assert.equal(f.sessions.get(session.state).status, 'paid')
})
