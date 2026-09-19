import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { recordPayment } from '../server/payment.mjs'

const source = stripTypeScriptTypes(await readFile(new URL('../src/lib/posCart.ts', import.meta.url), 'utf8'))
const { summarizeCart } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const milo = { id: 'milo', name: 'Milo', price: 300 }

test('one Milo at 300 paid with 300 totals 300 with zero change', () => {
  const { cartTotal } = summarizeCart([milo], { milo: 1 })
  const sale = recordPayment({ total: cartTotal, paymentMethod: 'cash', paymentDetails: { amountReceived: '300' } })
  assert.equal(sale.total, 300)
  assert.equal(sale.cashReceived, 300)
  assert.equal(sale.changeGiven, 0)
  assert.equal(sale.paymentDetails.changeGiven, 0)
})

test('repeated catalogue records cannot multiply a cart line', () => {
  const { cartProducts, cartTotal } = summarizeCart([milo, { ...milo }, { ...milo }], { milo: 1 })
  assert.equal(cartProducts.length, 1)
  assert.equal(cartTotal, 300)
})

test('quantities, cash overpayment, underpayment and removal remain consistent', () => {
  const { cartTotal } = summarizeCart([milo], { milo: 3 })
  assert.equal(cartTotal, 900)
  const cash = amountReceived => recordPayment({ total: cartTotal, paymentMethod: 'cash', paymentDetails: { amountReceived } })
  assert.equal(cash('1000').changeGiven, 100)
  assert.throws(() => cash('300'), /less than the sale total/)
  assert.deepEqual(summarizeCart([milo], {}), { cartProducts: [], cartTotal: 0 })
})

test('fractional prices are summed in minor currency units', () => {
  assert.equal(summarizeCart([{ ...milo, price: 0.1 }], { milo: 3 }).cartTotal, 0.3)
})
