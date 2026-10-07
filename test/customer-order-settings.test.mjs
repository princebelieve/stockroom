import test from 'node:test'
import assert from 'node:assert/strict'
import { customerOrderSettings, customerHandoff } from '../server/customer-order-settings.mjs'
import { paymentPolicy } from '../server/payment.mjs'
test('delivery requires owner configuration and complete contact details', () => {
  const input = { diningOption: 'Delivery', delivery: { phone: '08012345678', address: '12 Market Street, Lagos' } }
  assert.throws(() => customerHandoff({}, input), /not available/)
  assert.throws(() => customerHandoff({ deliveryEnabled: true }, { ...input, delivery: {} }), /phone/)
  assert.throws(() => customerHandoff({ deliveryEnabled: true }, input, true), /not available/)
  assert.deepEqual(customerHandoff({ deliveryEnabled: true, deliveryFee: 2500 }, input).delivery, { ...input.delivery, fee: 2500 })
  assert.equal(customerOrderSettings({ deliveryFee: -1 }).deliveryFee, 0)
  assert.equal(paymentPolicy(JSON.stringify({customerOrdering:{deliveryEnabled:true,deliveryFee:2500}})).customerOrdering.deliveryFee,2500)
  assert.deepEqual(customerHandoff({}, {}, true), {})
})
test('transfer requires complete published bank details', () => {
  assert.throws(() => customerHandoff({}, { paymentMethod: 'bank-transfer' }), /not configured/)
  assert.equal(customerHandoff({ bankName: 'Bank', accountName: 'Shop', accountNumber: '123' }, { paymentMethod: 'bank-transfer' }).diningOption, 'Takeaway')
})
