import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handlePos, ensurePos } from '../server/pos-service.mjs'
import { counterItems, counterSaleId, validateCounterPayment, validateCounterRecord } from '../server/counter-service.mjs'
import { recordPayment } from '../server/payment.mjs'
import { normalizeShopProfile, businessWorkspace } from '../server/shop-profile.mjs'

const owner = { id: 'owner', name: 'Owner', role: 'owner' }
const items = [{ id: 'burger', name: 'Burger', type: 'prepared', price: 10, available: true, productId: '', options: [{ id: 'cheese', name: 'Cheese', price: 2 }] }, { id: 'drink', name: 'Drink', type: 'stock', productId: 'bottle', price: 3, available: true, options: [] }]
function fixture() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`CREATE TABLE app_settings(id INTEGER PRIMARY KEY,shop_profile TEXT,app_name TEXT DEFAULT 'Shop',currency TEXT DEFAULT 'USD'); INSERT INTO app_settings(id,shop_profile) VALUES(1,'{"fastFood":true}'); CREATE TABLE products(id TEXT PRIMARY KEY); INSERT INTO products VALUES('bottle'); CREATE TABLE sync_outbox(id TEXT PRIMARY KEY,payload TEXT);`)
  let transaction = false
  const db = { query: (sql, params = []) => ({ values: sqlite.prepare(sql).all(...params) }), run: (sql, params = [], ownTransaction = true) => { if (transaction) assert.equal(ownTransaction, false, 'native commands must not start nested transactions'); return sqlite.prepare(sql).run(...params) }, beginTransaction: () => { sqlite.exec('BEGIN'); transaction = true }, commitTransaction: () => { sqlite.exec('COMMIT'); transaction = false }, rollbackTransaction: () => { sqlite.exec('ROLLBACK'); transaction = false } }
  const sales = []
  const call = (path, input = {}, user = owner, tillId = 'till') => handlePos({ db, scope: 'business', branchId: 'main', user, path: `/api/pos/counter${path}`, method: path === '' ? 'GET' : 'POST', input, tillId, sales: () => sales, publish: record => db.run('INSERT INTO sync_outbox VALUES(?,?)', [crypto.randomUUID(), JSON.stringify(record)], false) })
  return { sqlite, db, call, sales }
}
test('fast food is opt-in, with an exclusive workspace and preserved supermarket defaults', () => {
  assert.equal(businessWorkspace({ mode: 'suggested', industry: 'supermarket' }).fastFood, false)
  const profile = normalizeShopProfile({ workflows: 'fast-food' })
  const workspace = businessWorkspace(JSON.stringify(profile))
  assert.equal(workspace.fastFood, true); assert.equal(workspace.stock, false); assert.equal(workspace.payments, false)
  assert.equal(businessWorkspace({ workflows: 'both', fastFood: true }).stock, true)
})
test('orders snapshot priced options, survive reload, reject stale updates and require payment before handover', async () => {
  const f = fixture()
  try {
    const menu = await f.call('/menu', { id: 'counter-menu', commandId: 'menu1', expectedUpdatedAt: '', items })
    await assert.rejects(f.call('/menu', { id: 'counter-menu', commandId: 'forbidden', expectedUpdatedAt: menu.updatedAt, items }, { ...owner, role: 'cashier' }), /owner or admin/)
    const request = { id: 'order1', commandId: 'create1', expectedUpdatedAt: '', menuUpdatedAt: menu.updatedAt, customerName: 'Ada', note: 'No onions', lines: [{ id: 'line1', menuItemId: 'burger', quantity: 2, optionIds: ['cheese'] }, { id: 'line2', menuItemId: 'drink', quantity: 1, optionIds: [] }] }
    let order = await f.call('/orders', request)
    assert.equal(order.total, 27); assert.equal(order.status, 'queued')
    assert.deepEqual((await f.call('/orders', request)).lines, order.lines)
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM sync_outbox').get().n, 2)
    assert.equal((await f.call('')).orders.length, 1)
    const updatedMenu = await f.call('/menu', { id: 'counter-menu', commandId: 'menu2', expectedUpdatedAt: menu.updatedAt, items: items.map(item => ({ ...item, price: 99 })) })
    assert.equal((await f.call('')).orders[0].total, 27)
    await assert.rejects(f.call('/orders', { ...request, id: 'stale', commandId: 'stale' }), /menu changed/)
    const oldRevision = order.updatedAt
    order = await f.call('/status', { id: order.id, commandId: 'prepare', expectedUpdatedAt: order.updatedAt, status: 'preparing' })
    await assert.rejects(f.call('/status', { id: order.id, commandId: 'stale-status', expectedUpdatedAt: oldRevision, status: 'ready' }), /record changed/)
    assert.throws(() => validateCounterRecord({ ...order, status: 'ready', total: 100 }, order), /total|details/)
    order = await f.call('/status', { id: order.id, commandId: 'ready', expectedUpdatedAt: order.updatedAt, status: 'ready' })
    await assert.rejects(f.call('/status', { id: order.id, commandId: 'collect', expectedUpdatedAt: order.updatedAt, status: 'collected' }), /Take payment/)
    const sale = recordPayment({ id: counterSaleId(order.id), currency: order.currency, branchId: 'main', total: order.total, items: counterItems(order), paymentMethod: 'cash', paymentDetails: { amountReceived: 30, counterOrder: { id: order.id, tillId: 'till' } } })
    assert.equal(sale.changeGiven, 3)
    assert.equal(sale.items[0].productId, 'service:counter:line1'); assert.equal(sale.items[1].productId, 'bottle')
    assert.throws(() => validateCounterPayment(sale, order, 'other'), /till that created/)
    assert.throws(() => validateCounterPayment({ ...sale, total: 20 }, order, 'till'), /match/)
    validateCounterPayment(sale, order, 'till'); f.sales.push(sale)
    order = await f.call('/status', { id: order.id, commandId: 'collect', expectedUpdatedAt: order.updatedAt, status: 'collected' })
    assert.equal(order.events.length, 4)
    assert.equal((await f.call('')).orders[0].receiptId, sale.id)
    assert.ok(updatedMenu.updatedAt > menu.updatedAt)
  } finally { f.sqlite.close() }
})
test('disabled workspace rejects counter API commands and failed outbox writes roll back orders', async () => {
  const f = fixture()
  try {
    f.sqlite.exec("UPDATE app_settings SET shop_profile='{}'")
    await assert.rejects(f.call(''), /enable/)
    f.sqlite.exec("UPDATE app_settings SET shop_profile='{\"fastFood\":true}'")
    await ensurePos(f.db)
    f.sqlite.exec("CREATE TRIGGER fail_queue BEFORE INSERT ON sync_outbox BEGIN SELECT RAISE(ABORT,'outbox failure'); END")
    await assert.rejects(f.call('/menu', { id: 'counter-menu', commandId: 'menu', expectedUpdatedAt: '', items }), /outbox failure/)
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM pos_records').get().n, 0)
  } finally { f.sqlite.close() }
})
test('production payments deduct only packaged goods, and duplicate retries never deduct again', async () => {
  process.env.STOCKROOM_DATA_DIR = await mkdtemp(join(tmpdir(), 'stockroom-counter-'))
  const db = await import('../server/db.mjs')
  await db.updateShopProfile(normalizeShopProfile({ workflows: 'fast-food' }))
  const bottle = db.createProduct({ name: 'Bottle', sku: 'BOTTLE', price: 3, cost: 1, stock: 8, reorder: 0, unit: 'bottle', category: 'Drinks' })
  const menu = await db.posAction('/api/pos/counter/menu', 'POST', { id: 'counter-menu', commandId: 'menu', expectedUpdatedAt: '', items: items.map(item => item.type === 'stock' ? { ...item, productId: bottle.id } : item) }, owner, 'main', 'till')
  const order = await db.posAction('/api/pos/counter/orders', 'POST', { id: 'production', commandId: 'create', expectedUpdatedAt: '', menuUpdatedAt: menu.updatedAt, lines: [{ id: 'food', menuItemId: 'burger', quantity: 1, optionIds: [] }, { id: 'drink', menuItemId: 'drink', quantity: 2, optionIds: [] }] }, owner, 'main', 'till')
  assert.equal(db.listProducts()[0].stock, 8, 'ordering alone does not deduct stock')
  const sale = { id: counterSaleId(order.id), currency: order.currency, branchId: 'main', total: order.total, createdAt: new Date().toISOString(), paymentMethod: 'cash', items: counterItems(order), paymentDetails: { amountReceived: 20, counterOrder: { id: order.id, tillId: 'till' } } }
  assert.throws(() => db.createSale(sale, true, 'main', 'other'), /till that created/)
  db.createSale(sale, true, 'main', 'till'); db.createSale(sale, true, 'main', 'till')
  assert.equal(db.listProducts()[0].stock, 6)
  assert.equal(db.listSales().length, 1)
  assert.throws(() => db.createSale({ ...sale, paymentDetails: { ...sale.paymentDetails, amountReceived: 30 } }, true, 'main', 'till'), /already paid/)
  assert.equal(db.database.prepare("SELECT COUNT(*) AS n FROM sync_outbox WHERE entity_type='sale'").get().n, 1)
  const preparing = await db.posAction('/api/pos/counter/status', 'POST', { id: order.id, commandId: 'prepare', expectedUpdatedAt: order.updatedAt, status: 'preparing' }, owner, 'main', 'till')
  const ready = await db.posAction('/api/pos/counter/status', 'POST', { id: order.id, commandId: 'ready', expectedUpdatedAt: preparing.updatedAt, status: 'ready' }, owner, 'main', 'till')
  db.recordSyncConflicts([{ operationId: 'rejected-ready', entityType: 'pos_record', entityId: order.id, localPayload: ready, remotePayload: preparing, reason: 'Concurrent preparation update' }])
  const restored = await db.posAction('/api/pos/counter', 'GET', {}, owner, 'main', 'till')
  assert.equal(restored.orders[0].status, 'preparing', 'accepted cloud state must replace even a newer rejected local timestamp')
  assert.equal(restored.receipts[0].currency, order.currency)
  assert.equal(db.database.prepare("SELECT COUNT(*) AS n FROM sync_conflicts WHERE operation_id='rejected-ready'").get().n, 1)
})
