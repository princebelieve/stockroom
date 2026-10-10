import { nextSettingsTimestamp } from './settings-sync.mjs'
import { birthdayValue } from './customer-birthdays.mjs'
import { parsePermissions } from './staff-permissions.mjs'
import { conflictReview, conflictReviewSchema } from './sync-conflict-review.mjs'
import { oilPricing } from './oil-pricing.mjs'
import { validateChurchRecord } from './church-ledger.mjs'
import { validateReservationBook, validateReservationArchive } from './restaurant-reservations.mjs'
import { isStockWork, validateStockWork, applyStockWorkSync } from './stock-work.mjs'
import { businessDate } from './report-timezone.mjs'
import { validateServiceJob } from './service-jobs.mjs'
import { restaurantSaleStatements, restaurantPaymentFingerprint } from './restaurant-payments.mjs'
import { applyConsumptionSync } from './counter-recipes.mjs'
import { validateCounterPayment, validateCounterRetry, counterConflictRecord } from './counter-service.mjs'
import { validateLoyaltyBalance, validateCheckoutSettings } from './pos-pricing.mjs'
import { stockChangeSync, stockTransferSync } from './stock-ledger.mjs'
import { validQuantity } from './quantities.mjs'
import { migrateRetail, handleRetail, retailStatements } from './retail.mjs'
import { buildReports } from './reports.mjs'
import { handlePos, posSchema } from './pos-service.mjs'
import { readCustomValues, validateCustomValues, validateCoreRequirements } from './shop-fields.mjs'
import { paymentPolicy, recordPayment } from './payment.mjs'
import { normalizeShopProfile, validateShopProfile, workspaceCatalogueSettings, catalogueWorkspaces } from './shop-profile.mjs'
import { normalizeCashSale } from './cash.mjs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const root = dirname(fileURLToPath(import.meta.url))
// Electron supplies a per-user writable folder. Development retains the existing project data folder.
const dataDirectory = process.env.STOCKROOM_DATA_DIR || join(root, 'data')
const databasePath = join(dataDirectory, 'stockroom.sqlite')
const shopConfigPath = join(dataDirectory, 'shop-config.json')
await mkdir(dataDirectory, { recursive: true })

async function readShopConfig() {
  try {
    return JSON.parse(await readFile(shopConfigPath, 'utf8'))
  } catch {
    return {}
  }
}

async function writeShopConfig(config) {
  await import('node:fs/promises').then(({ writeFile }) => writeFile(shopConfigPath, JSON.stringify(config, null, 2)))
}

