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

test('bank transfers and split payments require references and exact totals', () => {
  const transfer = recordPayment({ paymentMethod: 'bank-transfer', total: 12, terminalProvider: 'Example Bank', paymentReference: 'TRX-100', paymentDetails: { amountReceived: '12' } })
  assert.equal(transfer.paymentDetails.amountReceived, 12)
  const split = recordPayment({ paymentMethod: 'multiple', total: 12, paymentDetails: { allocations: [{ method: 'cash', amount: '5' }, { method: 'bank-transfer', amount: '7', provider: 'Example Bank', reference: 'TRX-101' }] } })
  assert.deepEqual(split.paymentDetails.allocations.map(part => part.amount), [5, 7])
  assert.throws(() => recordPayment({ paymentMethod: 'multiple', total: 12, paymentDetails: { allocations: [{ method: 'cash', amount: '5' }, { method: 'bank-transfer', amount: '6', provider: 'Example Bank', reference: 'TRX-101' }] } }), /equal the sale total/)
})
