import test from 'node:test'
import assert from 'node:assert/strict'
import { cashPayment, normalizeCashSale } from '../server/cash.mjs'
test('cash change uses cents, rejects underpayment and preserves unknown historical tender', () => {
  assert.deepEqual(cashPayment(10.1, '20'), { cashReceived: 20, changeGiven: 9.9 })
  assert.deepEqual(cashPayment(10, '10.00'), { cashReceived: 10, changeGiven: 0 })
  for (const value of ['', '-1', '9.99', '10.001', 'NaN', 'Infinity']) assert.throws(() => cashPayment(10, value))
  assert.equal(normalizeCashSale({ paymentMethod: 'cash', total: 10 }).cashReceived, null)
  assert.equal(normalizeCashSale({ paymentMethod: 'cash', total: 10, cashReceived: 20, changeGiven: 500 }).changeGiven, 10)
  assert.equal(normalizeCashSale({ paymentMethod: 'external-pos', total: 10, cashReceived: 20 }).cashReceived, null)
})
