import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite'

/**
 * Android's local source of truth. Desktop deliberately continues to use
 * server/db.mjs. This module is only loaded on a Capacitor-native platform.
 */
const databaseName = 'stockroom-mobile'
const schemaVersion = 1
let connection: SQLiteDBConnection | null = null

export type MobileSyncConfiguration = {
  syncApiUrl: string
  businessId: string
  deviceId: string
  deviceToken: string
}

export function isNativeMobile() {
  return Capacitor.isNativePlatform()
}

export async function openMobileDatabase() {
  if (!isNativeMobile()) throw new Error('Native SQLite is available only inside the Android application.')
  if (connection) return connection
  const sqlite = new SQLiteConnection(CapacitorSQLite)
  const existing = await sqlite.isConnection(databaseName, false)
  connection = existing.result
    ? await sqlite.retrieveConnection(databaseName, false)
    : await sqlite.createConnection(databaseName, false, 'no-encryption', schemaVersion, false)
  await connection.open()
  await connection.execute(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS mobile_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_outbox (
      operation_id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      synced_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS sync_inbox (
      operation_id TEXT PRIMARY KEY,
      received_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id TEXT PRIMARY KEY,
      operation_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      local_payload TEXT NOT NULL,
      remote_payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'cashier')),
      operational_access INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      payment_policy TEXT NOT NULL DEFAULT '{}',
      id INTEGER PRIMARY KEY CHECK(id = 1),
      app_name TEXT NOT NULL DEFAULT 'My Business',
      currency TEXT NOT NULL DEFAULT 'USD',
      pos_provider TEXT NOT NULL DEFAULT '',
      pos_terminal_id TEXT NOT NULL DEFAULT '',
      pos_connection TEXT NOT NULL DEFAULT 'manual',
      logo_data TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT NOT NULL UNIQUE,
      barcode TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
      reorder_point INTEGER NOT NULL DEFAULT 0 CHECK(reorder_point >= 0),
      price REAL NOT NULL DEFAULT 0 CHECK(price >= 0),
      cost_price REAL NOT NULL DEFAULT 0 CHECK(cost_price >= 0),
      unit TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      total REAL NOT NULL,
      payment_method TEXT NOT NULL,
      payment_reference TEXT NOT NULL DEFAULT '',
      payment_details TEXT,
      cash_received REAL,
      change_given REAL,
      terminal_provider TEXT NOT NULL DEFAULT '',
      staff_id TEXT NOT NULL DEFAULT '',
      staff_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL REFERENCES sales(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      unit_price REAL NOT NULL,
      unit_cost REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      balance REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      incurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `)
  try { await connection.execute("ALTER TABLE app_settings ADD COLUMN logo_data TEXT NOT NULL DEFAULT ''") } catch {}
  const policyColumns = await connection.query('PRAGMA table_info(app_settings)')
  if (!policyColumns.values?.some(row => row.name === 'payment_policy')) await connection.execute("ALTER TABLE app_settings ADD COLUMN payment_policy TEXT NOT NULL DEFAULT '{}'")
  const saleColumns = await connection.query('PRAGMA table_info(sales)')
  if (!saleColumns.values?.some(row => row.name === 'payment_details')) await connection.execute('ALTER TABLE sales ADD COLUMN payment_details TEXT')
  for (const column of ['cash_received', 'change_given']) {
    const columns = await connection.query('PRAGMA table_info(sales)')
    if (!columns.values?.some(row => row.name === column)) await connection.execute(`ALTER TABLE sales ADD COLUMN ${column} REAL`)
  }
  return connection
}

export async function saveMobileSyncConfiguration(config: MobileSyncConfiguration) {
  const db = await openMobileDatabase()
  const entries = Object.entries(config)
  for (const [key, value] of entries) {
    await db.run('INSERT INTO mobile_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value])
  }
}

export async function getMobileSyncConfiguration(): Promise<MobileSyncConfiguration | null> {
  const db = await openMobileDatabase()
  const result = await db.query('SELECT key, value FROM mobile_settings WHERE key IN (?, ?, ?, ?)', ['syncApiUrl', 'businessId', 'deviceId', 'deviceToken'])
  const values = Object.fromEntries((result.values || []).map((row) => [String(row.key), String(row.value)]))
  return values.syncApiUrl && values.businessId && values.deviceId && values.deviceToken ? values as MobileSyncConfiguration : null
}
