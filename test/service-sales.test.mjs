import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { refundFor } from '../server/pos-pricing.mjs'

test('service sale saves its receipt without inventory and rejects invalid service lines', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stockroom-services-'))
  process.env.STOCKROOM_DATA_DIR = directory
  const { createSale, listSales, listProducts } = await import('../server/db.mjs')
  try {
    const sale = { id: 'service-test', total: 150, createdAt: new Date().toISOString(), paymentMethod: 'cash', cashReceived: 200, items: [{ productId: 'service:printing', productName: 'A4 DI printing — supplied design', quantity: 3, price: 50 }] }
    const saved = createSale(sale)
    assert.equal(saved.changeGiven, 50)
    assert.equal(listProducts().length, 0)
    const receipt = listSales().find(item => item.id === sale.id)
    assert.equal(receipt.items[0].productName, sale.items[0].productName)
    assert.equal(receipt.items[0].quantity, 3)
    assert.equal(refundFor(sale, [], [{ lineIndex: 0, quantity: 1, restock: true }]).items[0].restock, false)
    assert.throws(() => createSale({ ...sale, id: 'invalid-service', items: [{ ...sale.items[0], productName: '' }] }), /service description/)
    assert.equal(listSales().some(item => item.id === 'invalid-service'), false)
  } finally { await rm(directory, { recursive: true, force: true }).catch(() => {}) }
})
