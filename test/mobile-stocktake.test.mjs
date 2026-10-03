import { stockChange,stockSchema } from '../server/stock-ledger.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { randomUUID } from 'node:crypto'
import vm from 'node:vm'

test('Android outbox joins the caller transaction without starting a nested native transaction',async()=>{
  const source=readFileSync('src/lib/mobileApi.ts','utf8')
  const code=source.slice(source.indexOf('async function queue('),source.indexOf('async function ensureBranches('))
  let calls=0
  const queue=vm.runInNewContext(stripTypeScriptTypes(`(${code})`),{openMobileDatabase:async()=>({run:async(sql,args,transaction)=>{assert.equal(transaction,false);calls++}}),id:randomUUID,now:()=>new Date().toISOString()})
  await queue('stock','milk','adjust',{amount:-1})
  assert.equal(calls,1)
})

test('Android stocktake sync applies once and rolls back a partially failed approval', async () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`CREATE TABLE products (id TEXT PRIMARY KEY, stock INTEGER, reorder_point INTEGER DEFAULT 0, updated_at TEXT,cost_price REAL DEFAULT 4);
    CREATE TABLE branch_inventory (branch_id TEXT, product_id TEXT, stock REAL, reorder_point INTEGER, updated_at TEXT, PRIMARY KEY(branch_id,product_id));
    INSERT INTO branch_inventory VALUES ('main','coffee',10,0,'');
    CREATE TABLE sync_inbox (operation_id TEXT PRIMARY KEY, received_at TEXT);
    CREATE TABLE inventory_movements (id TEXT PRIMARY KEY, product_id TEXT, quantity INTEGER, reason TEXT, created_at TEXT, branch_id TEXT);
    INSERT INTO products (id,stock,updated_at) VALUES ('coffee', 10, '');`)
  sqlite.exec(stockSchema)
  const db = {
    query: async (sql, args = []) => ({ values: sqlite.prepare(sql).all(...args) }),
    run: async (sql, args = []) => sqlite.prepare(sql).run(...args),
    beginTransaction: async () => sqlite.exec('BEGIN'),
    commitTransaction: async () => sqlite.exec('COMMIT'),
    rollbackTransaction: async () => sqlite.exec('ROLLBACK'),
  }
  const source = readFileSync('src/lib/mobileApi.ts', 'utf8')
  const code = source.slice(source.indexOf('async function applyOperation('), source.indexOf('\n// Serialize network sync jobs'))
  const apply = vm.runInNewContext(stripTypeScriptTypes(`(${code})`), { stockChange, openMobileDatabase: async () => db, id: randomUUID, now: () => new Date().toISOString() })
  const operation = { operationId: 'approval', entityType: 'stocktake', action: 'approved', createdAt: new Date().toISOString(), payload: { approvalReason: 'Shelf count', counts: [{ productId: 'coffee', variance: -2 }] } }
  try {
    await apply(operation)
    await apply(operation)
    assert.equal(sqlite.prepare('SELECT stock FROM branch_inventory').get().stock, 8)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_movements').get().n, 1)
    await assert.rejects(apply({ ...operation, operationId: 'broken', payload: { counts: [{ productId: 'coffee', variance: -1 }, { productId: 'missing', variance: 1 }] } }))
    assert.equal(sqlite.prepare('SELECT stock FROM branch_inventory').get().stock, 8)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sync_inbox').get().n, 1)
  } finally { sqlite.close() }
})
