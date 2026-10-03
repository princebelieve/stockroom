import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'
import { randomUUID } from 'node:crypto'
import { migrateRetail } from '../server/retail.mjs'
import { handlePos, ensurePos } from '../server/pos-service.mjs'
import { stockChange } from '../server/stock-ledger.mjs'
import { validQuantity } from '../server/quantities.mjs'
import { validateCheckoutSettings, validateLoyaltyBalance } from '../server/pos-pricing.mjs'
import { counterItems, counterSaleId, validateCounterPayment, validateCounterRetry } from '../server/counter-service.mjs'
import { recordPayment } from '../server/payment.mjs'
import { normalizeCashSale } from '../server/cash.mjs'

test('Android sale route validates the saved order and commits stock, receipt and outbox exactly once', async () => {
  const sqlite = new DatabaseSync(':memory:')
  let transaction = false
  class NativeAdapter {
    query(sql, params = []) { return { values: sqlite.prepare(sql).all(...params) } }
    run(sql, params = [], ownTransaction = false) { if (transaction) assert.equal(ownTransaction, false); return sqlite.prepare(sql).run(...params) }
    execute(sql) { sqlite.exec(sql) }
    beginTransaction() { sqlite.exec('BEGIN'); transaction = true }
    commitTransaction() { sqlite.exec('COMMIT'); transaction = false }
    rollbackTransaction() { sqlite.exec('ROLLBACK'); transaction = false }
  }
  const db = new NativeAdapter()
  try {
    const schema = readFileSync('src/lib/browserSchema.ts', 'utf8').split('export const browserSchema = ')[1].trim()
    sqlite.exec(vm.runInNewContext(schema))
    sqlite.exec('ALTER TABLE app_settings ADD COLUMN shop_profile TEXT')
    sqlite.exec(`INSERT INTO app_settings(id,app_name,currency,updated_at,shop_profile) VALUES(1,'Counter','USD','now','{"fastFood":true}');
      INSERT INTO products(id,name,sku,category,stock,reorder_point,price,cost_price,unit,updated_at) VALUES('drink','Drink','DRINK','Drinks',8,0,3,1,'bottle','now');
      INSERT INTO branch_inventory VALUES('main','drink',8,0,'now');`)
    await migrateRetail(db); await ensurePos(db)
    const user = { id: 'owner', name: 'Owner', role: 'owner' }
    const queue = async (entityType, entityId, action, payload, ownTransaction = false) => db.run('INSERT INTO sync_outbox(operation_id,entity_type,entity_id,action,payload,created_at) VALUES(?,?,?,?,?,?)', [randomUUID(), entityType, entityId, action, JSON.stringify(payload), new Date().toISOString()], ownTransaction)
    const call = (path, input) => handlePos({ db, scope: 'business', branchId: 'main', user, path: '/api/pos/counter/' + path, method: 'POST', input, tillId: 'native-till', sales: async () => [], publish: record => queue('pos_record', record.id, 'upsert', record) })
    const menu = await call('menu', { id: 'counter-menu', commandId: 'menu', expectedUpdatedAt: '', items: [{ id: 'meal', name: 'Meal', price: 5, type: 'prepared', available: true, productId: '', options: [] }, { id: 'drink', name: 'Drink', price: 3, type: 'stock', productId: 'drink', available: true, options: [] }] })
    const order = await call('orders', { id: 'native-order', commandId: 'order', expectedUpdatedAt: '', menuUpdatedAt: menu.updatedAt, lines: [{ id: 'food', menuItemId: 'meal', quantity: 1, optionIds: [] }, { id: 'bottle', menuItemId: 'drink', quantity: 1, optionIds: [] }] })
    const source = readFileSync('src/lib/mobileApi.ts', 'utf8')
    const route = source.slice(source.indexOf("  if (path === '/api/sales' && method === 'POST')"), source.indexOf("  if (path === '/api/sales' && method === 'GET')"))
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status })
    const handler = vm.runInNewContext(stripTypeScriptTypes(`(async function(init) { const path='/api/sales',method='POST',branchId='main'; ${route} })`), {
      db, user, Headers, json, error: (message, status = 400) => json({ error: message }, status), body: async init => JSON.parse(init.body), subscriptionStatus: async () => ({ blocked: false }),
      recordPayment, normalizeCashSale, validateCounterPayment, validateCounterRetry, validateCheckoutSettings, validateLoyaltyBalance, validQuantity, stockChange, queue, id: randomUUID, now: () => new Date().toISOString()
    })
    const sale = { id: counterSaleId(order.id), currency: 'USD', total: order.total, createdAt: new Date().toISOString(), paymentMethod: 'cash', items: counterItems(order), paymentDetails: { amountReceived: 10, pos: order.pos, counterOrder: { id: order.id, tillId: 'native-till' } } }
    const send = (value, till = 'native-till') => handler({ headers: { 'X-Stockroom-Till': till }, body: JSON.stringify(value) })
    assert.equal((await send(sale, 'wrong-till')).status, 400)
    assert.equal((await send({ ...sale, currency: 'EUR' })).status, 400)
    const response = await send(sale); assert.equal(response.status, 201, JSON.stringify(await response.json()))
    assert.equal((await send(sale)).status, 200)
    assert.equal((await send({ ...sale, paymentDetails: { ...sale.paymentDetails, amountReceived: 20 } })).status, 400)
    assert.equal(sqlite.prepare('SELECT stock FROM branch_inventory').get().stock, 7)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sale_items').get().n, 2)
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM sync_outbox WHERE entity_type='sale'").get().n, 1)
  } finally { sqlite.close() }
})
