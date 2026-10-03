import test from 'node:test'
import assert from 'node:assert/strict'
import { createPosPaystack, paystackShopConfig } from '../cloud/pos-paystack.mjs'

function setup() {
  const records = new Map(), calls = []
  let paid = false, mismatch = false, failPush = false, failInvoice = false
  const collection = {
    createIndex: async () => {},
    findOne: async filter => records.get(`${filter.businessId}:${filter.orderId}`) || null,
    insertOne: async record => { const key = `${record.businessId}:${record.orderId}`; if (records.has(key)) throw Object.assign(new Error('duplicate'), { code: 11000 }); records.set(key, { ...record }) },
    updateOne: async (filter, change) => Object.assign(records.get(`${filter.businessId}:${filter.orderId}`), change.$set),
  }
  const fetcher = async (url, options) => {
    calls.push({ url, input: options.body ? JSON.parse(options.body) : undefined })
    let data
    if (url.endsWith('/presence')) data = { online: true, available: true }
    else if (url.endsWith('/paymentrequest')) { if (failInvoice) throw new Error('Connection lost'); data = { id: 123, request_code: 'PRQ_test', offline_reference: '12345' } }
    else if (url.endsWith('/event')) { if (failPush) throw new Error('Connection lost'); data = { id: 'event' } }
    else data = { id: 123, amount: mismatch ? 999 : 125050, currency: 'NGN', paid, status: paid ? 'success' : 'pending' }
    return { ok: true, json: async () => ({ status: true, data }) }
  }
  const handler = createPosPaystack({ database: { collection: () => collection }, configFor: business => business === 'shop' ? { secretKey: 'sk_test_placeholder', terminalId: 'TERM', customerCode: 'CUS_walkin' } : null, fetcher })
  const input = { orderId: 'order-123456789', amount: 1250.5, currency: 'NGN', branchId: 'main' }
  const call = async (action, body = input, businessId = 'shop') => (await handler)({ businessId, path: `/v1/pos-paystack/${action}`, method: 'POST', input: body })
  return { call, calls, input, paid: () => { paid = true }, mismatch: () => { mismatch = true }, failPush: () => { failPush = true }, failInvoice: () => { failInvoice = true } }
}

test('terminal delivery does not authorize a sale; verification matches invoice, amount and currency', async () => {
  const fixture = setup()
  assert.equal((await fixture.call('start')).paid, false)
  assert.equal(fixture.calls.find(call => call.url.endsWith('/paymentrequest')).input.amount, 125050)
  assert.deepEqual(fixture.calls.find(call => call.url.endsWith('/event')).input, { type: 'invoice', action: 'process', data: { id: 123, reference: '12345' } })
  assert.equal((await fixture.call('verify')).paid, false)
  fixture.paid()
  assert.equal((await fixture.call('verify')).paid, true)
  fixture.mismatch()
  await assert.rejects(fixture.call('verify'), /different invoice, amount, or currency/)
})

test('retry reuses its invoice and refuses a changed basket or another shop', async () => {
  const fixture = setup()
  await fixture.call('start'); await fixture.call('start')
  assert.equal(fixture.calls.filter(call => call.url.endsWith('/paymentrequest')).length, 1)
  await assert.rejects(fixture.call('start', { ...fixture.input, amount: 2000 }), /different payment request/)
  await assert.rejects(fixture.call('verify', fixture.input, 'another-shop'), /not connected/)
  assert.equal(paystackShopConfig('another-shop', { POS_PAYSTACK_CONFIG_JSON: '{"shop":{"secretKey":"sk_test_placeholder","terminalId":"TERM","customerCode":"CUS"}}' }), null)
})

test('lost terminal response retains a verifiable pending invoice without issuing another charge', async () => {
  const fixture = setup(); fixture.failPush()
  await assert.rejects(fixture.call('start'), /Connection lost/)
  assert.equal((await fixture.call('start')).status, 'pending')
  fixture.paid()
  assert.equal((await fixture.call('verify')).paid, true)
  assert.equal(fixture.calls.filter(call => call.url.endsWith('/paymentrequest')).length, 1)
})

test('uncertain invoice creation is reserved and never automatically charged again', async () => {
  const fixture = setup(); fixture.failInvoice()
  await assert.rejects(fixture.call('start'), /Connection lost/)
  assert.equal((await fixture.call('start')).status, 'uncertain')
  assert.equal((await fixture.call('verify')).status, 'uncertain')
  assert.equal(fixture.calls.filter(call => call.url.endsWith('/paymentrequest')).length, 1)
})
