import assert from 'node:assert/strict'
import test from 'node:test'
import { paymentPolicy, recordPayment } from '../server/payment.mjs'

test('payment policy retains only approved extras and accounts for cash change', () => {
  const policy = paymentPolicy({ allowExtras: true, reasonForChange: true, printExtraDetails: false, reasons: ['tip', 'other'] })
  const sale = recordPayment({ paymentMethod: 'cash', total: 10, paymentDetails: { amountReceived: '15', extraKept: '2', reason: 'tip' } }, policy)
  assert.equal(sale.paymentDetails.extraKept, 2)
  assert.equal(sale.paymentDetails.changeGiven, 3)
  assert.equal(sale.paymentDetails.printExtraDetails, false)
  assert.throws(() => recordPayment({ paymentMethod: 'cash', total: 10, paymentDetails: { amountReceived: '12', extraKept: '2', reason: 'rounding' } }, policy), /owner-approved reason/)
  assert.throws(() => recordPayment({ paymentMethod: 'cash', total: 10, paymentDetails: { amountReceived: '12', extraKept: '0' } }, policy), /Change returned/)
})

