import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import vm from 'node:vm'

for (const path of ['src/lib/browserApi.ts', 'src/lib/mobileApi.ts']) {
  const source = readFileSync(path, 'utf8')
  test(`${path}: synced partial repayments preserve debt and apply once`, async () => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(`CREATE TABLE customers (id TEXT PRIMARY KEY, balance REAL);
      INSERT INTO customers VALUES ('customer', -300);
      CREATE TABLE wallet_transactions (id TEXT, customer_id TEXT, amount REAL, reason TEXT, created_at TEXT);
      CREATE TABLE sync_inbox (operation_id TEXT PRIMARY KEY, received_at TEXT);`)
    const db = { query: async (sql, args = []) => ({ values: sqlite.prepare(sql).all(...args) }), run: async (sql, args = []) => sqlite.prepare(sql).run(...args) }
    const code = source.slice(source.indexOf('async function applyOperation('), source.indexOf('\n// Serialize network sync jobs'))
    const apply = vm.runInNewContext(stripTypeScriptTypes(`(${code})`), { openMobileDatabase: async () => db, id: () => 'id', now: () => '2026-01-01' })
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
}
