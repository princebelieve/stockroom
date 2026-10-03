import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { recordPayment } from '../server/payment.mjs'
import { validateCheckoutSettings } from '../server/pos-pricing.mjs'
import { businessWorkspace, normalizeShopProfile } from '../server/shop-profile.mjs'
import { DatabaseSync } from 'node:sqlite'
import { migrateRetail } from '../server/retail.mjs'

test('legacy mobile receipt migration preserves goods, line order, indexes and sale foreign keys', async () => {
  const sqlite = new DatabaseSync(':memory:')
  try {
    sqlite.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE products(id TEXT PRIMARY KEY);
      CREATE TABLE sales(id TEXT PRIMARY KEY);
      CREATE TABLE sale_items(id TEXT PRIMARY KEY, sale_id TEXT NOT NULL REFERENCES sales(id), product_id TEXT NOT NULL REFERENCES products(id), product_name TEXT NOT NULL, quantity REAL NOT NULL, unit_price REAL NOT NULL, unit_cost REAL NOT NULL DEFAULT 0);
      CREATE INDEX receipt_lines ON sale_items(sale_id);
      INSERT INTO products VALUES('paper'); INSERT INTO sales VALUES('receipt');
      INSERT INTO sale_items VALUES('z','receipt','paper','Paper',2,3,1),('a','receipt','paper','Card',1,5,2);`)
    const db = {
      execute: sql => sqlite.exec(sql), query: (sql, params = []) => ({ values: sqlite.prepare(sql).all(...params) }), run: (sql, params = []) => sqlite.prepare(sql).run(...params),
      beginTransaction: () => sqlite.exec('BEGIN'), commitTransaction: () => sqlite.exec('COMMIT'), rollbackTransaction: () => sqlite.exec('ROLLBACK')
    }
    await migrateRetail(db); await migrateRetail(db)
    assert.deepEqual(sqlite.prepare('SELECT id FROM sale_items ORDER BY rowid').all().map(row => row.id), ['z', 'a'])
    assert.equal(sqlite.prepare('SELECT unit_cost FROM sale_items WHERE id=?').get('z').unit_cost, 1)
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='receipt_lines'").get().n, 1)
    sqlite.prepare('INSERT INTO sale_items(id,sale_id,product_id,product_name,quantity,unit_price) VALUES(?,?,?,?,?,?)').run('payment', 'receipt', 'service:printing', 'Printing', 1, 12)
    assert.throws(() => sqlite.prepare('INSERT INTO sale_items(id,sale_id,product_id,product_name,quantity,unit_price) VALUES(?,?,?,?,?,?)').run('bad', 'missing', 'service:printing', 'Printing', 1, 12), /FOREIGN KEY/)
    assert.equal(sqlite.prepare('PRAGMA foreign_key_check').all().length, 0)
  } finally { sqlite.close() }
})

const sale = { id: 'simple-payment', total: 15, createdAt: new Date().toISOString(), paymentMethod: 'cash', items: [{ productId: 'service:payment', productName: 'Printing flyers', quantity: 1, price: 15 }], paymentDetails: { amountReceived: 20, servicePayment: { customerName: 'Ada', customerPhone: '08012345678' } } }

test('service payments preserve customer snapshots, validate amounts and cannot disguise stock goods', () => {
  const payment = recordPayment(sale)
  assert.deepEqual(payment.paymentDetails.servicePayment, sale.paymentDetails.servicePayment)
  assert.equal(payment.changeGiven, 5)
  assert.throws(() => recordPayment({ ...sale, total: 14 }), /does not match/)
  assert.throws(() => recordPayment({ ...sale, items: [{ ...sale.items[0], productId: 'goods' }] }), /cannot include stock/)
  assert.throws(() => recordPayment({ ...sale, paymentDetails: { ...sale.paymentDetails, servicePayment: { customerName: 'Ada', customerPhone: null } } }), /customer details/)
  assert.doesNotThrow(() => validateCheckoutSettings(payment, { offlineStockPoolsEnabled: true, stockPools: { 'other-till': 'other-branch' } }))
})

test('workflow settings survive profile round trips and select separate screens', () => {
  for (const workflows of ['stock', 'payments', 'both']) {
    const profile = normalizeShopProfile({ mode: 'general', industry: 'general', workflows })
    assert.equal(normalizeShopProfile(JSON.stringify(profile)).workflows, workflows)
    assert.equal(businessWorkspace(profile).stock, workflows !== 'payments')
    assert.equal(businessWorkspace(profile).payments, workflows !== 'stock')
  }
  assert.equal(businessWorkspace({ mode: 'suggested', industry: 'supermarket' }).stock, true)
})

test('saved and replayed service payments leave products, movements and batches untouched', async () => {
  process.env.STOCKROOM_DATA_DIR = await mkdtemp(join(tmpdir(), 'stockroom-service-payments-'))
  const db = await import('../server/db.mjs')
  const product = db.createProduct({ name: 'Paper', sku: 'PAPER', category: 'Supplies', stock: 10, reorder: 0, price: 3, cost: 1, unit: 'piece' })
  const count = table => db.database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n
  const before = { movements: count('inventory_movements'), batches: count('stock_batches') }
  const saved = db.createSale(sale)
  db.createSale(sale)
  assert.equal(db.listSales().filter(row => row.id === sale.id).length, 1)
  assert.equal(db.listProducts().find(row => row.id === product.id).stock, 10)
  assert.equal(count('inventory_movements'), before.movements)
  assert.equal(count('stock_batches'), before.batches)
  assert.deepEqual(db.listSales()[0].paymentDetails.servicePayment, sale.paymentDetails.servicePayment)
  db.applyRemoteOperations([{ operationId: 'remote-service-payment', entityType: 'sale', action: 'create', payload: { ...saved, id: 'remote-service', items: [{ ...sale.items[0], productId: 'service:remote' }] } }])
  assert.equal(db.listProducts().find(row => row.id === product.id).stock, 10)
  assert.deepEqual(db.listSales().find(row => row.id === 'remote-service').paymentDetails.servicePayment, sale.paymentDetails.servicePayment)
})
