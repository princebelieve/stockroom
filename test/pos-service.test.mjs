import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { ensurePos, handlePos, applyPosRecord } from '../server/pos-service.mjs'

function setup() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`CREATE TABLE branch_inventory (product_id TEXT, branch_id TEXT, stock REAL);
    INSERT INTO branch_inventory VALUES ('item','main',5);
    CREATE TABLE customers (id TEXT PRIMARY KEY, balance REAL);
    INSERT INTO customers VALUES ('customer',0);
    CREATE TABLE wallet_transactions (id TEXT PRIMARY KEY,customer_id TEXT,amount REAL,reason TEXT,created_at TEXT);
    CREATE TABLE inventory_movements (id TEXT PRIMARY KEY,product_id TEXT,quantity REAL,reason TEXT,created_at TEXT,branch_id TEXT);`)
  const db = { query: async (sql, args = []) => ({ values: sqlite.prepare(sql).all(...args) }), run: async (sql, args = []) => sqlite.prepare(sql).run(...args), beginTransaction: async () => sqlite.exec('BEGIN'), commitTransaction: async () => sqlite.exec('COMMIT'), rollbackTransaction: async () => sqlite.exec('ROLLBACK') }
  const user = { id: 'owner', name: 'Owner', role: 'owner' }
  const sales = [{ id: 'sale', total: 10, paymentMethod: 'cash', items: [{ productId: 'item', quantity: 2, price: 5 }], paymentDetails: { pos: { customerId: 'customer' } } }]
  const published = []
  const call = (path, input, actor = user) => handlePos({ db, scope: 'shop', branchId: 'main', user: actor, path: `/api/pos/${path}`, method: 'POST', input, sales: async () => sales, publish: async record => { published.push(record) } })
  return { sqlite, db, call, sales, published }
}

test('partial return restocks and credits the wallet with ledgers exactly once', async () => {
  const { sqlite, db, call } = setup()
  try {
    const input = { id: 'return', saleId: 'sale', reason: 'Wrong item', method: 'wallet', items: [{ lineIndex: 0, quantity: 1, restock: true }] }
    const record = await call('returns', input)
    await call('returns', input)
    await applyPosRecord(db, 'shop', record)
    assert.equal(sqlite.prepare('SELECT stock FROM branch_inventory').get().stock, 6)
    assert.equal(sqlite.prepare('SELECT balance FROM customers').get().balance, 5)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM wallet_transactions').get().n, 1)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_movements').get().n, 1)
    await assert.rejects(call('returns', { ...input, id: 'too-many', items: [{ lineIndex: 0, quantity: 2 }] }), /remaining/)
    await assert.rejects(call('returns', { ...input, id: 'cashier' }, { id: 'cashier', role: 'cashier' }), /admin access/)
  } finally { sqlite.close() }
})

test('return rolls back stock if its wallet account is missing', async () => {
  const { sqlite, call } = setup()
  try {
    sqlite.exec('DELETE FROM customers')
    await assert.rejects(call('returns', { id: 'return', saleId: 'sale', reason: 'Wrong item', method: 'wallet', items: [{ lineIndex: 0, quantity: 1, restock: true }] }), /account is not available/)
    assert.equal(sqlite.prepare('SELECT stock FROM branch_inventory').get().stock, 5)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_movements').get().n, 0)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM pos_records').get().n, 0)
  } finally { sqlite.close() }
})

test('register close accounts for sale cash, refund cash and reasoned movements', async () => {
  const { sqlite, call, sales } = setup()
  try {
    const register = await call('registers', { action: 'open', amount: 50 })
    sales[0].paymentDetails.pos.registerId = register.id
    await call('returns', { id: 'return', saleId: 'sale', reason: 'Wrong item', method: 'cash', items: [{ lineIndex: 0, quantity: 1 }] })
    await call('registers', { id: register.id, action: 'movement', direction: 'out', amount: 3, reason: 'Petty cash' })
    await assert.rejects(call('registers', { id: register.id, action: 'close', amount: 51 }), /Explain/)
    const closed = await call('registers', { id: register.id, action: 'close', amount: 52 })
    assert.equal(closed.cashSales, 10)
    assert.equal(closed.cashReturns, 5)
    assert.equal(closed.expectedCash, 52)
    assert.equal(closed.difference, 0)
  } finally { sqlite.close() }
})
