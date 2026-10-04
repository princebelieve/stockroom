import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { handlePos, applyPosRecord, ensurePos } from '../server/pos-service.mjs'
import { stockSchema } from '../server/stock-ledger.mjs'
import { validateConsumption, applyConsumptionSync, consumptionId } from '../server/counter-recipes.mjs'
import { buildReports } from '../server/reports.mjs'

const owner = { id: 'owner', name: 'Owner', role: 'owner' }
const menuItems = [{ id: 'burger', name: 'Burger', type: 'prepared', price: 10, available: true, options: [{ id: 'cheese', name: 'Extra cheese', price: 1, recipe: [{ productId: 'cheese', quantity: 1 }] }], recipe: [{ productId: 'flour', quantity: 0.1 }, { productId: 'meat', quantity: 0.2 }] }]
function fixture() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`${stockSchema}
    CREATE TABLE app_settings(id INTEGER PRIMARY KEY,shop_profile TEXT,app_name TEXT,currency TEXT); INSERT INTO app_settings VALUES(1,'{"fastFood":true}','Kitchen','USD');
    CREATE TABLE customers(id TEXT,name TEXT,phone TEXT,balance REAL);
    CREATE TABLE products(id TEXT PRIMARY KEY,name TEXT,unit TEXT,cost_price REAL); INSERT INTO products VALUES('flour','Flour','kg',4),('meat','Meat','kg',10),('cheese','Cheese','piece',0.5);
    CREATE TABLE branch_inventory(branch_id TEXT,product_id TEXT,stock REAL,updated_at TEXT,PRIMARY KEY(branch_id,product_id)); INSERT INTO branch_inventory VALUES('main','flour',1,'now'),('main','meat',1,'now'),('main','cheese',10,'now');
    CREATE TABLE inventory_movements(id TEXT PRIMARY KEY,product_id TEXT,quantity REAL,reason TEXT,created_at TEXT,branch_id TEXT);
    CREATE TABLE outbox(id TEXT PRIMARY KEY,payload TEXT);`)
  let active = false
  const db = {
    query: (sql, args = []) => ({ values: sqlite.prepare(sql).all(...args) }),
    run: (sql, args = [], ownTransaction = true) => { if (active) assert.equal(ownTransaction, false, 'native run must not nest transactions'); return sqlite.prepare(sql).run(...args) },
    beginTransaction: () => { sqlite.exec('BEGIN'); active = true }, commitTransaction: () => { sqlite.exec('COMMIT'); active = false }, rollbackTransaction: () => { sqlite.exec('ROLLBACK'); active = false }
  }
  const call = (path, input = {}, tillId = 'till') => handlePos({ db, scope: 'business', branchId: 'main', user: owner, path: '/api/pos/counter' + path, method: path ? 'POST' : 'GET', input, tillId, sales: () => [], publish: record => db.run('INSERT INTO outbox VALUES(?,?)', [crypto.randomUUID(), JSON.stringify(record)], false) })
  const stock = id => sqlite.prepare('SELECT stock FROM branch_inventory WHERE product_id=?').get(id).stock
  const order = async (quantity = 2, extras = ['cheese']) => {
    const menu = await call('/menu', { id: 'counter-menu', commandId: 'menu', expectedUpdatedAt: '', items: menuItems })
    return call('/orders', { id: 'order', commandId: 'create', expectedUpdatedAt: '', menuUpdatedAt: menu.updatedAt, lines: [{ id: 'food', menuItemId: 'burger', quantity, optionIds: extras }] })
  }
  return { sqlite, db, call, stock, order }
}
test('recipes snapshot base and extra ingredients, consume once at preparation, and retain costs after cancellation', async () => {
  const f = fixture()
  try {
    let order = await f.order()
    assert.equal(f.stock('flour'), 1, 'unprepared orders do not consume ingredients')
    const menu = (await f.call('')).menu
    await f.call('/menu', { id: menu.id, commandId: 'change-recipe', expectedUpdatedAt: menu.updatedAt, items: menu.items.map(item => ({ ...item, recipe: [] })) })
    assert.equal((await f.call('')).orders[0].lines[0].ingredients.length, 3, 'menu changes cannot alter the saved recipe')
    const prepare = { id: order.id, commandId: 'prepare', expectedUpdatedAt: order.updatedAt, status: 'preparing' }
    await assert.rejects(f.call('/status', prepare, 'other'), /original till/)
    order = await f.call('/status', prepare)
    await f.call('/status', prepare)
    assert.equal(f.stock('flour'), 0.8); assert.equal(f.stock('meat'), 0.6); assert.equal(f.stock('cheese'), 8)
    const data = await f.call('')
    assert.equal(data.consumptions.length, 1); assert.equal(data.orders[0].ingredientCost, 5.8)
    validateConsumption(data.consumptions[0], order)
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM stock_events').get().n, 3)
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM inventory_movements').get().n, 3)
    order = await f.call('/status', { id: order.id, commandId: 'cancel', expectedUpdatedAt: order.updatedAt, status: 'cancelled', reason: 'Customer left after cooking' })
    assert.equal(f.stock('meat'), 0.6, 'cancellation cannot restore used ingredients')
    const adjustments = f.sqlite.prepare('SELECT payload FROM stock_events').all().map(row => JSON.parse(row.payload))
    const report = buildReports({ sales: [], items: [], products: [], expenses: [], adjustments })
    assert.equal(report.profit.ingredientCost, 5.8); assert.equal(report.profit.cost, 5.8); assert.equal(report.profit.amount, -5.8)
    assert.equal(report.supermarket.stockLoss, 0, 'recipe costs are not counted twice as stock loss')
    assert.equal(order.status, 'cancelled')
  } finally { f.sqlite.close() }
})
test('insufficient ingredients and failed queue writes roll back preparation, batches and every ingredient', async () => {
  for (const failure of ['shortage', 'outbox']) {
    const f = fixture()
    try {
      const order = await f.order(failure === 'shortage' ? 6 : 2, [])
      if (failure === 'outbox') f.sqlite.exec("CREATE TRIGGER fail_consumption BEFORE INSERT ON outbox WHEN json_extract(NEW.payload,'$.kind')='counter-consumption' BEGIN SELECT RAISE(ABORT,'queue failure'); END")
      await assert.rejects(f.call('/status', { id: order.id, commandId: 'prepare', expectedUpdatedAt: order.updatedAt, status: 'preparing' }), failure === 'shortage' ? /Not enough Meat/ : /queue failure/)
      assert.equal(f.stock('flour'), 1); assert.equal(f.stock('meat'), 1)
      assert.equal((await f.call('')).orders[0].status, 'queued')
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM stock_events').get().n, 0)
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM stock_batches').get().n, 0)
    } finally { f.sqlite.close() }
  }
})
test('food cost uses consumed batches rather than a later product purchase-cost estimate', async () => {
  const f = fixture()
  try {
    f.sqlite.exec("INSERT INTO stock_batches VALUES('meat-batch','main','meat','delivery','',1,12,'2026-01-01','delivery')")
    const order = await f.order(2, [])
    await f.call('/status', { id: order.id, commandId: 'prepare', expectedUpdatedAt: order.updatedAt, status: 'preparing' })
    const record = (await f.call('')).consumptions[0]
    assert.ok(Math.abs(record.ingredients.find(row => row.productId === 'meat').unitCost - 12) < 0.000001)
    assert.equal(record.totalCost, 5.6)
    f.sqlite.exec("UPDATE products SET cost_price=99 WHERE id='meat'")
    assert.equal((await f.call('')).orders[0].ingredientCost, 5.6, 'historical food cost stays unchanged')
  } finally { f.sqlite.close() }
})
test('ingredient validation rejects invalid recipes and expired batches; cancellation before cooking consumes nothing', async () => {
  const f = fixture()
  try {
    await assert.rejects(f.call('/menu', { id: 'counter-menu', commandId: 'bad', expectedUpdatedAt: '', items: [{ ...menuItems[0], recipe: [{ productId: 'flour', quantity: 0.0001 }] }] }), /three decimals/)
    await assert.rejects(f.call('/menu', { id: 'counter-menu', commandId: 'missing', expectedUpdatedAt: '', items: [{ ...menuItems[0], recipe: [{ productId: 'missing', quantity: 1 }] }] }), /existing stock products/)
    let order = await f.order(1, [])
    f.sqlite.exec("INSERT INTO stock_batches VALUES('expired','main','flour','old','2000-01-01',1,4,'2000-01-01','opening')")
    await assert.rejects(f.call('/status', { id: order.id, commandId: 'prepare', expectedUpdatedAt: order.updatedAt, status: 'preparing' }), /sellable stock/)
    order = await f.call('/status', { id: order.id, commandId: 'cancel', expectedUpdatedAt: order.updatedAt, status: 'cancelled', reason: 'Cannot prepare with expired flour' })
    assert.equal(f.stock('flour'), 1); assert.equal((await f.call('')).consumptions.length, 0)
  } finally { f.sqlite.close() }
})
test('native and desktop synchronization replay physical ingredient consumption once with captured batch costs', async () => {
  const source = fixture()
  try {
    const order = await source.order()
    await source.call('/status', { id: order.id, commandId: 'prepare', expectedUpdatedAt: order.updatedAt, status: 'preparing' })
    const record = (await source.call('')).consumptions[0]
    assert.equal(record.id, consumptionId(order.id))
    assert.throws(() => validateConsumption({ ...record, totalCost: 999 }, order), /total/)
    assert.throws(() => validateConsumption(record, { ...order, tillId: 'other' }), /original/)
    for (const synchronous of [false, true]) {
      const f = fixture()
      try {
        await ensurePos(f.db)
        if (synchronous) {
          const adapter = { query: (sql, args) => ({ values: f.sqlite.prepare(sql).all(...args) }), run: (sql, args) => f.sqlite.prepare(sql).run(...args) }
          f.sqlite.exec('BEGIN'); applyConsumptionSync(adapter, record); applyConsumptionSync(adapter, record); f.sqlite.exec('COMMIT')
        } else {
          for (let i = 0; i < 2; i++) { await f.db.beginTransaction(); await applyPosRecord(f.db, 'business', record); await f.db.commitTransaction() }
        }
        assert.equal(f.stock('flour'), 0.8); assert.equal(f.stock('meat'), 0.6); assert.equal(f.stock('cheese'), 8)
        assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM stock_events').get().n, 3)
      } finally { f.sqlite.close() }
    }
  } finally { source.sqlite.close() }
})
