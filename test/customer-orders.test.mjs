import test from 'node:test'
import assert from 'node:assert/strict'
import { authorizeCustomerOrder, customerOrderLines, acceptCustomerOrder } from '../cloud/customer-orders.mjs'
import { counterActionTill, validateCounterPayment, validateCounterRecord } from '../server/counter-service.mjs'

test('restaurant packaged goods and overlapping option recipes match local stock snapshots', async () => {
  const menu = { items: [{ id: 'drink', name: 'Drink', price: 3, available: true, type: 'stock', productId: 'bottle', recipe: [{ productId: 'ignored', quantity: 4 }], options: [{ id: 'extra', name: 'Extra', price: 2, recipe: [{ productId: 'bottle', quantity: 1 }, { productId: 'ice', quantity: 0.1 }] }] }] }
  const requested = [{ menuItemId: 'drink', quantity: 2, optionIds: ['extra'] }]
  const [line] = await customerOrderLines(menu, requested, true, async id => ({ name: id, unit: 'piece' }))
  assert.equal(line.station, 'bar'); assert.equal(line.productId, ''); assert.equal(line.price, 5)
  assert.deepEqual(line.ingredients.map(({ productId, quantity }) => ({ productId, quantity })), [{ productId: 'bottle', quantity: 2 }, { productId: 'ice', quantity: 0.1 }])
  await assert.rejects(customerOrderLines(menu, [{ ...requested[0], optionIds: ['extra', 'extra'] }], true, async () => ({})), /quantity/)
  await assert.rejects(customerOrderLines(menu, requested, true, async () => null), /update this menu/)
})

test('order retry ownership cannot cross customer or guest sessions', () => {
  authorizeCustomerOrder({ customerPortalId: 'guest-one' }, 'guest-one')
  authorizeCustomerOrder({ pos: { customerId: 'legacy-customer' } }, 'legacy-customer')
  assert.throws(() => authorizeCustomerOrder({ customerPortalId: 'guest-one' }, 'guest-two'), error => error.statusCode === 403)
})

function fixture() {
  let head = { businessId: 'shop', entityType: 'pos_record', entityId: 'online-order', operationId: 'created', updatedAt: '2026-01-01', payload: { id: 'online-order', source: 'customer-portal', status: 'queued', tillId: 'customer-portal', acceptedTillId: '', events: [] } }
  let chain = Promise.resolve(), fail = false
  const published = new Map()
  const serialize = (_, task) => { const next = chain.catch(() => {}).then(task); chain = next; return next }
  const entityHeads = { findOne: async query => query.businessId === head.businessId ? structuredClone(head) : null, updateOne: async (query, update) => { if (query.operationId !== head.operationId) return { modifiedCount: 0 }; Object.assign(head, update.$set); return { modifiedCount: 1 } } }
  const operations = { updateOne: async (query, update) => { if (fail) { fail = false; throw new Error('connection lost') }; if (!published.has(query.operationId)) published.set(query.operationId, update.$setOnInsert) } }
  const accept = tillId => acceptCustomerOrder({ entityHeads, operations, serialize, businessId: 'shop', orderId: 'online-order', tillId, staffId: 'cashier' })
  return { accept, published, failNext: () => { fail = true }, head: () => head }
}

test('competing tills get exactly one acceptance; retries publish once', async () => {
  const f = fixture()
  const results = await Promise.allSettled([f.accept('till-aaaaaaaaaaaa'), f.accept('till-bbbbbbbbbbbb')])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.match(results.find(result => result.status === 'rejected').reason.message, /Another till/)
  assert.equal(counterActionTill(f.head().payload), 'till-aaaaaaaaaaaa')
  assert.equal(f.head().payload.tillId, 'till-aaaaaaaaaaaa')
  await f.accept('till-aaaaaaaaaaaa')
  assert.equal(f.published.size, 1); assert.equal(f.head().payload.events.length, 1)
})

test('acceptance retry repairs publication after a crash without reopening ownership', async () => {
  const f = fixture(); f.failNext()
  await assert.rejects(f.accept('till-aaaaaaaaaaaa'), /connection lost/)
  await assert.rejects(f.accept('till-bbbbbbbbbbbb'), /Another till/)
  await f.accept('till-aaaaaaaaaaaa')
  assert.equal(f.published.size, 1); assert.equal(f.head().payload.events.length, 1)
})

test('unaccepted online orders cannot take payment; accepted ownership is immutable', () => {
  const order = { id: 'order', kind: 'counter-order', branchId: 'main', source: 'customer-portal', tillId: 'customer-portal', status: 'queued' }
  const sale = { id: 'counter-payment:order', branchId: 'main', paymentDetails: { counterOrder: { id: 'order' } } }
  assert.throws(() => validateCounterPayment(sale, order, 'till-a'), /Accept this online order/)
  assert.throws(() => validateCounterPayment(sale, { ...order, acceptedTillId: 'till-a' }, 'till-b'), /till that created/)
  const valid = { ...order, updatedAt: '2026-01-01T00:00:00Z', expectedUpdatedAt: '', currency: 'USD', businessName: 'Shop', createdAt: '2026-01-01T00:00:00Z', total: 10, customerName: 'Ada', note: '', lines: [{ id: 'line', name: 'Meal', menuItemId: 'meal', options: [], ingredients: [], quantity: 1, price: 10 }] }
  assert.throws(() => validateCounterRecord({ ...valid, acceptedTillId: 'till-a', status: 'preparing' }, valid), /details cannot be changed/)
})
