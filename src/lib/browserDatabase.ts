import { migrateRetail } from '../../server/retail.mjs'
import initSqlJs, { type Database, type SqlValue } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { browserSchema } from './browserSchema'

export type BrowserSyncConfiguration = { syncApiUrl: string; businessId: string; deviceId: string; deviceToken: string }
const enrollmentStorageKey = 'stockroom-pwa-enrollment'
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
      if (!current.exec('PRAGMA table_info(branches)')[0]?.values?.some(row => row[1] === 'is_active')) current.run('ALTER TABLE branches ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1')
      if (!current.exec('PRAGMA table_info(branches)')[0]?.values?.some(row => row[1] === 'assigned_user_ids')) current.run("ALTER TABLE branches ADD COLUMN assigned_user_ids TEXT NOT NULL DEFAULT '[]'")
      for (const table of ['inventory_movements', 'sales', 'expenses', 'sale_item_voids']) {
        const columns = current.exec(`PRAGMA table_info(${table})`)[0]?.values || []
        if (!columns.some(row => row[1] === 'branch_id')) current.run(`ALTER TABLE ${table} ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'main'`)
      }
      const expenseColumns = current.exec('PRAGMA table_info(expenses)')[0]?.values || []
      if (!expenseColumns.some(row => row[1] === 'staff_id')) current.run("ALTER TABLE expenses ADD COLUMN staff_id TEXT NOT NULL DEFAULT ''")
      const expenseColumnsAfter = current.exec('PRAGMA table_info(expenses)')[0]?.values || []
      if (!expenseColumnsAfter.some(row => row[1] === 'staff_name')) current.run("ALTER TABLE expenses ADD COLUMN staff_name TEXT NOT NULL DEFAULT ''")
      if (!current.exec('PRAGMA table_info(app_settings)')[0]?.values.some(row => row[1] === 'logo_data')) current.run("ALTER TABLE app_settings ADD COLUMN logo_data TEXT NOT NULL DEFAULT ''")
      if (!current.exec('PRAGMA table_info(customers)')[0].values.some(row=>row[1]==='birthday'))current.run("ALTER TABLE customers ADD COLUMN birthday TEXT DEFAULT ''; ALTER TABLE customers ADD COLUMN birthday_reminders INTEGER NOT NULL DEFAULT 0")
      if (!current.exec('PRAGMA table_info(users)')[0].values.some(row => row[1] === 'permissions')) current.run('ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT NULL')
      if (!current.exec('PRAGMA table_info(users)')[0].values.some(row => row[1] === 'username')) current.run("ALTER TABLE users ADD COLUMN username TEXT NOT NULL DEFAULT ''")
      if (!current.exec('PRAGMA table_info(products)')[0]?.values.some(row => row[1] === 'custom_values')) current.run("ALTER TABLE products ADD COLUMN custom_values TEXT NOT NULL DEFAULT '{}'")
      if (!current.exec('PRAGMA table_info(products)')[0]?.values.some(row => row[1] === 'barcode')) current.run("ALTER TABLE products ADD COLUMN barcode TEXT NOT NULL DEFAULT ''")
      if (!current.exec('PRAGMA table_info(app_settings)')[0].values.some(row => row[1] === 'payment_policy')) current.run("ALTER TABLE app_settings ADD COLUMN payment_policy TEXT NOT NULL DEFAULT '{}'")
      if (!current.exec('PRAGMA table_info(app_settings)')[0].values.some(row => row[1] === 'shop_profile')) current.run("ALTER TABLE app_settings ADD COLUMN shop_profile TEXT NOT NULL DEFAULT 'null'")
      if (!current.exec('PRAGMA table_info(sales)')[0].values.some(row => row[1] === 'payment_details')) current.run('ALTER TABLE sales ADD COLUMN payment_details TEXT')
      for (const column of ['cash_received', 'change_given']) {
        const info = current.exec('PRAGMA table_info(sales)')[0]
        if (!info.values.some(row => row[1] === column)) current.run(`ALTER TABLE sales ADD COLUMN ${column} REAL`)
      }
      await migrateRetail({
        execute: (sql: string) => current!.run(sql),
        run: (sql: string, params: any[] = []) => current!.run(sql, params),
        query: (sql: string, params: any[] = []) => { const statement = current!.prepare(sql); try { statement.bind(params); const values = []; while (statement.step()) values.push(statement.getAsObject()); return { values } } finally { statement.free() } },
        beginTransaction: () => current!.run('BEGIN'), commitTransaction: () => current!.run('COMMIT'), rollbackTransaction: () => current!.run('ROLLBACK')
      })
      dirty = true
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
  // The SQL snapshot contains all offline business data. Keep this small,
  // security-sensitive enrollment record separately as well, so a repaired
  // snapshot cannot turn a signed-in PWA into an apparently new browser.
  // Both stores are same-origin browser storage; this is a resilience copy,
  // not a broader credential exposure.
  localStorage.setItem(enrollmentStorageKey, JSON.stringify(config))
  const db = await openBrowserDatabase()
  for (const [key, value] of Object.entries(config)) {
    await db.run('INSERT INTO mobile_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, value])
  }
}

export async function getBrowserSyncConfiguration(): Promise<BrowserSyncConfiguration | null> {
  const db = await openBrowserDatabase()
  const rows = await db.query('SELECT key, value FROM mobile_settings WHERE key IN (?, ?, ?, ?)', ['syncApiUrl', 'businessId', 'deviceId', 'deviceToken'])
  const config = Object.fromEntries(rows.values.map(row => [String(row.key), String(row.value)]))
  if (config.syncApiUrl && config.businessId && config.deviceId && config.deviceToken) return config as BrowserSyncConfiguration
  try {
    const saved = JSON.parse(localStorage.getItem(enrollmentStorageKey) || 'null') as Partial<BrowserSyncConfiguration> | null
    if (!saved?.syncApiUrl || !saved.businessId || !saved.deviceId || !saved.deviceToken) return null
    const restored: BrowserSyncConfiguration = { syncApiUrl: saved.syncApiUrl, businessId: saved.businessId, deviceId: saved.deviceId, deviceToken: saved.deviceToken }
    // Heal the primary offline database during the current serialized request.
    await saveBrowserSyncConfiguration(restored)
    return restored
  } catch {
    return null
  }
}
