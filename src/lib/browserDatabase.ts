import initSqlJs, { type Database, type SqlValue } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { browserSchema } from './browserSchema'

export type BrowserSyncConfiguration = { syncApiUrl: string; businessId: string; deviceId: string; deviceToken: string }
let current: Database | null = null
let dirty = false
let pending: Promise<unknown> = Promise.resolve()
const engine = () => initSqlJs({ locateFile: () => wasmUrl })
let sql: ReturnType<typeof engine> | undefined

function storage(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('stockroom-pwa', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('database')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function snapshot(bytes?: Uint8Array): Promise<Uint8Array | undefined> {
  const db = await storage()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('database', bytes ? 'readwrite' : 'readonly')
      const store = tx.objectStore('database')
      const request = bytes ? store.put(bytes, 'main') : store.get('main')
      // A successful request is not yet a durable transaction.
      tx.oncomplete = () => resolve(bytes || request.result)
      tx.onabort = () => reject(tx.error || new Error('Local storage could not save this change.'))
      tx.onerror = () => reject(tx.error)
    })
  } finally { db.close() }
}

// Serialize a complete API operation, including its outbox, and persist before
// acknowledging success. Web Locks also prevent two tabs overwriting each other.
export function withBrowserDatabase(action: () => Promise<Response>): Promise<Response> {
  const run = async () => {
    if (!navigator.locks) throw new Error('This browser is too old for safe offline storage. Please update iOS or your browser.')
    return navigator.locks.request('stockroom-pwa-database', async () => {
      const SQL = await (sql ||= engine())
      current = new SQL.Database(await snapshot())
      current.run(browserSchema)
      try { current.run("ALTER TABLE app_settings ADD COLUMN logo_data TEXT NOT NULL DEFAULT ''") } catch {}
      try { current.run("ALTER TABLE products ADD COLUMN barcode TEXT NOT NULL DEFAULT ''") } catch {}
      dirty = false
      current.run('BEGIN')
      try {
        const response = await action()
        if (response.ok) {
          current.run('COMMIT')
          if (dirty) await snapshot(current.export())
        } else current.run('ROLLBACK')
        return response
      } finally { current.close(); current = null }
    })
  }
  const result = pending.then(run, run)
  pending = result.catch(() => undefined)
  return result
}

export async function openBrowserDatabase() {
  if (!current) throw new Error('Browser database must be accessed inside a request.')
  const db = current
  return {
    async query(statement: string, parameters: unknown[] = []) {
      const prepared = db.prepare(statement)
      try {
        prepared.bind(parameters as SqlValue[])
        const values: Record<string, any>[] = []
        while (prepared.step()) values.push(prepared.getAsObject())
        return { values }
      } finally { prepared.free() }
    },
    async run(statement: string, parameters: unknown[] = []) { db.run(statement, parameters as SqlValue[]); dirty = true },
    async beginTransaction() { db.run('SAVEPOINT operation') },
    async commitTransaction() { db.run('RELEASE operation') },
    async rollbackTransaction() { db.run('ROLLBACK TO operation'); db.run('RELEASE operation') },
  }
}

export async function saveBrowserSyncConfiguration(config: BrowserSyncConfiguration) {
  const db = await openBrowserDatabase()
  for (const [key, value] of Object.entries(config)) {
    await db.run('INSERT INTO mobile_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, value])
  }
}

export async function getBrowserSyncConfiguration(): Promise<BrowserSyncConfiguration | null> {
  const db = await openBrowserDatabase()
  const rows = await db.query('SELECT key, value FROM mobile_settings WHERE key IN (?, ?, ?, ?)', ['syncApiUrl', 'businessId', 'deviceId', 'deviceToken'])
  const config = Object.fromEntries(rows.values.map(row => [String(row.key), String(row.value)]))
  return config.syncApiUrl && config.businessId && config.deviceId && config.deviceToken ? config as BrowserSyncConfiguration : null
}