export const database = new DatabaseSync(databasePath)
// Capture a consistent upgrade backup before touching an established database.
if (database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='products'").get()) {
  const migrationTable = database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get()
  const upgraded = migrationTable && database.prepare("SELECT 1 FROM schema_migrations WHERE module='retail' AND version=2").get()
  if (!upgraded) database.prepare('VACUUM INTO ?').run(join(dataDirectory, `pre-retail-upgrade-${Date.now()}.sqlite`))
}
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_settings (
    organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    app_name TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS branches (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    is_default INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    assigned_user_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(organization_id, name)
  );
  CREATE TABLE IF NOT EXISTS branch_inventory (
    branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
    reorder_point INTEGER NOT NULL DEFAULT 0 CHECK(reorder_point >= 0),
    updated_at TEXT NOT NULL,
    PRIMARY KEY(branch_id, product_id)
  );
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sku TEXT NOT NULL,
    category TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
    reorder_point INTEGER NOT NULL DEFAULT 0 CHECK(reorder_point >= 0),
    price REAL NOT NULL DEFAULT 0 CHECK(price >= 0),
    cost_price REAL NOT NULL DEFAULT 0 CHECK(cost_price >= 0),
    unit TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(organization_id, sku)
  );
  CREATE TABLE IF NOT EXISTS inventory_movements (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    total REAL NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY,
    sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    unit_price REAL NOT NULL CHECK(unit_price >= 0)
    ,unit_cost REAL NOT NULL DEFAULT 0 CHECK(unit_cost >= 0)
  );
  CREATE TABLE IF NOT EXISTS sale_item_voids (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    unit_price REAL NOT NULL CHECK(unit_price >= 0),
    reason TEXT NOT NULL,
    staff_id TEXT NOT NULL,
    staff_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'cashier')),
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS auth_sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    balance REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS wallet_transactions (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS stocktakes (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('draft', 'approved')),
    approval_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    approved_at TEXT
  );
  CREATE TABLE IF NOT EXISTS stocktake_counts (
    id TEXT PRIMARY KEY,
    stocktake_id TEXT NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    expected_quantity INTEGER NOT NULL,
    counted_quantity INTEGER NOT NULL,
    variance INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS stocktake_adjustments (
    id TEXT PRIMARY KEY,
    stocktake_id TEXT NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    expected_quantity INTEGER NOT NULL,
    counted_quantity INTEGER NOT NULL,
    variance INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    incurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    staff_id TEXT NOT NULL DEFAULT '',
    staff_name TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS sync_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id TEXT NOT NULL UNIQUE,
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
  CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
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
`)

database.exec(posSchema)
const organizationId = 'local-shop-organization'
const now = () => new Date().toISOString()
const initialShop = await readShopConfig()
database.prepare('INSERT OR IGNORE INTO organizations (id, name, created_at) VALUES (?, ?, ?)').run(organizationId, initialShop.shopName || 'My Business', now())
database.prepare("INSERT OR IGNORE INTO branches (id, organization_id, name, address, is_default, created_at, updated_at) VALUES ('main', ?, 'Main branch', '', 1, ?, ?)").run(organizationId, now(), now())
const settingsFile = join(dataDirectory, 'settings.json')
let appName = initialShop.appName || 'My Business'
try {
  appName = JSON.parse(await readFile(settingsFile, 'utf8')).appName || appName
} catch {}
if (initialShop.appName) {
  await writeShopConfig({ ...initialShop, appName, shopName: initialShop.shopName || appName })
}
database.prepare('INSERT OR IGNORE INTO app_settings (organization_id, app_name, updated_at) VALUES (?, ?, ?)').run(organizationId, appName, now())
if (!database.prepare('PRAGMA table_info(app_settings)').all().some(row => row.name === 'currency')) database.exec("ALTER TABLE app_settings ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'")
if (!database.prepare('PRAGMA table_info(app_settings)').all().some(row => row.name === 'pos_provider')) database.exec("ALTER TABLE app_settings ADD COLUMN pos_provider TEXT NOT NULL DEFAULT ''")
if (!database.prepare('PRAGMA table_info(app_settings)').all().some(row => row.name === 'pos_terminal_id')) database.exec("ALTER TABLE app_settings ADD COLUMN pos_terminal_id TEXT NOT NULL DEFAULT ''")
if (!database.prepare('PRAGMA table_info(app_settings)').all().some(row => row.name === 'pos_connection')) database.exec("ALTER TABLE app_settings ADD COLUMN pos_connection TEXT NOT NULL DEFAULT 'manual'")
if (!database.prepare('PRAGMA table_info(app_settings)').all().some(row => row.name === 'logo_data')) database.exec("ALTER TABLE app_settings ADD COLUMN logo_data TEXT NOT NULL DEFAULT ''")
if (!database.prepare('PRAGMA table_info(products)').all().some(row => row.name === 'barcode')) database.exec("ALTER TABLE products ADD COLUMN barcode TEXT NOT NULL DEFAULT ''")
if (!database.prepare('PRAGMA table_info(sales)').all().some(row => row.name === 'payment_method')) database.exec("ALTER TABLE sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'external-pos'")
if (!database.prepare('PRAGMA table_info(sales)').all().some(row => row.name === 'payment_reference')) database.exec("ALTER TABLE sales ADD COLUMN payment_reference TEXT NOT NULL DEFAULT ''")
if (!database.prepare('PRAGMA table_info(sales)').all().some(row => row.name === 'terminal_provider')) database.exec("ALTER TABLE sales ADD COLUMN terminal_provider TEXT NOT NULL DEFAULT ''")
if (!database.prepare('PRAGMA table_info(app_settings)').all().some(row => row.name === 'payment_policy')) database.exec("ALTER TABLE app_settings ADD COLUMN payment_policy TEXT NOT NULL DEFAULT '{}'")
if (!database.prepare('PRAGMA table_info(products)').all().some(row => row.name === 'custom_values')) database.exec("ALTER TABLE products ADD COLUMN custom_values TEXT NOT NULL DEFAULT '{}'")
if (!database.prepare('PRAGMA table_info(app_settings)').all().some(row => row.name === 'shop_profile')) database.exec("ALTER TABLE app_settings ADD COLUMN shop_profile TEXT NOT NULL DEFAULT 'null'")
if (!database.prepare('PRAGMA table_info(sales)').all().some(row => row.name === 'payment_details')) database.exec("ALTER TABLE sales ADD COLUMN payment_details TEXT")
if (!database.prepare('PRAGMA table_info(sales)').all().some(row => row.name === 'cash_received')) database.exec("ALTER TABLE sales ADD COLUMN cash_received REAL")
if (!database.prepare('PRAGMA table_info(sales)').all().some(row => row.name === 'change_given')) database.exec("ALTER TABLE sales ADD COLUMN change_given REAL")
if (!database.prepare('PRAGMA table_info(sales)').all().some(row => row.name === 'staff_id')) database.exec("ALTER TABLE sales ADD COLUMN staff_id TEXT NOT NULL DEFAULT ''")
if (!database.prepare('PRAGMA table_info(sales)').all().some(row => row.name === 'staff_name')) database.exec("ALTER TABLE sales ADD COLUMN staff_name TEXT NOT NULL DEFAULT ''")
if (!database.prepare('PRAGMA table_info(stocktakes)').all().some(row => row.name === 'approval_reason')) database.exec("ALTER TABLE stocktakes ADD COLUMN approval_reason TEXT NOT NULL DEFAULT ''")
if (!database.prepare('PRAGMA table_info(products)').all().some(row => row.name === 'cost_price')) database.exec("ALTER TABLE products ADD COLUMN cost_price REAL NOT NULL DEFAULT 0")
if (!database.prepare('PRAGMA table_info(sale_items)').all().some(row => row.name === 'unit_cost')) database.exec("ALTER TABLE sale_items ADD COLUMN unit_cost REAL NOT NULL DEFAULT 0")
database.exec('CREATE TABLE IF NOT EXISTS staff_removals (id TEXT PRIMARY KEY, removed_at TEXT NOT NULL)')
if (!database.prepare('PRAGMA table_info(customers)').all().some(row=>row.name==='birthday'))database.exec("ALTER TABLE customers ADD COLUMN birthday TEXT DEFAULT ''; ALTER TABLE customers ADD COLUMN birthday_reminders INTEGER NOT NULL DEFAULT 0")
if (!database.prepare('PRAGMA table_info(users)').all().some(row => row.name === 'permissions')) database.exec("ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT NULL")
if (!database.prepare('PRAGMA table_info(users)').all().some(row => row.name === 'operational_access')) database.exec("ALTER TABLE users ADD COLUMN operational_access INTEGER NOT NULL DEFAULT 0")
if (!database.prepare('PRAGMA table_info(users)').all().some(row => row.name === 'username')) database.exec("ALTER TABLE users ADD COLUMN username TEXT NOT NULL DEFAULT ''")
if (!database.prepare('PRAGMA table_info(branches)').all().some(row => row.name === 'is_active')) database.exec('ALTER TABLE branches ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1')
if (!database.prepare('PRAGMA table_info(branches)').all().some(row => row.name === 'assigned_user_ids')) database.exec("ALTER TABLE branches ADD COLUMN assigned_user_ids TEXT NOT NULL DEFAULT '[]'")
if (!database.prepare('PRAGMA table_info(expenses)').all().some(row => row.name === 'staff_id')) database.exec("ALTER TABLE expenses ADD COLUMN staff_id TEXT NOT NULL DEFAULT ''")
if (!database.prepare('PRAGMA table_info(expenses)').all().some(row => row.name === 'staff_name')) database.exec("ALTER TABLE expenses ADD COLUMN staff_name TEXT NOT NULL DEFAULT ''")
// Existing inventory becomes the stock of Main branch during the upgrade.
database.prepare('INSERT OR IGNORE INTO branch_inventory (branch_id, product_id, stock, reorder_point, updated_at) SELECT \'main\', id, stock, reorder_point, updated_at FROM products WHERE organization_id = ?').run(organizationId)
for (const table of ['inventory_movements', 'sales', 'sale_item_voids', 'expenses', 'stocktakes']) {
  if (!database.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === 'branch_id')) database.exec(`ALTER TABLE ${table} ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'main'`)
}
const retailDb = {
  execute: sql => database.exec(sql),
  query: (sql, params = []) => ({ values: database.prepare(sql).all(...params) }),
  run: (sql, params = []) => database.prepare(sql).run(...params),
  beginTransaction: () => database.exec('BEGIN'), commitTransaction: () => database.exec('COMMIT'), rollbackTransaction: () => database.exec('ROLLBACK')
}
await migrateRetail(retailDb)
let pendingRetailAction = Promise.resolve()
export function retailAction(method, input, user, branchId) {
  const action = pendingRetailAction.then(async () => handleRetail({ currency: (await getSettings()).currency, db: retailDb, scope: organizationId, organizationId, branchId, user, method, input,
    publish: record => queueSync('retail_record', record.id, 'create', record) }))
  pendingRetailAction = action.catch(() => undefined)
  return action
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

function matchesPassword(password, savedHash) {
  const [salt, encoded] = String(savedHash).split(':')
  // Allows an existing installation to upgrade its old hash after a successful login.
  const actual = scryptSync(password, encoded ? salt : 'stockroom-demo-salt', 64)
  const expected = Buffer.from(encoded || salt, 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function queueSync(entityType, entityId, action, payload) {
  database.prepare('INSERT INTO sync_outbox (operation_id, entity_type, entity_id, action, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(crypto.randomUUID(), entityType, entityId, action, JSON.stringify(payload), now())
}

export function getPendingSyncOperations(limit = 100) {
  return database.prepare('SELECT operation_id AS operationId, entity_type AS entityType, entity_id AS entityId, action, payload, created_at AS createdAt FROM sync_outbox WHERE synced_at IS NULL ORDER BY id LIMIT ?')
    .all(Math.min(Math.max(Number(limit) || 100, 1), 500))
    .map((row) => ({ ...row, payload: JSON.parse(row.payload) }))
}

export function markSyncOperationsSynced(operationIds) {
  if (!Array.isArray(operationIds) || !operationIds.length) return
  const update = database.prepare('UPDATE sync_outbox SET synced_at = ?, last_error = \'\' WHERE operation_id = ?')
  for (const operationId of operationIds) update.run(now(), operationId)
}

// A device has already applied every operation it created locally. Record
// those IDs before a recovery pull so the cloud can safely return the full
// business history (including this device's own past operations) without
// replaying stock or wallet adjustments.
export function markKnownLocalOperationsApplied() {
  database.prepare('INSERT OR IGNORE INTO sync_inbox (operation_id, received_at) SELECT operation_id, ? FROM sync_outbox').run(now())
}

export function recordSyncConflicts(conflicts) {
  if (!Array.isArray(conflicts)) return
  const insert = database.prepare('INSERT OR IGNORE INTO sync_conflicts (id, operation_id, entity_type, entity_id, reason, local_payload, remote_payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  for (const conflict of conflicts) {
    insert.run(crypto.randomUUID(), conflict.operationId, conflict.entityType || 'unknown', conflict.entityId || '', conflict.reason || 'A newer change exists on another device.', JSON.stringify(conflict.localPayload || {}), JSON.stringify(conflict.remotePayload || {}), now())
    const remote = counterConflictRecord(conflict)
    if (remote) database.prepare('UPDATE pos_records SET payload=?,updated_at=? WHERE scope=? AND id=?').run(JSON.stringify(remote), remote.updatedAt, organizationId, remote.id)
  }
}

export function listSyncConflicts(history = false) {
  database.exec(conflictReviewSchema)
  return database.prepare('SELECT c.id, c.operation_id AS operationId, c.entity_type AS entityType, c.entity_id AS entityId, c.reason, c.local_payload AS localPayload, c.remote_payload AS remotePayload, c.created_at AS createdAt, c.resolved_at AS resolvedAt, r.note AS reviewNote, r.action AS reviewAction, r.reviewer_id AS reviewerId FROM sync_conflicts c LEFT JOIN sync_conflict_reviews r ON r.conflict_id=c.id WHERE c.resolved_at IS '+(history?'NOT NULL':'NULL')+' ORDER BY c.created_at DESC').all()
}

export function resolveSyncConflict(id, input, user) {
  const review = conflictReview(input, user)
  if (!database.prepare('SELECT id FROM sync_conflicts WHERE id=? AND resolved_at IS NULL').get(id)) throw new Error('This issue is no longer open. Refresh the list.')
  database.exec(conflictReviewSchema)
  database.exec('BEGIN IMMEDIATE')
  try {
    database.prepare('INSERT INTO sync_conflict_reviews VALUES (?,?,?,?,?)').run(id,review.action,review.note,review.reviewerId,review.reviewedAt)
    database.prepare('UPDATE sync_conflicts SET resolved_at = ? WHERE id = ?').run(review.reviewedAt, id)
    database.exec('COMMIT')
  } catch(error) { database.exec('ROLLBACK'); throw error }
}

export function markSyncFailure(message) {
  database.prepare('UPDATE sync_outbox SET attempts = attempts + 1, last_error = ? WHERE synced_at IS NULL').run(String(message || 'Sync failed').slice(0, 500))
}

export function getSyncCursor() { return database.prepare("SELECT value FROM sync_state WHERE key = 'cursor'").get()?.value || '' }
export function setSyncCursor(cursor) { database.prepare("INSERT INTO sync_state (key, value) VALUES ('cursor', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(cursor || '')) }
export function getSyncStatus() {
  const pending = database.prepare('SELECT COUNT(*) AS count FROM sync_outbox WHERE synced_at IS NULL').get().count
  const pendingSettings = database.prepare("SELECT COUNT(*) AS count FROM sync_outbox WHERE synced_at IS NULL AND entity_type = 'settings'").get().count
  const lastError = database.prepare('SELECT last_error AS value FROM sync_outbox WHERE synced_at IS NULL AND last_error <> \'\' ORDER BY id DESC LIMIT 1').get()?.value || ''
  const conflicts = database.prepare('SELECT COUNT(*) AS count FROM sync_conflicts WHERE resolved_at IS NULL').get().count
  return { configured: Boolean(process.env.SYNC_API_URL && process.env.SYNC_DEVICE_TOKEN && process.env.BUSINESS_ID), pending, pendingSettings, conflicts, lastError }
}
export async function getSettings() {
  const row = database.prepare('SELECT app_name AS appName, currency, pos_provider AS posProvider, pos_terminal_id AS posTerminalId, pos_connection AS posConnection, logo_data AS logoData, payment_policy AS paymentPolicy, shop_profile AS shopProfile, updated_at AS updatedAt FROM app_settings WHERE organization_id = ?').get(organizationId)
  const ownerCount = database.prepare('SELECT COUNT(*) AS count FROM users WHERE organization_id = ?').get(organizationId).count
  return {
    ...(row || { appName: 'My Business', currency: 'USD', posProvider: '', posTerminalId: '', posConnection: 'manual', logoData: '', updatedAt: now() }),
    paymentPolicy: paymentPolicy(row?.paymentPolicy),
    shopProfile: row?.shopProfile && row.shopProfile !== 'null' ? normalizeShopProfile(row.shopProfile) : null,
    ownerConfigured: ownerCount > 0,
  }
}

export async function createOwnerSetup(input) {
  const appName = String(input.appName || '').trim() || 'My Business'
  const ownerName = String(input.ownerName || 'Shop Owner').trim() || 'Shop Owner'
  const email = String(input.email || '').trim().toLowerCase()
  const password = String(input.password || '')
  const mongoUri = String(input.mongoUri || '').trim()
  const mongoDatabase = String(input.mongoDatabase || 'stockroom').trim() || 'stockroom'
  if (!email || !password) throw new Error('Owner email and password are required.')
  const configured = database.prepare('SELECT 1 FROM users WHERE organization_id = ? LIMIT 1').get(organizationId)
  if (configured) throw new Error('This installation already has an owner account.')
  database.prepare('INSERT INTO users (id, organization_id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), organizationId, ownerName, email, hashPassword(password), 'owner', now())
  database.prepare('UPDATE app_settings SET app_name = ?, updated_at = ? WHERE organization_id = ?').run(appName, now(), organizationId)
  const config = { appName, shopName: appName, ownerName, ownerEmail: email, ownerConfigured: true, mongoUri, mongoDatabase }
  await writeShopConfig(config)
  return { appName, ownerEmail: email, ownerName, mongoUri, mongoDatabase }
}

export function authenticateUser(identifier, password) {
  const value = String(identifier || '').trim().toLowerCase()
  const user = database.prepare("SELECT id, name, email, username, password_hash AS passwordHash, role, permissions, operational_access AS operationalAccess FROM users WHERE organization_id = ? AND id NOT IN (SELECT id FROM staff_removals) AND ((role = 'owner' AND email = ?) OR (role IN ('admin', 'cashier') AND username = ?))").get(organizationId, value, value)
  if (!user) return null
  if (!matchesPassword(password, user.passwordHash)) return null
  if (!String(user.passwordHash).includes(':')) database.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), user.id)
  return { id: user.id, name: user.name, email: user.email, username: user.username || '', role: user.role, permissions: parsePermissions(user.permissions), operationalAccess: Boolean(user.operationalAccess), organizationId }
}

export function getUserById(id) {
  const user = database.prepare('SELECT id, name, email, username, role, permissions, operational_access AS operationalAccess FROM users WHERE id = ? AND organization_id = ? AND id NOT IN (SELECT id FROM staff_removals)').get(id, organizationId)
  return user ? { ...user, permissions: parsePermissions(user.permissions), operationalAccess: Boolean(user.operationalAccess), organizationId } : null
}

export function createSession(userId) {
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  database.prepare('INSERT INTO auth_sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt)
  return token
}

export function sessionUser(token) {
  if (!token) return null
  const session = database.prepare('SELECT user_id AS userId FROM auth_sessions WHERE token = ? AND expires_at > ?').get(token, now())
  return session ? getUserById(session.userId) : null
}

export function deleteSession(token) {
  if (token) database.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token)
}

export function changePassword(userId, currentPassword, newPassword) {
  const user = database.prepare('SELECT id, password_hash AS passwordHash FROM users WHERE id = ? AND organization_id = ?').get(userId, organizationId)
  if (!user) throw new Error('User not found.')
  const trimmedNewPassword = String(newPassword || '').trim()
  if (!trimmedNewPassword || trimmedNewPassword.length < 6) throw new Error('New password must be at least 6 characters long.')
  if (!matchesPassword(currentPassword, user.passwordHash)) throw new Error('Current password is incorrect.')
  const nextHash = hashPassword(trimmedNewPassword)
  database.prepare('UPDATE users SET password_hash = ? WHERE id = ? AND organization_id = ?').run(nextHash, userId, organizationId)
  return { success: true }
}

// Cloud password resets are authorized by the owner, but each installed
// desktop keeps its own offline credential verifier. Update that verifier and
// revoke the staff member's local sessions at the same time so an old password
// cannot continue to work on this device.
export function resetCashierPassword(userId, newPassword) {
  const password = String(newPassword || '').trim()
  if (password.length < 10) throw new Error('New password must be at least 10 characters long.')
  const user = database.prepare("SELECT id, name, email, username, role, permissions, operational_access AS operationalAccess FROM users WHERE id = ? AND organization_id = ? AND role IN ('admin', 'cashier')").get(userId, organizationId)
  if (!user) throw new Error('Staff account not found on this device.')
  database.prepare('UPDATE users SET password_hash = ? WHERE id = ? AND organization_id = ?').run(hashPassword(password), user.id, organizationId)
  database.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(user.id)
  return { ...user, permissions: parsePermissions(user.permissions), operationalAccess: Boolean(user.operationalAccess) }
}

export function getOwnerMetrics(branchId = 'main') {
  const sales = getReports(branchId).daily
  const stock = database.prepare('SELECT COALESCE(SUM(COALESCE(i.stock, 0) * p.price), 0) AS value, COUNT(*) AS products, SUM(CASE WHEN COALESCE(i.stock, 0) <= COALESCE(i.reorder_point, p.reorder_point) THEN 1 ELSE 0 END) AS lowStock FROM products p LEFT JOIN branch_inventory i ON i.product_id = p.id AND i.branch_id = ? WHERE p.organization_id = ?').get(branchId, organizationId)
  return { salesToday: sales.total, saleCount: sales.count, inventoryValue: stock.value, productCount: stock.products, lowStock: stock.lowStock }
}

export function listCustomers() {
  return database.prepare('SELECT id, name, phone, balance, birthday, birthday_reminders AS birthdayReminders FROM customers WHERE organization_id = ? ORDER BY name').all(organizationId).map(customer => ({ ...customer, transactions: database.prepare('SELECT id, amount, reason, created_at AS createdAt FROM wallet_transactions WHERE customer_id = ? AND organization_id = ? ORDER BY created_at DESC LIMIT 50').all(customer.id, organizationId) }))
}

export function getReports(branchId = 'main') {
  const sales = database.prepare('SELECT id, total, payment_details AS paymentDetails, created_at AS createdAt FROM sales WHERE organization_id = ? AND branch_id = ?').all(organizationId, branchId)
  const items = database.prepare('SELECT si.sale_id AS saleId, si.product_id AS productId,si.product_name AS productName,si.quantity, si.unit_cost AS unitCost FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.organization_id = ? AND s.branch_id = ? ORDER BY si.rowid').all(organizationId, branchId)
  const products = listProducts(branchId)
  const expenses = database.prepare('SELECT amount, incurred_at AS incurredAt FROM expenses WHERE organization_id = ? AND branch_id = ?').all(organizationId, branchId)
  const returns = database.prepare("SELECT payload FROM pos_records WHERE scope = ? AND branch_id = ? AND kind = 'return'").all(organizationId, branchId).map(row => JSON.parse(row.payload))
  for(const product of listProducts(branchId))stockChangeSync(retailDb,{id:`report:${branchId}:${product.id}`,branchId,productId:product.id,delta:0,createdAt:now()})
  const retail=database.prepare("SELECT payload FROM retail_records WHERE scope=? AND (branch_id=? OR kind='supplier')").all(organizationId,branchId).map(row=>JSON.parse(row.payload))
  const batches=database.prepare('SELECT * FROM stock_batches WHERE branch_id=? AND quantity>0').all(branchId)
  const adjustments=database.prepare('SELECT payload FROM stock_events').all().map(row=>JSON.parse(row.payload)).filter(row=>row.branchId===branchId && ['stock-loss','recipe-consumption','service-materials'].includes(row.category))
  const registers=database.prepare("SELECT payload FROM pos_records WHERE scope=? AND branch_id=? AND kind='register'").all(organizationId,branchId).map(row=>JSON.parse(row.payload))
  const orders=database.prepare("SELECT payload FROM pos_records WHERE scope=? AND branch_id=? AND kind='counter-order'").all(organizationId,branchId).map(row=>JSON.parse(row.payload))
  return buildReports({ sales, items, products, expenses, returns,retail,batches,adjustments,registers,orders,reportingTimeZone: normalizeShopProfile(database.prepare('SELECT shop_profile FROM app_settings WHERE organization_id = ?').get(organizationId)?.shop_profile).reportingTimeZone })
}

export function exportSalesCsv(branchId = 'main') {
  const rows = database.prepare(`SELECT s.id, s.created_at AS createdAt, s.total, s.payment_method AS paymentMethod, s.payment_reference AS paymentReference,
    GROUP_CONCAT(si.quantity || ' x ' || si.product_name, '; ') AS items
    FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id WHERE s.organization_id = ? AND s.branch_id = ? GROUP BY s.id ORDER BY s.created_at DESC`).all(organizationId, branchId)
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  return ['Sale ID,Date,Items,Payment method,Payment reference,Total', ...rows.map((row) => [row.id, row.createdAt, row.items || '', row.paymentMethod, row.paymentReference, row.total].map(escape).join(','))].join('\n')
}

function normalizeCreatedAt(value) {
  const timestamp = String(value || '').trim()
  if (!timestamp) return now()
  const parsed = new Date(timestamp)
  return Number.isNaN(parsed.getTime()) ? now() : timestamp
}

export function listUsers() {
  return database.prepare('SELECT id, name, email, username, role, permissions, operational_access AS operationalAccess, created_at AS createdAt FROM users WHERE organization_id = ? AND id NOT IN (SELECT id FROM staff_removals) ORDER BY CASE role WHEN \'owner\' THEN 0 WHEN \'admin\' THEN 1 ELSE 2 END, name').all(organizationId).map((user) => ({ ...user, permissions: parsePermissions(user.permissions), operationalAccess: Boolean(user.operationalAccess), createdAt: normalizeCreatedAt(user.createdAt) }))
}

// Cloud staff details are cached so the Team screen remains useful offline. The
// cloud never sends password hashes, so a newly cached account cannot be used
// for an offline sign-in until that staff member has signed in on this device.
export function cacheCloudUsers(accounts) {
  database.exec('BEGIN')
  try {
    for (const account of Array.isArray(accounts) ? accounts : []) {
      const remoteId = String(account?.id || '').trim()
      if (account?.removedAt && remoteId) { recordStaffRemovalLocal(remoteId, String(account.removedAt)); continue }
      const name = String(account?.name || '').trim()
      const email = String(account?.email || '').trim().toLowerCase()
      const username = String(account?.username || '').trim().toLowerCase()
      const role = String(account?.role || '')
      if (!remoteId || !name || !['owner', 'admin', 'cashier'].includes(role)) continue
      // A desktop owner may have a local ID which differs from the cloud ID.
      // Preserve that record and its local password/session relationship.
      const existing = database.prepare(`SELECT id FROM users
        WHERE organization_id = ? AND (id = ? OR (role = 'owner' AND email = ?))
        LIMIT 1`).get(organizationId, remoteId, email)
      const id = String(existing?.id || remoteId)
      const storedEmail = email || `${id}@staff.local.invalid`
      database.prepare(`INSERT INTO users (id, organization_id, name, email, username, password_hash, role, operational_access, permissions, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email, username = excluded.username, role = excluded.role, operational_access = excluded.operational_access, permissions = excluded.permissions, created_at = excluded.created_at`)
        .run(id, organizationId, name, storedEmail, username, hashPassword(crypto.randomUUID()), role, account.operationalAccess === true ? 1 : 0, JSON.stringify(parsePermissions(account.permissions)), normalizeCreatedAt(account.createdAt))
    }
    database.exec('COMMIT')
  } catch (error) { database.exec('ROLLBACK'); throw error }
  return listUsers()
}

export function createUser(input) {
  const name = String(input.name || '').trim()
  const email = String(input.email || '').trim().toLowerCase()
  const username = String(input.username || '').trim().toLowerCase()
  const password = String(input.password || '')
  const role = String(input.role || '')
  if (!name || name.length > 100) throw new Error('Name is required and must be 100 characters or less.')
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Error('A valid email address is required when supplied.')
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) throw new Error('Username must be 3ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“32 characters and use letters, numbers, dots, hyphens, or underscores.')
  if (password.length < 10) throw new Error('Password must be at least 10 characters long.')
  if (!['admin', 'cashier'].includes(role)) throw new Error('New users can only be admins or cashiers.')
  const id = String(input.id || crypto.randomUUID())
  const createdAt = normalizeCreatedAt(input.createdAt)
  // SQLite retains a non-null unique email column for compatibility with
  // existing installations. This internal placeholder is never exposed.
  const storedEmail = email || `${id}@staff.local.invalid`
  try {
    database.prepare('INSERT INTO users (id, organization_id, name, email, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, organizationId, name, storedEmail, username, hashPassword(password), role, createdAt)
    database.prepare('UPDATE users SET permissions=? WHERE id=?').run(JSON.stringify(parsePermissions(input.permissions||{})),id)
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw new Error('That email address is already in use.')
    throw error
  }
  const user = database.prepare('SELECT id, name, email, username, role, permissions, operational_access AS operationalAccess, created_at AS createdAt FROM users WHERE id = ?').get(id)
  queueSync('user', id, 'upsert', user)
  return { ...user, email, permissions: parsePermissions(user.permissions), operationalAccess: Boolean(user.operationalAccess), createdAt: normalizeCreatedAt(user.createdAt) }
}

export function updateUserRole(id, role, operationalAccess = false) {
  const nextRole = String(role || '').trim().toLowerCase()
  if (!['admin', 'cashier'].includes(nextRole)) throw new Error('Only admin and cashier roles can be updated here.')
  const result = database.prepare("UPDATE users SET role = ?, operational_access = ? WHERE id = ? AND organization_id = ? AND role IN ('admin', 'cashier')").run(nextRole, operationalAccess ? 1 : 0, id, organizationId)
  if (!result.changes) throw new Error('Staff account not found.')
  const user = database.prepare('SELECT id, name, email, username, role, permissions, operational_access AS operationalAccess, created_at AS createdAt FROM users WHERE id = ? AND organization_id = ? AND id NOT IN (SELECT id FROM staff_removals)').get(id, organizationId)
  queueSync('user', id, 'upsert', user)
  return { ...user, permissions: parsePermissions(user.permissions), operationalAccess: Boolean(user.operationalAccess), createdAt: normalizeCreatedAt(user.createdAt) }
}

export function setCashierOperationalAccess(id, enabled) {
  const result = database.prepare("UPDATE users SET operational_access = ? WHERE id = ? AND organization_id = ? AND role = 'cashier'").run(enabled ? 1 : 0, id, organizationId)
  if (!result.changes) throw new Error('Cashier account not found.')
  const user = database.prepare('SELECT id, name, email, role, permissions, operational_access AS operationalAccess, created_at AS createdAt FROM users WHERE id = ?').get(id)
  return { ...user, permissions: parsePermissions(user.permissions), operationalAccess: Boolean(user.operationalAccess) }
}

export function provisionCloudUser(input) {
  const name = String(input.name || '').trim()
  const email = String(input.email || '').trim().toLowerCase()
  const username = String(input.username || '').trim().toLowerCase()
  const role = String(input.role || 'cashier')
  const password = String(input.password || '')
  if (!name || (role === 'owner' && !email) || (role !== 'owner' && !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) || password.length < 8 || !['owner', 'admin', 'cashier'].includes(role)) throw new Error('Cloud user data is invalid.')
  // Owners are initially created locally, then registered in the cloud. Their
  // cloud account ID is therefore different from the existing local ID. Match
  // the owner email first so cloud sign-in updates that account instead of
  // colliding with the local unique email constraint.
  const existing = database.prepare(`SELECT id FROM users
    WHERE organization_id = ? AND (id = ? OR (role = 'owner' AND email = ?))
    LIMIT 1`).get(organizationId, String(input.id || ''), email)
  const id = String(existing?.id || input.id || crypto.randomUUID())
  const operationalAccess = input.operationalAccess === true ? 1 : 0
  const storedEmail = email || `${id}@staff.local.invalid`
  database.prepare(`INSERT INTO users (id, organization_id, name, email, username, password_hash, role, operational_access, permissions, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email, username = excluded.username, password_hash = excluded.password_hash, role = excluded.role, operational_access = excluded.operational_access, permissions = excluded.permissions`).run(id, organizationId, name, storedEmail, username, hashPassword(password), role, operationalAccess, JSON.stringify(parsePermissions(input.permissions)), now())
  return authenticateUser(role === 'owner' ? email : username, password)
}

export function listExpenses(limit = 200, branchId = 'main') {
  return database.prepare('SELECT id, category, description, amount, incurred_at AS incurredAt, created_at AS createdAt, staff_id AS staffId, staff_name AS staffName FROM expenses WHERE organization_id = ? AND branch_id = ? ORDER BY incurred_at DESC LIMIT ?').all(organizationId, branchId, Math.min(Math.max(Number(limit) || 200, 1), 500))
}

export function createExpense(input, branchId = 'main', staff = {}) {
  const category = String(input.category || '').trim()
  const description = String(input.description || '').trim()
  const amount = Number(input.amount)
  const incurredAt = String(input.incurredAt || now())
  if (!category || !description || !Number.isFinite(amount) || amount <= 0) throw new Error('Expense category, description, and a positive amount are required.')
  if (!Number.isFinite(Date.parse(incurredAt))) throw new Error('Enter a valid expense date.')
  const expense = { id: crypto.randomUUID(), category, description, amount, incurredAt, createdAt: now(), branchId, staffId: String(staff.id || ''), staffName: String(staff.name || '') }
  database.prepare('INSERT INTO expenses (id, organization_id, category, description, amount, incurred_at, created_at, branch_id, staff_id, staff_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(expense.id, organizationId, expense.category, expense.description, expense.amount, expense.incurredAt, expense.createdAt, branchId, expense.staffId, expense.staffName)
  queueSync('expense', expense.id, 'create', expense)
  return expense
}

export function getStaffActivity(branchId, from, to) {
  const zone=normalizeShopProfile(database.prepare('SELECT shop_profile FROM app_settings WHERE organization_id=?').get(organizationId)?.shop_profile).reportingTimeZone
  const dayFrom=businessDate(from,zone), dayTo=businessDate(to,zone)
  const sales = database.prepare("SELECT staff_id AS staffId, staff_name AS staffName, id, total AS amount, created_at AS occurredAt, payment_method AS detail FROM sales WHERE organization_id = ? AND branch_id = ? AND created_at >= ? AND created_at < ? ORDER BY created_at DESC").all(organizationId, branchId, from, to)
  const expenses = database.prepare("SELECT staff_id AS staffId, staff_name AS staffName, id, amount, incurred_at AS occurredAt, category || ': ' || description AS detail, created_at AS recordedAt FROM expenses WHERE organization_id = ? AND branch_id = ? AND ((length(incurred_at)=10 AND incurred_at >= ? AND incurred_at < ?) OR (length(incurred_at)>10 AND incurred_at >= ? AND incurred_at < ?)) ORDER BY incurred_at DESC").all(organizationId, branchId, dayFrom, dayTo, from, to)
  const voids = database.prepare("SELECT staff_id AS staffId, staff_name AS staffName, id, quantity * unit_price AS amount, created_at AS occurredAt, quantity || ' x ' || product_name || ': ' || reason AS detail FROM sale_item_voids WHERE organization_id = ? AND branch_id = ? AND created_at >= ? AND created_at < ? ORDER BY created_at DESC").all(organizationId, branchId, from, to)
  const users = database.prepare("SELECT id, name, role FROM users WHERE organization_id = ? ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, name").all(organizationId)
  const summary = new Map(users.map(user => [user.id, { staffId: user.id, staffName: user.name, role: user.role, salesCount: 0, salesTotal: 0, expensesCount: 0, expensesTotal: 0, voidsCount: 0, voidsTotal: 0 }]))
  const events = []
  for (const [type, records] of [['sale', sales], ['expense', expenses], ['void', voids]]) for (const record of records) {
    const staffId = record.staffId || `legacy:${record.staffName || 'unknown'}`
    if (!summary.has(staffId)) summary.set(staffId, { staffId, staffName: record.staffName || 'Unassigned / older record', role: 'unknown', salesCount: 0, salesTotal: 0, expensesCount: 0, expensesTotal: 0, voidsCount: 0, voidsTotal: 0 })
    const row = summary.get(staffId), amount = Number(record.amount) || 0
    if (type === 'sale') { row.salesCount++; row.salesTotal += amount }
    if (type === 'expense') { row.expensesCount++; row.expensesTotal += amount }
    if (type === 'void') { row.voidsCount++; row.voidsTotal += amount }
    events.push({ id: `${type}:${record.id}`, staffId, staffName: record.staffName || row.staffName, type, amount, occurredAt: record.occurredAt, detail: type === 'sale' ? `Sale · ${record.detail}` : type === 'expense' ? `Expense recorded · ${record.detail}` : `Item void · ${record.detail}`, ...(record.recordedAt ? { recordedAt: record.recordedAt } : {}) })
  }
  return { from, to, staff: [...summary.values()], events: events.sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt))).slice(0, 300) }
}

export function createCustomer(input) {
  const name = String(input.name || '').trim()
  const phone = String(input.phone || '').trim()
  if (!name || name.length > 100) throw new Error('Customer name is required and must be 100 characters or less.')
  birthdayValue(input.birthday)
  const id = crypto.randomUUID()
  database.prepare('INSERT INTO customers (id, organization_id, name, phone, balance, created_at) VALUES (?, ?, ?, ?, 0, ?)').run(id, organizationId, name, phone, now())
  const customer = database.prepare('SELECT id, name, phone, balance, birthday, birthday_reminders AS birthdayReminders FROM customers WHERE id = ?').get(id)
  database.prepare('UPDATE customers SET birthday=?,birthday_reminders=? WHERE id=?').run(birthdayValue(input.birthday),input.birthdayReminders===true?1:0,id)
  customer.birthday=birthdayValue(input.birthday);customer.birthdayReminders=input.birthdayReminders===true
  queueSync('customer', id, 'upsert', customer)
  return customer
}

export function updateCustomerBirthday(id,input){
 const birthday=birthdayValue(input.birthday)
 const result=database.prepare('UPDATE customers SET birthday=?,birthday_reminders=? WHERE id=? AND organization_id=?').run(birthday,input.birthdayReminders===true?1:0,id,organizationId)
 if(!result.changes)throw new Error('Customer not found.')
 const customer=database.prepare('SELECT id,name,phone,balance,birthday,birthday_reminders AS birthdayReminders FROM customers WHERE id=? AND organization_id=?').get(id,organizationId)
 queueSync('customer',id,'upsert',customer);return customer
}

export function listSales(limit = 100, branchId = 'main') {
  const sales = database.prepare('SELECT id, total, payment_method AS paymentMethod, payment_reference AS paymentReference, terminal_provider AS terminalProvider, cash_received AS cashReceived, change_given AS changeGiven, payment_details AS paymentDetails, staff_id AS staffId, staff_name AS staffName, created_at AS createdAt FROM sales WHERE organization_id = ? AND branch_id = ? ORDER BY created_at DESC LIMIT ?').all(organizationId, branchId, Math.min(Math.max(Number(limit) || 100, 1), 500))
  const itemQuery = database.prepare('SELECT product_id AS productId, product_name AS productName, quantity, unit_cost AS unitCost, batch_allocations AS batchAllocations, unit_price AS unitPrice FROM sale_items WHERE sale_id = ? ORDER BY rowid')
  return sales.map((sale) => ({ ...sale, paymentDetails: sale.paymentDetails ? JSON.parse(sale.paymentDetails) : undefined, items: itemQuery.all(sale.id) }))
}

export function recordSaleItemVoid(input, staff, shouldSync = true) {
  const id = String(input.id || '').trim()
  const orderId = String(input.orderId || '').trim()
  const productId = String(input.productId || '').trim()
  const productName = String(input.productName || '').trim().slice(0, 200)
  const quantity = Number(input.quantity)
  const unitPrice = Number(input.unitPrice)
  const reason = String(input.reason || '').trim().slice(0, 500)
  if (!id || !orderId || !productId || !productName || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || reason.length < 3) {
    throw new Error('A void needs an item, quantity, price, order, and reason of at least 3 characters.')
  }
  const event = { id, orderId, productId, productName, quantity, unitPrice, reason, branchId: String(input.branchId || 'main'), staffId: String(staff.id || ''), staffName: String(staff.name || ''), createdAt: shouldSync ? now() : String(input.createdAt || now()) }
  const result = database.prepare('INSERT OR IGNORE INTO sale_item_voids (id, organization_id, order_id, product_id, product_name, quantity, unit_price, reason, staff_id, staff_name, created_at, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(event.id, organizationId, event.orderId, event.productId, event.productName, event.quantity, event.unitPrice, event.reason, event.staffId, event.staffName, event.createdAt, event.branchId)
  if (result.changes && shouldSync) queueSync('sale_void', event.id, 'create', event)
  return event
}

export function listSaleItemVoids(limit = 500, branchId = 'main') {
  return database.prepare('SELECT id, order_id AS orderId, product_id AS productId, product_name AS productName, quantity, unit_price AS unitPrice, reason, staff_id AS staffId, staff_name AS staffName, created_at AS createdAt FROM sale_item_voids WHERE organization_id = ? AND branch_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(organizationId, branchId, Math.min(Math.max(Number(limit) || 500, 1), 1000))
}

export function listMovements(limit = 200, branchId = 'main') {
  return database.prepare(`SELECT m.id, p.name AS productName, p.sku, m.quantity, m.reason, m.created_at AS createdAt
    FROM inventory_movements m JOIN products p ON p.id = m.product_id
    WHERE m.organization_id = ? AND m.branch_id = ? ORDER BY m.created_at DESC LIMIT ?`).all(organizationId, branchId, Math.min(Math.max(Number(limit) || 200, 1), 500))
}

export async function createBackup() {
  const backupDirectory = join(dataDirectory, 'backups')
  await mkdir(backupDirectory, { recursive: true })
  const fileName = `stockroom-${now().replace(/[:.]/g, '-')}.sqlite`
  const destination = join(backupDirectory, fileName)
  database.prepare('VACUUM INTO ?').run(destination)
  return { fileName, path: destination }
}

export function adjustCustomerWallet(customerId, amount, reason = 'manual-adjustment', shouldSync = true) {
  const customer = database.prepare('SELECT id, name, phone, balance, birthday, birthday_reminders AS birthdayReminders FROM customers WHERE id = ? AND organization_id = ?').get(customerId, organizationId)
  if (!customer) throw new Error('Customer not found.')
  if (!Number.isSafeInteger(Math.round(amount * 100)) || amount === 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) throw new Error('Enter a non-zero amount with at most two decimals.')
  if (amount < 0 && customer.balance + amount < 0) throw new Error('Wallet balance cannot go below zero.')
  const createdAt = now()
  database.exec('BEGIN')
  try {
    database.prepare('UPDATE customers SET balance = ROUND(balance + ?, 2) WHERE id = ? AND organization_id = ?').run(amount, customerId, organizationId)
    database.prepare('INSERT INTO wallet_transactions (id, organization_id, customer_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), organizationId, customerId, amount, reason, createdAt)
    database.exec('COMMIT')
  } catch (error) { database.exec('ROLLBACK'); throw error }
  const updatedCustomer = database.prepare('SELECT id, name, phone, balance, birthday, birthday_reminders AS birthdayReminders FROM customers WHERE id = ?').get(customerId)
  if (shouldSync) queueSync('wallet', customerId, 'adjust', { customerId, amount, reason, createdAt })
  return updatedCustomer
}

export function applyRemoteOperations(operations) {
  if (!Array.isArray(operations)) return
  for (const operation of operations) {
    if (!operation?.operationId || database.prepare('SELECT 1 FROM sync_inbox WHERE operation_id = ?').get(operation.operationId)) continue
    const payload = operation.payload || {}
    try {
      if (operation.entityType === 'retail_record') {
        if (!database.prepare('SELECT 1 FROM retail_records WHERE scope=? AND id=?').get(organizationId, payload.id)) {
          for (const line of ['receipt', 'waste', 'supplier-return'].includes(payload.kind) ? payload.lines : []) {
            if (!database.prepare('SELECT 1 FROM branch_inventory WHERE branch_id=? AND product_id=?').get(payload.branchId, line.productId)) throw new Error('Synchronize the product and branch before this delivery.')
          }
          database.exec('BEGIN')
          try {
            for(const [index,line] of (['receipt','waste','supplier-return'].includes(payload.kind)?payload.lines:[]).entries())stockChangeSync(retailDb,{id:`${payload.id}:lot:${index}`,branchId:payload.branchId,productId:line.productId,delta:payload.kind==='receipt'?line.units:-line.units,unitCost:line.unitCost,expiry:line.expiry||'',batchNumber:line.batchNumber||payload.reference,createdAt:payload.createdAt,sourceId:payload.id,allowExpired:true,allocations:line.allocations})
            for (const [sql, params] of retailStatements(payload, organizationId, organizationId)) database.prepare(sql).run(...params)
            database.exec('COMMIT')
          } catch (error) { database.exec('ROLLBACK'); throw error }
        }
      } else if (operation.entityType === 'pos_record') {
        if(['service-job','restaurant-reservations','church-fund','church-donor','register'].includes(payload.kind) && database.prepare("SELECT operation_id FROM sync_outbox WHERE entity_type='pos_record' AND entity_id=? AND synced_at IS NULL LIMIT 1").get(payload.id)) throw new Error('This record has pending local work. Refresh kept it; use Sync now to reconcile it.')
        const existing = database.prepare('SELECT payload FROM pos_records WHERE scope=? AND id=?').get(organizationId, payload.id)
        database.exec('BEGIN')
        try {
          if(payload.kind==='restaurant-reservation-archive')validateReservationArchive(payload,undefined,existing?JSON.parse(existing.payload):undefined)
          if(payload.kind==='product'&&payload.oilPricing)oilPricing(payload.oilPricing)
          if(payload.kind?.startsWith('church-'))validateChurchRecord(payload,undefined,true)
          if(payload.kind==='restaurant-reservations')validateReservationBook(payload,undefined,true)
          if(payload.kind==='service-job') validateServiceJob(payload,undefined,true)
          if(payload.kind==='service-job') for(const entry of payload.payments) if(!database.prepare('SELECT id FROM sales WHERE id=?').get(entry.sale.id)) {
            if(entry.sale.paymentMethod==='wallet'){const customerId=entry.sale.paymentDetails.customerId;const changed=database.prepare('UPDATE customers SET balance=ROUND(balance-?,2) WHERE id=? AND organization_id=? AND balance>=?').run(entry.sale.total,customerId,organizationId,entry.sale.total);if(!changed.changes)throw new Error('Customer wallet does not exist or has insufficient funds.');database.prepare('INSERT INTO wallet_transactions (id,organization_id,customer_id,amount,reason,created_at) VALUES (?,?,?,?,?,?)').run(`wallet:${entry.sale.id}`,organizationId,customerId,-entry.sale.total,`Sale ${entry.sale.id}`,entry.sale.createdAt)}
            for(const [sql,args] of restaurantSaleStatements(entry.sale,organizationId))database.prepare(sql).run(...args)
          }
          if(payload.kind==='restaurant-ledger' && !database.prepare('SELECT id FROM sales WHERE id=?').get(payload.latestSale.id)) {
            const sale=payload.latestSale
            for(const [index,item] of sale.items.entries()) if(!item.productId.startsWith('service:')) {
              stockChangeSync(retailDb,{id:`${sale.id}:sale:${index}`,branchId:sale.branchId,productId:item.productId,delta:-item.quantity,createdAt:sale.createdAt,allocations:item.batchAllocations,completedSale:true,unitCost:item.unitCost})
              database.prepare('UPDATE branch_inventory SET stock=stock-? WHERE product_id=? AND branch_id=?').run(item.quantity,item.productId,sale.branchId)
              database.prepare('INSERT INTO inventory_movements (id,organization_id,product_id,quantity,reason,created_at,branch_id) VALUES (?,?,?,?,?,?,?)').run(`${sale.id}:movement:${index}`,organizationId,item.productId,-item.quantity,'sale',sale.createdAt,sale.branchId)
            }
            for(const [sql,args] of restaurantSaleStatements(sale,organizationId)) database.prepare(sql).run(...args)
            for(const [index,item] of sale.items.entries()) if(item.batchAllocations) database.prepare('UPDATE sale_items SET batch_allocations=? WHERE id=?').run(JSON.stringify(item.batchAllocations),`${sale.id}:${index}`)
          }
          if(isStockWork(payload)){validateStockWork(payload,existing?JSON.parse(existing.payload):undefined);applyStockWorkSync(retailDb,payload,organizationId)}
          if (payload.kind === 'counter-consumption') applyConsumptionSync(retailDb, payload, organizationId)
          if (payload.kind === 'return' && !existing) {
            for (const item of payload.items) if (item.restock) {
              if (!database.prepare('SELECT 1 FROM branch_inventory WHERE product_id=? AND branch_id=?').get(item.productId,payload.branchId)) throw new Error('Returned product has not synchronized yet.')
              for(const [index,part] of (item.batchAllocations?.length?item.batchAllocations:[{quantity:item.quantity,unitCost:item.unitCost||0}]).entries())stockChangeSync(retailDb,{id:`${payload.id}:restock:${item.lineIndex}:${index}`,lotId:part.id,branchId:payload.branchId,productId:item.productId,delta:part.quantity,reconcile:index===0,unitCost:part.unitCost,expiry:part.expiry||'',batchNumber:part.batchNumber||'',createdAt:payload.updatedAt})
              database.prepare('UPDATE branch_inventory SET stock=stock+? WHERE product_id=? AND branch_id=?').run(item.quantity,item.productId,payload.branchId)
              database.prepare('INSERT INTO inventory_movements (id,organization_id,product_id,quantity,reason,created_at,branch_id) VALUES (?,?,?,?,?,?,?)').run(`${payload.id}:return:${item.lineIndex}`,organizationId,item.productId,item.quantity,`Return ${payload.saleId}: ${payload.reason}`,payload.updatedAt,payload.branchId)
            }
            if (payload.walletCustomerId) {
              const changed = database.prepare('UPDATE customers SET balance=ROUND(balance+?,2) WHERE id=? AND organization_id=?').run(payload.total,payload.walletCustomerId,organizationId)
              if (!changed.changes) throw new Error('Returned customer has not synchronized yet.')
              database.prepare('INSERT INTO wallet_transactions (id,organization_id,customer_id,amount,reason,created_at) VALUES (?,?,?,?,?,?)').run(payload.id,organizationId,payload.walletCustomerId,payload.total,`Return ${payload.saleId}: ${payload.reason}`,payload.updatedAt)
            }
          }
          database.prepare('INSERT INTO pos_records (scope,id,kind,branch_id,payload,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(scope,id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at WHERE excluded.updated_at >= pos_records.updated_at').run(organizationId,payload.id,payload.kind,payload.branchId,JSON.stringify(payload),payload.updatedAt)
          database.exec('COMMIT')
        } catch (error) { database.exec('ROLLBACK'); throw error }
      } else if (operation.entityType === 'product' && operation.action === 'upsert') {
        database.prepare(`INSERT INTO products (id, organization_id, name, sku, barcode, category, stock, reorder_point, price, unit, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, sku = excluded.sku, barcode = excluded.barcode, category = excluded.category, reorder_point = excluded.reorder_point, price = excluded.price, unit = excluded.unit, updated_at = excluded.updated_at`)
          .run(payload.id, organizationId, payload.name, payload.sku, payload.barcode || '', payload.category, Number(payload.stock) || 0, Number(payload.reorder) || 0, Number(payload.price) || 0, payload.unit, payload.updated || now())
        database.prepare("INSERT OR IGNORE INTO branch_inventory (branch_id, product_id, stock, reorder_point, updated_at) VALUES ('main', ?, ?, ?, ?)").run(payload.id, Number(payload.stock) || 0, Number(payload.reorder) || 0, payload.updated || now())
        if (payload.customValues != null) database.prepare('UPDATE products SET custom_values = ? WHERE id = ?').run(JSON.stringify(readCustomValues(payload.customValues)), payload.id)
      } else if (operation.entityType === 'branch' && operation.action === 'upsert') {
        database.prepare('INSERT INTO branches (id, organization_id, name, address, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, address=excluded.address, updated_at=excluded.updated_at').run(payload.id, organizationId, payload.name, payload.address || '', payload.isDefault ? 1 : 0, payload.createdAt || now(), payload.updatedAt || now())
        database.prepare('UPDATE branches SET is_active = ?, assigned_user_ids = ? WHERE id = ?').run(payload.isActive === false ? 0 : 1, JSON.stringify(Array.isArray(payload.assignedUserIds) ? payload.assignedUserIds : []), payload.id)
        database.prepare('INSERT OR IGNORE INTO branch_inventory (branch_id, product_id, stock, reorder_point, updated_at) SELECT ?, id, 0, reorder_point, ? FROM products WHERE organization_id = ?').run(payload.id, now(), organizationId)
      } else if (operation.entityType === 'branch_transfer' && operation.action === 'create') {
        if (!database.prepare('SELECT 1 FROM inventory_movements WHERE id = ?').get(`${payload.id}:out`)) {
          const source = database.prepare('SELECT stock FROM branch_inventory WHERE branch_id = ? AND product_id = ?').get(payload.fromBranchId, payload.productId)
          if (!source || source.stock < Number(payload.quantity)) throw new Error('Remote branch transfer exceeds available source stock.')
          const createdAt = payload.createdAt || now()
          database.exec('BEGIN')
          try {
            stockTransferSync(retailDb,payload)
            database.prepare('UPDATE branch_inventory SET stock = stock - ?, updated_at = ? WHERE branch_id = ? AND product_id = ?').run(Number(payload.quantity), createdAt, payload.fromBranchId, payload.productId)
            database.prepare('INSERT INTO branch_inventory (branch_id, product_id, stock, reorder_point, updated_at) VALUES (?, ?, ?, 0, ?) ON CONFLICT(branch_id, product_id) DO UPDATE SET stock = branch_inventory.stock + excluded.stock, updated_at = excluded.updated_at').run(payload.toBranchId, payload.productId, Number(payload.quantity), createdAt)
            database.prepare('INSERT INTO inventory_movements (id, organization_id, product_id, quantity, reason, created_at, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`${payload.id}:out`, organizationId, payload.productId, -Number(payload.quantity), `Transfer to ${payload.toBranchId}: ${payload.reason}`, createdAt, payload.fromBranchId)
            database.prepare('INSERT INTO inventory_movements (id, organization_id, product_id, quantity, reason, created_at, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`${payload.id}:in`, organizationId, payload.productId, Number(payload.quantity), `Transfer from ${payload.fromBranchId}: ${payload.reason}`, createdAt, payload.toBranchId)
            database.exec('COMMIT')
          } catch (error) { database.exec('ROLLBACK'); throw error }
        }
      } else if (operation.entityType === 'stock' && operation.action === 'adjust') {
        adjustStock(payload.productId, Number(payload.amount), payload.reason || 'remote-adjustment', false, payload.branchId || 'main', payload.stockEvent || {id:operation.operationId,branchId:payload.branchId||'main',productId:payload.productId,delta:Number(payload.amount),createdAt:operation.createdAt,allowExpired:true})
      } else if (operation.entityType === 'sale' && operation.action === 'create') {
        createSale(payload, false, payload.branchId || 'main')
      } else if (operation.entityType === 'sale_void' && operation.action === 'create') {
        recordSaleItemVoid(payload, { id: payload.staffId, name: payload.staffName }, false)
      } else if (operation.entityType === 'customer' && operation.action === 'upsert') {
        database.prepare('INSERT INTO customers (id, organization_id, name, phone, balance, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, phone = excluded.phone')
          .run(payload.id, organizationId, payload.name, payload.phone || '', Number(payload.balance) || 0, now())
        if(payload.birthday!==undefined)database.prepare('UPDATE customers SET birthday=?,birthday_reminders=? WHERE id=? AND organization_id=?').run(birthdayValue(payload.birthday),payload.birthdayReminders===true||payload.birthdayReminders===1?1:0,payload.id,organizationId)
      } else if (operation.entityType === 'wallet' && operation.action === 'adjust') {
        adjustCustomerWallet(payload.customerId, Number(payload.amount), payload.reason || 'remote-wallet', false)
      } else if (operation.entityType === 'expense' && operation.action === 'create') {
        database.prepare('INSERT OR IGNORE INTO expenses (id, organization_id, category, description, amount, incurred_at, created_at, branch_id, staff_id, staff_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(payload.id, organizationId, payload.category, payload.description, Number(payload.amount), payload.incurredAt, payload.createdAt || now(), payload.branchId || 'main', payload.staffId || '', payload.staffName || '')
      } else if (operation.entityType === 'staff_removal' && operation.action === 'remove') {
        recordStaffRemovalLocal(String(payload.id), String(payload.removedAt))
      } else if (operation.entityType === 'user' && operation.action === 'upsert') {
        // Password hashes remain device-local until hosted account authentication is enabled.
        const existing = database.prepare('SELECT id FROM users WHERE id = ?').get(payload.id)
        if (existing) database.prepare('UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?').run(payload.name, payload.email, payload.role, payload.id)
      } else if (operation.entityType === 'stocktake' && operation.action === 'create') {
        database.prepare('INSERT OR IGNORE INTO stocktakes (id, organization_id, status, approval_reason, created_at, approved_at) VALUES (?, ?, ?, ?, ?, ?)').run(payload.id, organizationId, payload.status || 'draft', payload.approvalReason || '', payload.createdAt || now(), payload.approvedAt || null)
        const insert = database.prepare('INSERT OR IGNORE INTO stocktake_counts (id, stocktake_id, product_id, expected_quantity, counted_quantity, variance) VALUES (?, ?, ?, ?, ?, ?)')
        for (const count of payload.counts || []) insert.run(count.id, payload.id, count.productId, count.expected, count.counted, count.variance)
      } else if (operation.entityType === 'stocktake' && operation.action === 'count-update') {
        database.prepare('UPDATE stocktake_counts SET counted_quantity = ?, variance = ? WHERE id = ? AND stocktake_id = ?').run(Number(payload.counted), Number(payload.counted) - (database.prepare('SELECT expected_quantity AS value FROM stocktake_counts WHERE id = ?').get(payload.countId)?.value || 0), payload.countId, payload.stocktakeId)
      } else if (operation.entityType === 'stocktake' && operation.action === 'approved') {
        database.exec('BEGIN')
        try {
          const branchId=payload.branchId||'main'
          for(const count of payload.counts||[]){
            const delta=Number(count.variance)
            if(!delta)continue
            const event=count.stockEvent||{id:`${payload.id}:count:${count.productId}`,branchId,productId:count.productId,delta,createdAt:payload.approvedAt||operation.createdAt,allowExpired:true}
            if(database.prepare('SELECT id FROM stock_events WHERE id=?').get(event.id))continue
            if(count.stockEvent || delta<0)stockChangeSync(retailDb,event)
            database.prepare('UPDATE branch_inventory SET stock=ROUND(stock+?,3),updated_at=? WHERE product_id=? AND branch_id=?').run(delta,event.createdAt,count.productId,branchId)
            database.prepare('INSERT OR IGNORE INTO inventory_movements (id,organization_id,product_id,quantity,reason,created_at,branch_id) VALUES (?,?,?,?,?,?,?)').run(event.id,organizationId,count.productId,delta,`Stocktake: ${payload.approvalReason||'approved'}`,event.createdAt,branchId)
          }
          database.prepare('UPDATE stocktakes SET status=?,approval_reason=?,approved_at=? WHERE id=?').run('approved',payload.approvalReason||'',payload.approvedAt||now(),payload.id)
          database.prepare('INSERT INTO sync_inbox (operation_id,received_at) VALUES (?,?)').run(operation.operationId,now())
          database.exec('COMMIT')
        }catch(error){database.exec('ROLLBACK');throw error}
        continue
      } else if (operation.entityType === 'settings' && operation.action === 'upsert') {
        const local = database.prepare('SELECT updated_at,app_name,currency,shop_profile,payment_policy FROM app_settings WHERE organization_id = ?').get(organizationId)
        const pending = database.prepare("SELECT 1 FROM sync_outbox WHERE entity_type = 'settings' AND synced_at IS NULL LIMIT 1").get()
        if (pending) throw new Error('Business settings have unsent changes. Use Sync now before refreshing them.')
        const placeholder = local?.app_name==='My Business' && local?.currency==='USD' && (!local.shop_profile || local.shop_profile==='null') && (!local.payment_policy || local.payment_policy==='{}')
        if (!placeholder && local?.updated_at > (payload.updatedAt || operation.createdAt)) {
          database.prepare('INSERT INTO sync_inbox (operation_id, received_at) VALUES (?, ?)').run(operation.operationId, now())
          continue
        }
        if (payload.paymentPolicy !== undefined) database.prepare('UPDATE app_settings SET payment_policy = ? WHERE organization_id = ?').run(JSON.stringify(paymentPolicy(payload.paymentPolicy)), organizationId)
        if (payload.shopProfile != null) database.prepare('UPDATE app_settings SET shop_profile = ? WHERE organization_id = ?').run(JSON.stringify(normalizeShopProfile(payload.shopProfile)), organizationId)
        database.prepare('UPDATE app_settings SET app_name = ?, currency = ?, pos_provider = ?, pos_terminal_id = ?, pos_connection = ?, logo_data = ?, updated_at = ? WHERE organization_id = ?')
          .run(payload.appName || 'My Business', payload.currency || 'USD', payload.posProvider || '', payload.posTerminalId || '', payload.posConnection || 'manual', payload.logoData || '', payload.updatedAt || now(), organizationId)
      }
      database.prepare('INSERT INTO sync_inbox (operation_id, received_at) VALUES (?, ?)').run(operation.operationId, now())
    } catch (error) {
      console.error(`Could not apply remote operation ${operation.operationId}:`, error.message)
      throw error
    }
  }
}

export function createStocktake(branchId = 'main') {
  const id = crypto.randomUUID()
  const createdAt = now()
  database.prepare('INSERT INTO stocktakes (id, organization_id, status, approval_reason, created_at, approved_at, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, organizationId, 'draft', '', createdAt, null, branchId)
  const products = listProducts(branchId)
  const insert = database.prepare('INSERT INTO stocktake_counts (id, stocktake_id, product_id, expected_quantity, counted_quantity, variance) VALUES (?, ?, ?, ?, ?, ?)')
  for (const product of products) insert.run(crypto.randomUUID(), id, product.id, product.stock, product.stock, 0)
  const stocktake = getStocktake(id)
  queueSync('stocktake', id, 'create', stocktake)
  return stocktake
}

export function getStocktakeHistory(stocktakeId) {
  return database.prepare(`
    SELECT a.id, a.product_id AS productId, p.name, p.sku, a.expected_quantity AS expected, a.counted_quantity AS counted, a.variance, a.reason, a.created_at AS createdAt
    FROM stocktake_adjustments a
    JOIN products p ON p.id = a.product_id
    WHERE a.stocktake_id = ?
    ORDER BY a.created_at DESC
  `).all(stocktakeId)
}

export function getStocktake(id) {
  const stocktake = database.prepare('SELECT id, status, branch_id AS branchId, approval_reason AS approvalReason, created_at AS createdAt, approved_at AS approvedAt FROM stocktakes WHERE id = ? AND organization_id = ?').get(id, organizationId)
  if (!stocktake) return null
  stocktake.counts = database.prepare('SELECT c.id, c.product_id AS productId, p.name, p.sku, c.expected_quantity AS expected, c.counted_quantity AS counted, c.variance FROM stocktake_counts c JOIN products p ON p.id = c.product_id WHERE c.stocktake_id = ? ORDER BY p.name').all(id)
  stocktake.history = getStocktakeHistory(id)
  return stocktake
}

export function updateStocktakeCount(stocktakeId, countId, counted) {
  const stocktake = database.prepare('SELECT status FROM stocktakes WHERE id = ? AND organization_id = ?').get(stocktakeId, organizationId)
  if (!stocktake || stocktake.status === 'approved') throw new Error('Approved stock-takes cannot be edited.')
  const numericCount = Number(counted)
  if (!validQuantity(numericCount)) throw new Error('Count must have at most three decimals and be zero or greater.')
  const expected = database.prepare('SELECT expected_quantity AS expected FROM stocktake_counts WHERE id = ? AND stocktake_id = ?').get(countId, stocktakeId)?.expected
  if (expected === undefined) throw new Error('Stocktake item not found.')
  database.prepare('UPDATE stocktake_counts SET counted_quantity = ?, variance = ? WHERE id = ? AND stocktake_id = ?').run(numericCount, numericCount - expected, countId, stocktakeId)
  const updatedStocktake = getStocktake(stocktakeId)
  queueSync('stocktake', stocktakeId, 'count-update', { stocktakeId, countId, counted: numericCount, updatedAt: now() })
  return updatedStocktake
}

export function approveStocktake(id, reason = '') {
  const stocktake = getStocktake(id)
  if (!stocktake || stocktake.status !== 'draft') return null
  const approvalReason = String(reason || 'Approved after physical count').trim() || 'Approved after physical count'
  const beforeStocks = new Map()
  const stockEvents = new Map()
  database.exec('BEGIN')
  try {
    for (const count of stocktake.counts) {
      if (count.variance === 0) continue
      const adjustmentReason = `${approvalReason} - ${count.name}`
      const product = database.prepare('SELECT stock FROM branch_inventory WHERE product_id = ? AND branch_id = ?').get(count.productId, stocktake.branchId || 'main')
      if (!product) continue
      beforeStocks.set(count.productId, Number(product.stock))
      const nextStock = product.stock + count.variance
      if (nextStock < 0) throw new Error(`Stock cannot be negative for ${count.name}.`)
      stockEvents.set(count.productId, stockChangeSync(retailDb,{id:`${id}:count:${count.productId}`,branchId:stocktake.branchId||'main',productId:count.productId,delta:count.variance,createdAt:now(),category:count.variance<0?'stock-loss':'stock-adjustment',reason:approvalReason,allowExpired:true}))
      database.prepare('UPDATE branch_inventory SET stock = ?, updated_at = ? WHERE product_id = ? AND branch_id = ?').run(nextStock, now(), count.productId, stocktake.branchId || 'main')
      database.prepare('INSERT INTO inventory_movements (id, organization_id, product_id, quantity, reason, created_at, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), organizationId, count.productId, count.variance, adjustmentReason, now(), stocktake.branchId || 'main')
      database.prepare('INSERT INTO stocktake_adjustments (id, stocktake_id, product_id, expected_quantity, counted_quantity, variance, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(crypto.randomUUID(), id, count.productId, count.expected, count.counted, count.variance, adjustmentReason, now())
    }
    database.prepare('UPDATE stocktakes SET status = ?, approval_reason = ?, approved_at = ? WHERE id = ? AND organization_id = ?').run('approved', approvalReason, now(), id, organizationId)
    const approved = getStocktake(id)
    queueSync('stocktake', id, 'approved', { ...approved, counts: approved.counts.map(count => ({ ...count, beforeStock: beforeStocks.get(count.productId), stockEvent: stockEvents.get(count.productId) })) })
    database.exec('COMMIT')
    return approved
  } catch (error) { database.exec('ROLLBACK'); throw error }
}

export async function updateSettings(appName, currency = 'USD', posProvider = '', posTerminalId = '', posConnection = 'manual', mongoUri, mongoDatabase, logoData = '', policy) {
  const updatedAt = nextSettingsTimestamp(database.prepare('SELECT updated_at FROM app_settings WHERE organization_id = ?').get(organizationId)?.updated_at)
  database.prepare('UPDATE app_settings SET app_name = ?, currency = ?, pos_provider = ?, pos_terminal_id = ?, pos_connection = ?, logo_data = ?, updated_at = ? WHERE organization_id = ?').run(appName, currency, posProvider, posTerminalId, posConnection, logoData, updatedAt, organizationId)
  if (policy !== undefined) database.prepare('UPDATE app_settings SET payment_policy = ? WHERE organization_id = ?').run(JSON.stringify(paymentPolicy(policy)), organizationId)
  const config = { appName, shopName: appName, ...(mongoUri === undefined ? {} : { mongoUri }), ...(mongoDatabase === undefined ? {} : { mongoDatabase }), updatedAt }
  await writeShopConfig({ ...(await readShopConfig().catch(() => ({}))), ...config })
  const settings = await getSettings()
  queueSync('settings', organizationId, 'upsert', settings)
  return settings
}

// Older installations created their initial local settings before cloud sync
// existed. Publish that first snapshot once, so newly enrolled phones inherit
// the actual shop name, currency, and POS configuration.
export async function queueInitialSettingsSnapshot() {
  const alreadyPublished = database.prepare("SELECT 1 FROM sync_outbox WHERE entity_type = 'settings' LIMIT 1").get()
  if (alreadyPublished) return false
  const settings = await getSettings()
  queueSync('settings', organizationId, 'upsert', settings)
  return true
}

export async function updateShopProfile(input) {
  const profile = validateShopProfile(input)
  database.prepare('UPDATE app_settings SET shop_profile = ?, updated_at = ? WHERE organization_id = ?').run(JSON.stringify(profile), nextSettingsTimestamp(database.prepare('SELECT updated_at FROM app_settings WHERE organization_id = ?').get(organizationId)?.updated_at), organizationId)
  const settings = await getSettings()
  queueSync('settings', organizationId, 'upsert', settings)
  return profile
}

export async function addShopProfileCatalogueOption(workspace, field, input) {
  if (!Object.hasOwn(catalogueWorkspaces, workspace) || !['categories', 'units'].includes(field)) throw new Error('Choose a valid workspace category or unit list.')
  const value = typeof input === 'string' ? input.trim().replace(/\s+/g, ' ') : ''
  if (!value || value.length > (field === 'units' ? 30 : 80)) throw new Error('Enter a shorter category or unit name.')
  const current = await getSettings()
  const profile = normalizeShopProfile(current.shopProfile)
  const options = workspaceCatalogueSettings(profile, workspace)
  const list = options[field]
  const disabledKey = field === 'categories' ? 'disabledCategories' : 'disabledUnits'
  const existing = list.find(item => item.toLocaleLowerCase() === value.toLocaleLowerCase())
  if (existing) {
    if (!options[disabledKey].includes(existing)) return profile
    const next = { ...profile, workspaceCatalogues: { ...profile.workspaceCatalogues, [workspace]: { ...options, [disabledKey]: options[disabledKey].filter(item => item !== existing) } } }
    return updateShopProfile(next)
  }
  if (list.length >= 30) throw new Error('This workspace already has 30 choices. Remove one in Workspace catalogues before adding another.')
  const next = { ...profile, workspaceCatalogues: { ...profile.workspaceCatalogues, [workspace]: { ...options, [field]: [...list, value] } } }
  return updateShopProfile(next)
}

export function listBranches() {
  return database.prepare('SELECT id, name, address, is_default AS isDefault, is_active AS isActive, assigned_user_ids AS assignedUserIds, created_at AS createdAt, updated_at AS updatedAt FROM branches WHERE organization_id = ? ORDER BY is_default DESC, name').all(organizationId).map(branch => ({ ...branch, isDefault: Boolean(branch.isDefault), isActive: Boolean(branch.isActive), assignedUserIds: JSON.parse(branch.assignedUserIds || '[]') }))
}

export function updateBranch(id, input) {
  const existing = database.prepare('SELECT id, is_default AS isDefault FROM branches WHERE id = ? AND organization_id = ?').get(id, organizationId)
  if (!existing) throw new Error('Branch not found.')
  const name = String(input.name ?? '').trim().slice(0, 100), address = String(input.address ?? '').trim().slice(0, 250), isActive = input.isActive !== false
  const assignedUserIds = Array.isArray(input.assignedUserIds) ? [...new Set(input.assignedUserIds.map(String).filter(id => id.length <= 100))] : JSON.parse(database.prepare('SELECT assigned_user_ids AS ids FROM branches WHERE id = ?').get(id).ids || '[]')
  if (name.length < 2) throw new Error('Branch name must contain at least 2 characters.')
  if (database.prepare('SELECT 1 FROM branches WHERE organization_id = ? AND lower(name) = lower(?) AND id <> ?').get(organizationId, name, id)) throw new Error('A branch with that name already exists.')
  if (!isActive && existing.isDefault) throw new Error('The Main branch cannot be deactivated.')
  if (!isActive && database.prepare('SELECT COUNT(*) AS count FROM branches WHERE organization_id = ? AND is_active = 1').get(organizationId).count <= 1) throw new Error('Keep at least one active branch.')
  const updatedAt = now()
  database.prepare('UPDATE branches SET name = ?, address = ?, is_active = ?, assigned_user_ids = ?, updated_at = ? WHERE id = ? AND organization_id = ?').run(name, address, isActive ? 1 : 0, JSON.stringify(assignedUserIds), updatedAt, id, organizationId)
  const branch = { id, name, address, isDefault: Boolean(existing.isDefault), isActive, assignedUserIds, createdAt: database.prepare('SELECT created_at AS createdAt FROM branches WHERE id = ?').get(id).createdAt, updatedAt }
  queueSync('branch', id, 'upsert', branch)
  return branch
}

export function createBranch(input) {
  const name = String(input.name || '').trim().slice(0, 100)
  const address = String(input.address || '').trim().slice(0, 250)
  if (name.length < 2) throw new Error('Branch name must contain at least 2 characters.')
  if (database.prepare('SELECT 1 FROM branches WHERE organization_id = ? AND lower(name) = lower(?)').get(organizationId, name)) throw new Error('A branch with that name already exists.')
  const id = crypto.randomUUID()
  const timestamp = now()
  database.prepare('INSERT INTO branches (id, organization_id, name, address, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)').run(id, organizationId, name, address, timestamp, timestamp)
  database.prepare('INSERT OR IGNORE INTO branch_inventory (branch_id, product_id, stock, reorder_point, updated_at) SELECT ?, id, 0, reorder_point, ? FROM products WHERE organization_id = ?').run(id, timestamp, organizationId)
  const branch = { id, name, address, isDefault: false, isActive: true, assignedUserIds: [], createdAt: timestamp, updatedAt: timestamp }
  queueSync('branch', id, 'upsert', branch)
  return branch
}

export function transferBranchStock(input) {
  const fromBranchId = String(input.fromBranchId || ''), toBranchId = String(input.toBranchId || ''), productId = String(input.productId || '')
  const quantity = Number(input.quantity), reason = String(input.reason || '').trim().slice(0, 250)
  if (!fromBranchId || !toBranchId || fromBranchId === toBranchId) throw new Error('Choose two different branches.')
  if (!validQuantity(quantity, 0.001)) throw new Error('Transfer quantity must be a positive number.')
  if (reason.length < 3) throw new Error('Enter a reason for the transfer.')
  if (database.prepare('SELECT COUNT(*) AS count FROM branches WHERE organization_id = ? AND id IN (?, ?) AND is_active = 1').get(organizationId, fromBranchId, toBranchId).count !== 2) throw new Error('Both branches must be active.')
  if (!database.prepare('SELECT 1 FROM products WHERE id = ? AND organization_id = ?').get(productId, organizationId)) throw new Error('Product not found.')
  const source = database.prepare('SELECT stock FROM branch_inventory WHERE branch_id = ? AND product_id = ?').get(fromBranchId, productId)
  if (!source || source.stock < quantity) throw new Error('The source branch does not have enough stock.')
  const destination = database.prepare('SELECT stock FROM branch_inventory WHERE branch_id = ? AND product_id = ?').get(toBranchId, productId)
  const createdAt = now(), transferId = crypto.randomUUID(), payload = { id: transferId, fromBranchId, toBranchId, productId, quantity, reason, sourceBeforeStock: Number(source.stock), destinationBeforeStock: Number(destination?.stock) || 0, createdAt }
  database.exec('BEGIN')
  try {
    payload.batchAllocations=stockTransferSync(retailDb,payload)
    database.prepare('UPDATE branch_inventory SET stock = stock - ?, updated_at = ? WHERE branch_id = ? AND product_id = ?').run(quantity, createdAt, fromBranchId, productId)
    database.prepare('INSERT INTO branch_inventory (branch_id, product_id, stock, reorder_point, updated_at) VALUES (?, ?, ?, 0, ?) ON CONFLICT(branch_id, product_id) DO UPDATE SET stock = branch_inventory.stock + excluded.stock, updated_at = excluded.updated_at').run(toBranchId, productId, quantity, createdAt)
    database.prepare('INSERT INTO inventory_movements (id, organization_id, product_id, quantity, reason, created_at, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`${transferId}:out`, organizationId, productId, -quantity, `Transfer to ${toBranchId}: ${reason}`, createdAt, fromBranchId)
    database.prepare('INSERT INTO inventory_movements (id, organization_id, product_id, quantity, reason, created_at, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`${transferId}:in`, organizationId, productId, quantity, `Transfer from ${fromBranchId}: ${reason}`, createdAt, toBranchId)
    queueSync('branch_transfer', transferId, 'create', payload)
    database.exec('COMMIT')
  } catch (error) { database.exec('ROLLBACK'); throw error }
  return payload
}

export function listProducts(branchId = 'main') {
  return database.prepare(`SELECT p.id, p.name, p.sku, p.barcode, p.category, COALESCE(i.stock, 0) AS stock, COALESCE(i.reorder_point, p.reorder_point) AS reorder, p.price, p.cost_price AS cost, p.unit, p.custom_values AS customValues, p.updated_at AS updated
    FROM products p LEFT JOIN branch_inventory i ON i.product_id = p.id AND i.branch_id = ? WHERE p.organization_id = ? ORDER BY p.name`).all(branchId, organizationId)
}

export function exportProductCatalogCsv() {
  const rows = database.prepare(`SELECT p.name, p.sku, p.barcode, p.category, p.cost_price AS cost, p.price, p.unit, p.custom_values AS customValues, b.name AS branch, COALESCE(i.stock, 0) AS stock, COALESCE(i.reorder_point, p.reorder_point) AS reorder
    FROM products p CROSS JOIN branches b LEFT JOIN branch_inventory i ON i.product_id = p.id AND i.branch_id = b.id
    WHERE p.organization_id = ? ORDER BY p.name, b.is_default DESC, b.name`).all(organizationId)
  const cell = value => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`
  const profile = normalizeShopProfile(database.prepare('SELECT shop_profile FROM app_settings WHERE organization_id = ?').get(organizationId)?.shop_profile)
  const customIds = [...new Set(rows.flatMap(row => Object.keys(readCustomValues(row.customValues))))]
  return [['Product', 'SKU', 'Barcode', 'Category', 'Cost price', 'Selling price', 'Unit', 'Branch', 'Stock', 'Reorder point', ...customIds.map(id => `${profile.fields.find(field => field.id === id)?.label || id} [${id}]`)], ...rows.map(row => [row.name, row.sku, row.barcode, row.category, row.cost, row.price, row.unit, row.branch, row.stock, row.reorder, ...customIds.map(id => readCustomValues(row.customValues)[id] || '')])].map(row => row.map(cell).join(',')).join('\r\n')
}

export function createProduct(input, branchId = 'main') {
  const profile = normalizeShopProfile(database.prepare('SELECT shop_profile FROM app_settings WHERE organization_id = ?').get(organizationId)?.shop_profile)
  validateCoreRequirements(input, profile)
  const customValues = validateCustomValues(input.customValues, profile)
  const product = { id: crypto.randomUUID(), updated: now() }
  database.prepare('INSERT INTO products (id, organization_id, name, sku, barcode, category, stock, reorder_point, price, cost_price, unit, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)').run(product.id, organizationId, input.name, input.sku, input.barcode || '', input.category, input.reorder, input.price, input.cost || 0, input.unit, product.updated)
  database.prepare('INSERT INTO branch_inventory (branch_id, product_id, stock, reorder_point, updated_at) VALUES (?, ?, ?, ?, ?)').run(branchId, product.id, input.stock, input.reorder, product.updated)
  database.prepare('UPDATE products SET custom_values = ? WHERE id = ?').run(JSON.stringify(customValues), product.id)
  const saved = database.prepare('SELECT custom_values AS customValues, id, name, sku, barcode, category, ? AS stock, reorder_point AS reorder, price, cost_price AS cost, unit, updated_at AS updated FROM products WHERE id = ?').get(input.stock, product.id)
  queueSync('product', saved.id, 'upsert', { ...saved, stock: 0 })
  if (Number(input.stock)) queueSync('stock', saved.id, 'adjust', { productId: saved.id, branchId, amount: Number(input.stock), reason: 'initial-stock', updatedAt: product.updated })
  return saved
}

export async function updateProductCustomValues(productId, input, branchId = 'main') {
  const current = (await listProducts(branchId)).find(product => product.id === productId)
  if (!current) throw new Error('Product not found.')
  const customValues = { ...readCustomValues(current.customValues), ...validateCustomValues(input, normalizeShopProfile((await getSettings()).shopProfile)) }
  const updated = now()
  database.prepare('UPDATE products SET custom_values = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(customValues), updated, productId)
  const saved = { ...current, customValues, updated }
  queueSync('product', productId, 'upsert', { ...saved, stock: 0 })
  return saved
}

export function adjustStock(productId, amount, reason = 'manual-adjustment', shouldSync = true, branchId = 'main', recordedEvent) {
  if(recordedEvent && database.prepare('SELECT id FROM stock_events WHERE id=?').get(recordedEvent.id)) return listProducts(branchId).find(row=>row.id===productId)
  let product = database.prepare('SELECT stock FROM branch_inventory WHERE product_id = ? AND branch_id = ?').get(productId, branchId)
  if (!product) { database.prepare('INSERT OR IGNORE INTO branch_inventory (branch_id, product_id, stock, reorder_point, updated_at) SELECT ?, id, 0, reorder_point, ? FROM products WHERE id = ? AND organization_id = ?').run(branchId, now(), productId, organizationId); product = { stock: 0 } }
  if (!product) return null
  if (!validQuantity(amount, -Number.MAX_SAFE_INTEGER) || amount === 0) throw new Error('Stock changes must be non-zero with at most three decimals.')
  const nextStock = Math.round((product.stock + amount) * 1000) / 1000
  if (nextStock < 0) throw new Error('Stock cannot be negative.')
  const updatedAt = recordedEvent?.createdAt || now()
  const stockEvent = recordedEvent || { id: crypto.randomUUID(), branchId, productId, delta: amount, createdAt: updatedAt, category: amount < 0 ? 'stock-loss' : 'stock-adjustment', reason, allowExpired: true }
  database.exec('BEGIN')
  try {
    const result = recordedEvent && !recordedEvent.category && !recordedEvent.allocations && amount>0 ? stockEvent : stockChangeSync(retailDb, stockEvent)
    Object.assign(stockEvent, result)
    database.prepare('UPDATE branch_inventory SET stock = ?, updated_at = ? WHERE product_id = ? AND branch_id = ?').run(nextStock, updatedAt, productId, branchId)
    const movement = { id: crypto.randomUUID(), productId, quantity: amount, reason, createdAt: updatedAt }
    database.prepare('INSERT INTO inventory_movements (id, organization_id, product_id, quantity, reason, created_at, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(movement.id, organizationId, productId, amount, reason, updatedAt, branchId)
    if (shouldSync) queueSync('stock', productId, 'adjust', { productId, branchId, amount, beforeStock: Number(product.stock), reason, updatedAt, stockEvent })
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
  const saved = database.prepare('SELECT p.id, p.name, p.sku, p.category, i.stock, i.reorder_point AS reorder, p.price, p.cost_price AS cost, p.unit, p.custom_values AS customValues, p.updated_at AS updated FROM products p JOIN branch_inventory i ON i.product_id = p.id WHERE p.id = ? AND i.branch_id = ?').get(productId, branchId)

  return saved
}

export function createSale(sale, shouldSync = true, branchId = 'main', tillId) {
  sale = { ...sale, branchId: sale.branchId || branchId }
  sale = sale.paymentDetails ? recordPayment(sale, shouldSync ? database.prepare('SELECT payment_policy FROM app_settings WHERE organization_id = ?').get(organizationId)?.payment_policy : sale.paymentDetails.policy, true) : normalizeCashSale(sale)
  if (sale.paymentDetails?.counterOrder && shouldSync) {
    if (!tillId) throw new Error('Payment must be taken on the original till.')
    const row = database.prepare('SELECT payload FROM pos_records WHERE scope=? AND id=?').get(organizationId, sale.paymentDetails.counterOrder.id)
    const order=row?JSON.parse(row.payload):undefined
    if(shouldSync && order?.tableService){const ledgers=database.prepare("SELECT payload FROM pos_records WHERE scope=? AND branch_id=? AND kind='restaurant-ledger'").all(organizationId,sale.branchId);if(ledgers.some(ledger=>JSON.parse(ledger.payload).payments.some(payment=>payment.selections.some(part=>part.orderId===order.id)))) throw new Error('Use bill splitting to pay this partially settled order.')}
    validateCounterPayment(sale, order, tillId)
  }
  if (sale.paymentMethod === 'wallet' && !sale.paymentDetails?.customerId) throw new Error('A wallet sale requires a selected customer.')
  const previousSale = database.prepare('SELECT id,total,branch_id AS branchId,payment_method AS paymentMethod,payment_reference AS paymentReference,terminal_provider AS terminalProvider,payment_details AS paymentDetails,created_at AS createdAt FROM sales WHERE id=? AND organization_id=?').get(sale.id, organizationId)
  if(shouldSync && sale.paymentDetails?.serviceJob && !previousSale) throw new Error('Use the Jobs & invoices payment action.');
  if(shouldSync && sale.paymentDetails?.restaurantBill && !previousSale) throw new Error('Use the Restaurant & bar bill payment action.');
  if (previousSale) {
    if(sale.paymentDetails?.restaurantBill){ const paymentDetails=JSON.parse(previousSale.paymentDetails); const items=database.prepare('SELECT product_id AS productId,product_name AS productName,quantity,unit_price AS price FROM sale_items WHERE sale_id=? ORDER BY rowid').all(sale.id); if(restaurantPaymentFingerprint(sale)!==restaurantPaymentFingerprint({...previousSale,paymentDetails,items,currency:paymentDetails.restaurantBill.currency})) throw new Error('This bill payment already has different details.'); }
    if (sale.paymentDetails?.counterOrder) validateCounterRetry(sale, { ...previousSale, paymentDetails: JSON.parse(previousSale.paymentDetails) })
    return { ...sale, createdAt: previousSale.createdAt, syncStatus: 'synced' }
  }
  database.exec('BEGIN')
  try {
    if (shouldSync) {
      const rewardSales = database.prepare('SELECT id,payment_details FROM sales WHERE organization_id=? AND branch_id=?').all(organizationId, sale.branchId).map(row => ({ id: row.id, paymentDetails: row.payment_details ? JSON.parse(row.payment_details) : undefined }))
      const rewardReturns = database.prepare("SELECT payload FROM pos_records WHERE scope=? AND branch_id=? AND kind='return'").all(organizationId, sale.branchId).map(row => JSON.parse(row.payload))
      const checkoutSettings = database.prepare("SELECT payload FROM pos_records WHERE scope=? AND id='pos-settings'").get(organizationId)
      validateCheckoutSettings(sale, checkoutSettings ? JSON.parse(checkoutSettings.payload).value : undefined)
      if (sale.paymentDetails?.pos?.customerId && !database.prepare('SELECT id FROM customers WHERE id=? AND organization_id=?').get(sale.paymentDetails.pos.customerId, organizationId)) throw new Error('Selected customer does not exist.')
      validateLoyaltyBalance(sale, rewardSales, rewardReturns)
    }
    database.prepare('INSERT OR IGNORE INTO sales (id, organization_id, total, payment_method, payment_reference, terminal_provider, staff_id, staff_name, created_at, cash_received, change_given, payment_details, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(sale.id, organizationId, sale.total, sale.paymentMethod || 'external-pos', sale.paymentReference || '', sale.terminalProvider || '', sale.staffId || '', sale.staffName || '', sale.createdAt, sale.cashReceived ?? null, sale.changeGiven ?? null, sale.paymentDetails ? JSON.stringify(sale.paymentDetails) : null, sale.branchId)
    if (sale.paymentMethod === 'wallet') {
      const customerId = sale.paymentDetails.customerId
      const changed = database.prepare('UPDATE customers SET balance = ROUND(balance - ?, 2) WHERE id = ? AND organization_id = ? AND (balance >= ? OR ? = 1)').run(sale.total, customerId, organizationId, sale.total, sale.paymentDetails.creditApproved === true ? 1 : 0)
      if (!changed.changes) throw new Error('Customer wallet does not exist or has insufficient funds.')
      database.prepare('INSERT INTO wallet_transactions (id, organization_id, customer_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), organizationId, customerId, -sale.total, `Sale ${sale.id}`, sale.createdAt)
    }
    for (const item of sale.items) {
      if (!validQuantity(item.quantity, 0.001) || !Number.isFinite(Number(item.price)) || Number(item.price) < 0) throw new Error('Sale quantities and prices are invalid.')
      if (String(item.productId).startsWith('service:')) {
        if (!String(item.productName || '').trim() || String(item.productName).length > 200 || !Number.isFinite(item.quantity) || item.quantity <= 0 || Math.abs(item.quantity * 1000 - Math.round(item.quantity * 1000)) > 0.000001 || !Number.isFinite(item.price) || item.price < 0) throw new Error('Enter a service description, positive quantity and valid price.')
        database.prepare('INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), sale.id, item.productId, item.productName, item.quantity, item.price, 0)
        continue
      }
      const updatedAt = now()
      const product = database.prepare('SELECT i.stock, p.cost_price AS costPrice, p.name FROM products p JOIN branch_inventory i ON i.product_id = p.id WHERE p.id = ? AND p.organization_id = ? AND i.branch_id = ?').get(item.productId, organizationId, sale.branchId)
      if (!product || (shouldSync && product.stock < item.quantity)) throw new Error('Insufficient stock for sale.')
      item.beforeStock = Number(product.stock)
      const allocation=stockChangeSync(retailDb,{id:`${sale.id}:sale:${sale.items.indexOf(item)}`,branchId:sale.branchId,productId:item.productId,delta:-Number(item.quantity),createdAt:sale.createdAt,allocations:shouldSync?undefined:item.batchAllocations,completedSale:!shouldSync,unitCost:item.unitCost})
      item.unitCost=allocation.unitCost;item.batchAllocations=allocation.allocations

      database.prepare('INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), sale.id, item.productId, item.productName || product.name, item.quantity, item.price, item.unitCost)
      database.prepare('UPDATE sale_items SET batch_allocations=? WHERE sale_id=? AND product_id=? AND id=(SELECT id FROM sale_items WHERE sale_id=? ORDER BY rowid DESC LIMIT 1)').run(JSON.stringify(item.batchAllocations),sale.id,item.productId,sale.id)
      database.prepare('UPDATE branch_inventory SET stock = stock - ?, updated_at = ? WHERE product_id = ? AND branch_id = ?').run(item.quantity, updatedAt, item.productId, sale.branchId)
      database.prepare('INSERT INTO inventory_movements (id, organization_id, product_id, quantity, reason, created_at, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), organizationId, item.productId, -item.quantity, 'sale', updatedAt, sale.branchId)
    }
    if (shouldSync) queueSync('sale', sale.id, 'create', sale)
    database.exec('COMMIT')
    return { ...sale, syncStatus: 'synced' }
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

let pendingPosAction = Promise.resolve()
export function posAction(path, method, input, user, branchId, tillId) {
  const action = pendingPosAction.then(() => performPosAction(path, method, input, user, branchId, tillId))
  pendingPosAction = action.catch(() => undefined)
  return action
}
async function performPosAction(path, method, input, user, branchId, tillId) {
  const db = {
    execute: sql => database.exec(sql),
    query: (sql, params = []) => ({ values: database.prepare(sql).all(...params) }),
    run: (sql, params = []) => database.prepare(sql).run(...params),
    beginTransaction: () => database.exec('BEGIN'), commitTransaction: () => database.exec('COMMIT'), rollbackTransaction: () => database.exec('ROLLBACK')
  }
  return handlePos({ db, scope: organizationId, organizationId, branchId, user, path, method, input, tillId,
    sales: () => database.prepare('SELECT id,total,payment_reference AS paymentReference,terminal_provider AS terminalProvider,cash_received AS cashReceived,change_given AS changeGiven,payment_method AS paymentMethod,payment_details AS paymentDetails,created_at AS createdAt FROM sales WHERE organization_id=? AND branch_id=? ORDER BY created_at DESC').all(organizationId, branchId).map(sale => ({ ...sale, paymentDetails: sale.paymentDetails ? JSON.parse(sale.paymentDetails) : undefined, items: database.prepare('SELECT product_id AS productId, product_name AS productName, quantity, unit_cost AS unitCost, batch_allocations AS batchAllocations, unit_price AS price FROM sale_items WHERE sale_id=? ORDER BY rowid').all(sale.id) })),
    publish: (record,entityType='pos_record') => queueSync(entityType, record.id, entityType==='sale'?'create':'upsert', record) })
}

export function recordStaffRemovalLocal(id, removedAt) {
 database.prepare('INSERT OR IGNORE INTO staff_removals (id, removed_at) VALUES (?, ?)').run(id, removedAt)
 database.prepare("UPDATE users SET operational_access=0 WHERE id=? AND role IN ('admin','cashier')").run(id)
 database.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(id)
 return { id, removedAt, removed: true }
}

export function setStaffPermissions(id,permissions){const value=parsePermissions(permissions);if(!value)throw new Error("Choose staff permissions.");const result=database.prepare("UPDATE users SET permissions=?, operational_access=? WHERE id=? AND organization_id=? AND role IN ('admin','cashier')").run(JSON.stringify(value),Object.values(value).some(Boolean)?1:0,id,organizationId);if(!result.changes)throw new Error("Staff account not found.");return listUsers().find(user=>user.id===id)}
