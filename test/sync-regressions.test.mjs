import { requiresChurchSync } from '../server/church-ledger.mjs'
import { requiresReservationSync } from '../server/restaurant-reservations.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import vm from 'node:vm'
import { requiresServiceJobSync } from '../server/service-jobs.mjs'
import { requiresStockWorkSync } from '../server/stock-work.mjs'
import { requiresCounterSync, requiresRestaurantSync, counterConflictRecord } from '../server/counter-service.mjs'
import { registerCheckoutTill } from '../server/till-binding.mjs'

for (const path of ['src/lib/browserApi.ts', 'src/lib/mobileApi.ts']) {
  const source = readFileSync(path, 'utf8')
  test(`${path}: settings refresh preserves pending edits and never rolls settings back`,async()=>{
    const sqlite=new DatabaseSync(':memory:')
    sqlite.exec(`CREATE TABLE sync_inbox(operation_id TEXT PRIMARY KEY,received_at TEXT);
      CREATE TABLE sync_outbox(entity_type TEXT,synced_at TEXT);
      CREATE TABLE app_settings(id INTEGER PRIMARY KEY,app_name TEXT,currency TEXT,pos_provider TEXT,pos_terminal_id TEXT,pos_connection TEXT,logo_data TEXT,updated_at TEXT,payment_policy TEXT,shop_profile TEXT);
      INSERT INTO app_settings(id,app_name,currency,updated_at) VALUES(1,'Local shop','NGN','2026-10-08T12:00:01.000Z');
      INSERT INTO sync_outbox VALUES('settings',NULL);`)
    const db={query:async(sql,args=[])=>({values:sqlite.prepare(sql).all(...args)}),run:async(sql,args=[])=>sqlite.prepare(sql).run(...args)}
    const code=source.slice(source.indexOf('async function applyOperation('),source.indexOf('\n// Serialize network sync jobs'))
    const apply=vm.runInNewContext(stripTypeScriptTypes(`(${code})`),{openMobileDatabase:async()=>db,ensureBranches:async()=>{},now:()=>new Date().toISOString()})
    try {
      const remote={operationId:'older-settings',entityType:'settings',action:'upsert',createdAt:'2026-10-08T12:00:00.000Z',payload:{appName:'Old shop',currency:'USD',updatedAt:'2026-10-08T12:00:00.000Z'}}
      await assert.rejects(apply(remote),/unsent changes/)
      assert.equal(sqlite.prepare('SELECT app_name FROM app_settings').get().app_name,'Local shop')
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sync_inbox').get().n,0,'Pending refresh must be retried after upload')
      sqlite.exec('DELETE FROM sync_outbox')
      await apply(remote)
      assert.equal(sqlite.prepare('SELECT app_name FROM app_settings').get().app_name,'Local shop')
      await apply({...remote,operationId:'new-settings',payload:{...remote.payload,appName:'New shop',updatedAt:'2026-10-08T12:00:02.000Z'}})
      assert.equal(sqlite.prepare('SELECT app_name FROM app_settings').get().app_name,'New shop')
      sqlite.exec("UPDATE app_settings SET app_name='My Business',currency='USD',payment_policy='{}',shop_profile=NULL,updated_at='2026-10-08T12:00:03.000Z'")
      await apply({...remote,operationId:'registration-seed',payload:{...remote.payload,appName:'Registered shop'}})
      assert.equal(sqlite.prepare('SELECT app_name FROM app_settings').get().app_name,'Registered shop','Fresh placeholder must hydrate registration settings even if its initialization clock is newer')
    } finally {sqlite.close()}
  })
  test(`${path}: synced partial repayments preserve debt and apply once`, async () => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(`CREATE TABLE customers (id TEXT PRIMARY KEY, balance REAL);
      INSERT INTO customers VALUES ('customer', -300);
      CREATE TABLE wallet_transactions (id TEXT, customer_id TEXT, amount REAL, reason TEXT, created_at TEXT);
      CREATE TABLE sync_inbox (operation_id TEXT PRIMARY KEY, received_at TEXT);`)
    const db = { query: async (sql, args = []) => ({ values: sqlite.prepare(sql).all(...args) }), run: async (sql, args = []) => sqlite.prepare(sql).run(...args) }
    const code = source.slice(source.indexOf('async function applyOperation('), source.indexOf('\n// Serialize network sync jobs'))
    const apply = vm.runInNewContext(stripTypeScriptTypes(`(${code})`), { openMobileDatabase: async () => db, ensureBranches: async () => {}, id: () => 'id', now: () => '2026-01-01' })
    try {
      const operation = { operationId: 'repayment', createdAt: '2026-01-01', entityType: 'wallet', action: 'adjust', payload: { customerId: 'customer', amount: 100 } }
      await apply(operation); await apply(operation)
      assert.equal(sqlite.prepare('SELECT balance FROM customers').get().balance, -200)
      await apply({ ...operation, operationId: 'final', payload: { customerId: 'customer', amount: 250 } })
      assert.equal(sqlite.prepare('SELECT balance FROM customers').get().balance, 50)
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM wallet_transactions').get().n, 2)
    } finally { sqlite.close() }
  })

  for (const acknowledge of [true, false]) test(`${path}: multi-batch upload, acknowledgements=${acknowledge}`, async () => {
    const pending = new Map(Array.from({ length: 501 }, (_, i) => [String(i), { operationId: String(i), payload: '{}' }]))
    const batches = []
    const db = {
      query: async sql => ({ values: sql.includes('COUNT(*)') ? [{ count: pending.size }] : [...pending.values()].slice(0, 500) }),
      run: async (sql, args) => { if (sql.startsWith('UPDATE sync_outbox')) pending.delete(args[1]) },
    }
    const code = source.slice(source.indexOf('async function syncNowImpl('), source.indexOf('\n// Pull-to-refresh'))
    const sync = vm.runInNewContext(stripTypeScriptTypes(`(${code})`), {
      requiresCounterSync, requiresRestaurantSync, requiresServiceJobSync, requiresStockWorkSync, requiresReservationSync, requiresChurchSync, counterConflictRecord,
      registerCheckoutTill, localStorage: { getItem: () => '' },
      getMobileSyncConfiguration: async () => ({ syncApiUrl: 'https://test', businessId: 'shop', deviceId: 'device', deviceToken: 'token' }),
      openMobileDatabase: async () => db, now: () => '2026-01-01',
      pullLatestImpl: async () => ({ pending: pending.size, lastError: '' }),
      originalFetch: async (_, init) => {
        const operations = JSON.parse(init.body).operations
        batches.push(operations.length)
        return { ok: true, json: async () => ({ acceptedOperationIds: acknowledge ? operations.map(o => o.operationId) : [] }) }
      },
    })
    const result = await sync()
    assert.deepEqual(batches, acknowledge ? [500, 1] : [500])
    assert.equal(result.pending, acknowledge ? 0 : 501)
    if (!acknowledge) assert.match(result.lastError, /acknowledge/)
  })

  for(const payload of [{kind:'food-production'},{kind:'church-fund'},{kind:'service-job',church:{type:'pledge'}}]) test(`${path}: an older server keeps ${payload.kind} work queued`,async()=>{
    const pending={operationId:'batch',entityType:'pos_record',payload:JSON.stringify(payload)}
    let uploaded=false,acknowledged=false
    const code=source.slice(source.indexOf('async function syncNowImpl('),source.indexOf('\n// Pull-to-refresh'))
    const sync=vm.runInNewContext(stripTypeScriptTypes(`(${code})`),{
      requiresCounterSync,requiresRestaurantSync,requiresServiceJobSync,requiresStockWorkSync,requiresReservationSync,requiresChurchSync,counterConflictRecord,
      registerCheckoutTill,localStorage:{getItem:()=>''},
      getMobileSyncConfiguration:async()=>({syncApiUrl:'https://test',businessId:'shop',deviceId:'device',deviceToken:'token'}),
      openMobileDatabase:async()=>({query:async sql=>({values:sql.includes('COUNT(*)')?[{count:1}]:[pending]}),run:async()=>{acknowledged=true}}),
      now:()=> '2026-01-01',pullLatestImpl:async()=>({pending:1,lastError:''}),
      originalFetch:async url=>{if(url.endsWith('/v1/sync/push'))uploaded=true;return {ok:true,json:async()=>({capabilities:['service-jobs-v1','counter-v3']})}}
    })
    const result=await sync()
    assert.equal(uploaded,false);assert.equal(acknowledged,false);assert.equal(result.pending,1)
    assert.match(result.lastError,/Update the existing sync server/)
  })
}
