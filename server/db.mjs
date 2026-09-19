import { paymentPolicy, recordPayment } from './payment.mjs'
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
    created_at TEXT NOT NULL
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

const organizationId = 'local-shop-organization'
const now = () => new Date().toISOString()
const initialShop = await readShopConfig()
database.prepare('INSERT OR IGNORE INTO organizations (id, name, created_at) VALUES (?, ?, ?)').run(organizationId, initialShop.shopName || 'My Business', now())
const settingsFile = join(dataDirectory, 'settings.json')
let appName = initialShop.appName || 'My Business'
try {
  appName = JSON.parse(await readFile(settingsFile, 'utf8')).appName || appName
} catch {}
if (initialShop.appName) {
  await writeShopConfig({ ...initialShop, appName, shopName: initialShop.shopName || appName })
}
database.prepare('INSERT OR IGNORE INTO app_settings (organization_id, app_name, updated_at) VALUES (?, ?, ?)').run(organizationId, appName, now())
try { database.exec("ALTER TABLE app_settings ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'") } catch {}
try { database.exec("ALTER TABLE app_settings ADD COLUMN pos_provider TEXT NOT NULL DEFAULT ''") } catch {}
try { database.exec("ALTER TABLE app_settings ADD COLUMN pos_terminal_id TEXT NOT NULL DEFAULT ''") } catch {}
try { database.exec("ALTER TABLE app_settings ADD COLUMN pos_connection TEXT NOT NULL DEFAULT 'manual'") } catch {}
try { database.exec("ALTER TABLE app_settings ADD COLUMN logo_data TEXT NOT NULL DEFAULT ''") } catch {}
try { database.exec("ALTER TABLE products ADD COLUMN barcode TEXT NOT NULL DEFAULT ''") } catch {}
try { database.exec("ALTER TABLE sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'external-pos'") } catch {}
try { database.exec("ALTER TABLE sales ADD COLUMN payment_reference TEXT NOT NULL DEFAULT ''") } catch {}
try { database.exec("ALTER TABLE sales ADD COLUMN terminal_provider TEXT NOT NULL DEFAULT ''") } catch {}
try { database.exec("ALTER TABLE app_settings ADD COLUMN payment_policy TEXT NOT NULL DEFAULT '{}'") } catch {}
try { database.exec("ALTER TABLE sales ADD COLUMN payment_details TEXT") } catch {}
try { database.exec("ALTER TABLE sales ADD COLUMN cash_received REAL") } catch {}
try { database.exec("ALTER TABLE sales ADD COLUMN change_given REAL") } catch {}
try { database.exec("ALTER TABLE sales ADD COLUMN staff_id TEXT NOT NULL DEFAULT ''") } catch {}
try { database.exec("ALTER TABLE sales ADD COLUMN staff_name TEXT NOT NULL DEFAULT ''") } catch {}
try { database.exec("ALTER TABLE stocktakes ADD COLUMN approval_reason TEXT NOT NULL DEFAULT ''") } catch {}
try { database.exec("ALTER TABLE products ADD COLUMN cost_price REAL NOT NULL DEFAULT 0") } catch {}
try { database.exec("ALTER TABLE sale_items ADD COLUMN unit_cost REAL NOT NULL DEFAULT 0") } catch {}
try { database.exec("ALTER TABLE users ADD COLUMN operational_access INTEGER NOT NULL DEFAULT 0") } catch {}
try { database.exec("ALTER TABLE users ADD COLUMN username TEXT NOT NULL DEFAULT ''") } catch {}
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

export function recordSyncConflicts(conflicts) {
  if (!Array.isArray(conflicts)) return
  const insert = database.prepare('INSERT OR IGNORE INTO sync_conflicts (id, operation_id, entity_type, entity_id, reason, local_payload, remote_payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  for (const conflict of conflicts) insert.run(crypto.randomUUID(), conflict.operationId, conflict.entityType || 'unknown', conflict.entityId || '', conflict.reason || 'A newer change exists on another device.', JSON.stringify(conflict.localPayload || {}), JSON.stringify(conflict.remotePayload || {}), now())
}

export function listSyncConflicts() {
  return database.prepare('SELECT id, operation_id AS operationId, entity_type AS entityType, entity_id AS entityId, reason, created_at AS createdAt, resolved_at AS resolvedAt FROM sync_conflicts WHERE resolved_at IS NULL ORDER BY created_at DESC').all()
}

export function resolveSyncConflict(id) {
  database.prepare('UPDATE sync_conflicts SET resolved_at = ? WHERE id = ?').run(now(), id)
}

export function markSyncFailure(message) {
  database.prepare('UPDATE sync_outbox SET attempts = attempts + 1, last_error = ? WHERE synced_at IS NULL').run(String(message || 'Sync failed').slice(0, 500))
}

export function getSyncCursor() { return database.prepare("SELECT value FROM sync_state WHERE key = 'cursor'").get()?.value || '' }
export function setSyncCursor(cursor) { database.prepare("INSERT INTO sync_state (key, value) VALUES ('cursor', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(cursor || '')) }
export function getSyncStatus() {
  const pending = database.prepare('SELECT COUNT(*) AS count FROM sync_outbox WHERE synced_at IS NULL').get().count
  const lastError = database.prepare('SELECT last_error AS value FROM sync_outbox WHERE synced_at IS NULL AND last_error <> \'\' ORDER BY id DESC LIMIT 1').get()?.value || ''
  const conflicts = database.prepare('SELECT COUNT(*) AS count FROM sync_conflicts WHERE resolved_at IS NULL').get().count
  return { configured: Boolean(process.env.SYNC_API_URL && process.env.SYNC_DEVICE_TOKEN && process.env.BUSINESS_ID), pending, conflicts, lastError }
}
export async function getSettings() {
  const row = database.prepare('SELECT app_name AS appName, currency, pos_provider AS posProvider, pos_terminal_id AS posTerminalId, pos_connection AS posConnection, logo_data AS logoData, payment_policy AS paymentPolicy, updated_at AS updatedAt FROM app_settings WHERE organization_id = ?').get(organizationId)
  const ownerCount = database.prepare('SELECT COUNT(*) AS count FROM users WHERE organization_id = ?').get(organizationId).count
  return {
    ...(row || { appName: 'My Business', currency: 'USD', posProvider: '', posTerminalId: '', posConnection: 'manual', logoData: '', updatedAt: now() }),
    paymentPolicy: paymentPolicy(row?.paymentPolicy),
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
  const user = database.prepare("SELECT id, name, email, username, password_hash AS passwordHash, role, operational_access AS operationalAccess FROM users WHERE organization_id = ? AND ((role = 'owner' AND email = ?) OR (role IN ('admin', 'cashier') AND username = ?))").get(organizationId, value, value)
  if (!user) return null
  if (!matchesPassword(password, user.passwordHash)) return null
  if (!String(user.passwordHash).includes(':')) database.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), user.id)
  return { id: user.id, name: user.name, email: user.email, username: user.username || '', role: user.role, operationalAccess: Boolean(user.operationalAccess), organizationId }
}

export function getUserById(id) {
  const user = database.prepare('SELECT id, name, email, username, role, operational_access AS operationalAccess FROM users WHERE id = ? AND organization_id = ?').get(id, organizationId)
  return user ? { ...user, operationalAccess: Boolean(user.operationalAccess), organizationId } : null
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
// revoke the cashier's local sessions at the same time so an old password
// cannot continue to work on this device.
export function resetCashierPassword(userId, newPassword) {
  const password = String(newPassword || '').trim()
  if (password.length < 10) throw new Error('New password must be at least 10 characters long.')
  const user = database.prepare("SELECT id, name, email, username, role, operational_access AS operationalAccess FROM users WHERE id = ? AND organization_id = ? AND role = 'cashier'").get(userId, organizationId)
  if (!user) throw new Error('Cashier account not found on this device.')
  database.prepare('UPDATE users SET password_hash = ? WHERE id = ? AND organization_id = ?').run(hashPassword(password), user.id, organizationId)
  database.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(user.id)
  return { ...user, operationalAccess: Boolean(user.operationalAccess) }
}

export function getOwnerMetrics() {
  const sales = database.prepare('SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count FROM sales WHERE organization_id = ?').get(organizationId)
  const stock = database.prepare('SELECT COALESCE(SUM(stock * price), 0) AS value, COUNT(*) AS products, SUM(CASE WHEN stock <= reorder_point THEN 1 ELSE 0 END) AS lowStock FROM products WHERE organization_id = ?').get(organizationId)
  return { salesToday: sales.total, saleCount: sales.count, inventoryValue: stock.value, productCount: stock.products, lowStock: stock.lowStock }
}

export function listCustomers() {
  return database.prepare('SELECT id, name, phone, balance FROM customers WHERE organization_id = ? ORDER BY name').all(organizationId).map(customer => ({ ...customer, transactions: database.prepare('SELECT id, amount, reason, created_at AS createdAt FROM wallet_transactions WHERE customer_id = ? AND organization_id = ? ORDER BY created_at DESC LIMIT 50').all(customer.id, organizationId) }))
}

export function getReports() {
  const totals = (start) => database.prepare('SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count FROM sales WHERE organization_id = ? AND created_at >= ?').get(organizationId, start)
  const date = new Date()
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString()
  const startOfWeek = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7)).toISOString()
  const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1).toISOString()
  const inventory = database.prepare('SELECT COALESCE(SUM(stock * price), 0) AS value, COUNT(*) AS products, COALESCE(SUM(CASE WHEN stock <= reorder_point THEN 1 ELSE 0 END), 0) AS lowStock FROM products WHERE organization_id = ?').get(organizationId)
  // Gross profit is estimated from sale price because purchase cost is not yet recorded per product.
  const profit = database.prepare(`SELECT COALESCE(SUM(s.total), 0) AS revenue, COALESCE(SUM(si.quantity * si.unit_cost), 0) AS cost
    FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id WHERE s.organization_id = ? AND s.created_at >= ?`).get(organizationId, startOfMonth)
  const expenses = database.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE organization_id = ? AND incurred_at >= ?').get(organizationId, startOfMonth)
  return { daily: totals(startOfDay), weekly: totals(startOfWeek), monthly: totals(startOfMonth), inventory, profit: { revenue: profit.revenue, cost: profit.cost, expenses: expenses.total, amount: profit.revenue - profit.cost - expenses.total } }
}

export function exportSalesCsv() {
  const rows = database.prepare(`SELECT s.id, s.created_at AS createdAt, s.total, s.payment_method AS paymentMethod, s.payment_reference AS paymentReference,
    GROUP_CONCAT(si.quantity || ' x ' || si.product_name, '; ') AS items
    FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id WHERE s.organization_id = ? GROUP BY s.id ORDER BY s.created_at DESC`).all(organizationId)
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  return ['Sale ID,Date,Items,Payment method,Payment reference,Total', ...rows.map((row) => [row.id, row.createdAt, row.items || '', row.paymentMethod, row.paymentReference, row.total].map(escape).join(','))].join('\n')
}

export function listUsers() {
  return database.prepare('SELECT id, name, email, username, role, operational_access AS operationalAccess, created_at AS createdAt FROM users WHERE organization_id = ? ORDER BY CASE role WHEN \'owner\' THEN 0 WHEN \'admin\' THEN 1 ELSE 2 END, name').all(organizationId).map((user) => ({ ...user, operationalAccess: Boolean(user.operationalAccess) }))
}

export function createUser(input) {
  const name = String(input.name || '').trim()
  const email = String(input.email || '').trim().toLowerCase()
  const username = String(input.username || '').trim().toLowerCase()
  const password = String(input.password || '')
  const role = String(input.role || '')
  if (!name || name.length > 100) throw new Error('Name is required and must be 100 characters or less.')
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Error('A valid email address is required when supplied.')
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) throw new Error('Username must be 3–32 characters and use letters, numbers, dots, hyphens, or underscores.')
  if (password.length < 10) throw new Error('Password must be at least 10 characters long.')
  if (!['admin', 'cashier'].includes(role)) throw new Error('New users can only be admins or cashiers.')
  const id = String(input.id || crypto.randomUUID())
  // SQLite retains a non-null unique email column for compatibility with
  // existing installations. This internal placeholder is never exposed.
  const storedEmail = email || `${id}@staff.local.invalid`
  try {
    database.prepare('INSERT INTO users (id, organization_id, name, email, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, organizationId, name, storedEmail, username, hashPassword(password), role, now())
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw new Error('That email address is already in use.')
    throw error
  }
  const user = database.prepare('SELECT id, name, email, username, role, operational_access AS operationalAccess, created_at AS createdAt FROM users WHERE id = ?').get(id)
  queueSync('user', id, 'upsert', user)
  return { ...user, email, operationalAccess: Boolean(user.operationalAccess) }
}

export function setCashierOperationalAccess(id, enabled) {
  const result = database.prepare("UPDATE users SET operational_access = ? WHERE id = ? AND organization_id = ? AND role = 'cashier'").run(enabled ? 1 : 0, id, organizationId)
  if (!result.changes) throw new Error('Cashier account not found.')
  const user = database.prepare('SELECT id, name, email, role, operational_access AS operationalAccess, created_at AS createdAt FROM users WHERE id = ?').get(id)
  return { ...user, operationalAccess: Boolean(user.operationalAccess) }
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
  database.prepare(`INSERT INTO users (id, organization_id, name, email, username, password_hash, role, operational_access, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email, username = excluded.username, password_hash = excluded.password_hash, role = excluded.role, operational_access = excluded.operational_access`).run(id, organizationId, name, storedEmail, username, hashPassword(password), role, operationalAccess, now())
  return authenticateUser(role === 'owner' ? email : username, password)
}

export function listExpenses(limit = 200) {
  return database.prepare('SELECT id, category, description, amount, incurred_at AS incurredAt, created_at AS createdAt FROM expenses WHERE organization_id = ? ORDER BY incurred_at DESC LIMIT ?').all(organizationId, Math.min(Math.max(Number(limit) || 200, 1), 500))
}

export function createExpense(input) {
  const category = String(input.category || '').trim()
  const description = String(input.description || '').trim()
  const amount = Number(input.amount)
  const incurredAt = String(input.incurredAt || now())
  if (!category || !description || !Number.isFinite(amount) || amount <= 0) throw new Error('Expense category, description, and a positive amount are required.')
  const expense = { id: crypto.randomUUID(), category, description, amount, incurredAt, createdAt: now() }
  database.prepare('INSERT INTO expenses (id, organization_id, category, description, amount, incurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(expense.id, organizationId, expense.category, expense.description, expense.amount, expense.incurredAt, expense.createdAt)
  queueSync('expense', expense.id, 'create', expense)
  return expense
}

export function createCustomer(input) {
  const name = String(input.name || '').trim()
  const phone = String(input.phone || '').trim()
  if (!name || name.length > 100) throw new Error('Customer name is required and must be 100 characters or less.')
  const id = crypto.randomUUID()
  database.prepare('INSERT INTO customers (id, organization_id, name, phone, balance, created_at) VALUES (?, ?, ?, ?, 0, ?)').run(id, organizationId, name, phone, now())
  const customer = database.prepare('SELECT id, name, phone, balance FROM customers WHERE id = ?').get(id)
  queueSync('customer', id, 'upsert', customer)
  return customer
}

export function listSales(limit = 100) {
  const sales = database.prepare('SELECT id, total, payment_method AS paymentMethod, payment_reference AS paymentReference, terminal_provider AS terminalProvider, cash_received AS cashReceived, change_given AS changeGiven, payment_details AS paymentDetails, staff_id AS staffId, staff_name AS staffName, created_at AS createdAt FROM sales WHERE organization_id = ? ORDER BY created_at DESC LIMIT ?').all(organizationId, Math.min(Math.max(Number(limit) || 100, 1), 500))
  const itemQuery = database.prepare('SELECT product_id AS productId, product_name AS productName, quantity, unit_price AS unitPrice FROM sale_items WHERE sale_id = ?')
  return sales.map((sale) => ({ ...sale, paymentDetails: sale.paymentDetails ? JSON.parse(sale.paymentDetails) : undefined, items: itemQuery.all(sale.id) }))
}

export function listMovements(limit = 200) {
  return database.prepare(`SELECT m.id, p.name AS productName, p.sku, m.quantity, m.reason, m.created_at AS createdAt
    FROM inventory_movements m JOIN products p ON p.id = m.product_id
    WHERE m.organization_id = ? ORDER BY m.created_at DESC LIMIT ?`).all(organizationId, Math.min(Math.max(Number(limit) || 200, 1), 500))
}

export async function createBackup() {
  const backupDirectory = join(dataDirectory, 'backups')
  await mkdir(backupDirectory, { recursive: true })
  const fileName = `stockroom-${now().replace(/[:.]/g, '-')}.sqlite`
  const destination = join(backupDirectory, fileName)
  await copyFile(databasePath, destination)
  return { fileName, path: destination }
}

export function adjustCustomerWallet(customerId, amount, reason = 'manual-adjustment', shouldSync = true) {
  const customer = database.prepare('SELECT id, name, phone, balance FROM customers WHERE id = ? AND organization_id = ?').get(customerId, organizationId)
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
  const updatedCustomer = database.prepare('SELECT id, name, phone, balance FROM customers WHERE id = ?').get(customerId)
  if (shouldSync) queueSync('wallet', customerId, 'adjust', { customerId, amount, reason, createdAt })
  return updatedCustomer
}

export function applyRemoteOperations(operations) {
  if (!Array.isArray(operations)) return
  for (const operation of operations) {
    if (!operation?.operationId || database.prepare('SELECT 1 FROM sync_inbox WHERE operation_id = ?').get(operation.operationId)) continue
    const payload = operation.payload || {}
    try {
      if (operation.entityType === 'product' && operation.action === 'upsert') {
        database.prepare(`INSERT INTO products (id, organization_id, name, sku, barcode, category, stock, reorder_point, price, unit, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, sku = excluded.sku, barcode = excluded.barcode, category = excluded.category, reorder_point = excluded.reorder_point, price = excluded.price, unit = excluded.unit, updated_at = excluded.updated_at`)
          .run(payload.id, organizationId, payload.name, payload.sku, payload.barcode || '', payload.category, Number(payload.stock) || 0, Number(payload.reorder) || 0, Number(payload.price) || 0, payload.unit, payload.updated || now())
      } else if (operation.entityType === 'stock' && operation.action === 'adjust') {
        adjustStock(payload.productId, Number(payload.amount), payload.reason || 'remote-adjustment', false)
      } else if (operation.entityType === 'sale' && operation.action === 'create') {
        createSale(payload, false)
      } else if (operation.entityType === 'customer' && operation.action === 'upsert') {
        database.prepare('INSERT INTO customers (id, organization_id, name, phone, balance, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, phone = excluded.phone')
          .run(payload.id, organizationId, payload.name, payload.phone || '', Number(payload.balance) || 0, now())
      } else if (operation.entityType === 'wallet' && operation.action === 'adjust') {
        adjustCustomerWallet(payload.customerId, Number(payload.amount), payload.reason || 'remote-wallet', false)
      } else if (operation.entityType === 'expense' && operation.action === 'create') {
        database.prepare('INSERT OR IGNORE INTO expenses (id, organization_id, category, description, amount, incurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(payload.id, organizationId, payload.category, payload.description, Number(payload.amount), payload.incurredAt, payload.createdAt || now())
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
        database.prepare('UPDATE stocktakes SET status = ?, approval_reason = ?, approved_at = ? WHERE id = ?').run('approved', payload.approvalReason || '', payload.approvedAt || now(), payload.id)
        for (const count of payload.counts || []) {
          if (Number(count.variance)) adjustStock(count.productId, Number(count.variance), `Remote stocktake: ${payload.approvalReason || 'approved'}`, false)
        }
      } else if (operation.entityType === 'settings' && operation.action === 'upsert') {
        if (payload.paymentPolicy !== undefined) database.prepare('UPDATE app_settings SET payment_policy = ? WHERE organization_id = ?').run(JSON.stringify(paymentPolicy(payload.paymentPolicy)), organizationId)
        database.prepare('UPDATE app_settings SET app_name = ?, currency = ?, pos_provider = ?, pos_terminal_id = ?, pos_connection = ?, logo_data = ?, updated_at = ? WHERE organization_id = ?')
          .run(payload.appName || 'My Business', payload.currency || 'USD', payload.posProvider || '', payload.posTerminalId || '', payload.posConnection || 'manual', payload.logoData || '', payload.updatedAt || now(), organizationId)
      }
      database.prepare('INSERT INTO sync_inbox (operation_id, received_at) VALUES (?, ?)').run(operation.operationId, now())
    } catch (error) {
      console.error(`Could not apply remote operation ${operation.operationId}:`, error.message)
    }
  }
}

export function createStocktake() {
  const id = crypto.randomUUID()
  const createdAt = now()
  database.prepare('INSERT INTO stocktakes (id, organization_id, status, approval_reason, created_at, approved_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, organizationId, 'draft', '', createdAt, null)
  const products = listProducts()
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
  const stocktake = database.prepare('SELECT id, status, approval_reason AS approvalReason, created_at AS createdAt, approved_at AS approvedAt FROM stocktakes WHERE id = ? AND organization_id = ?').get(id, organizationId)
  if (!stocktake) return null
  stocktake.counts = database.prepare('SELECT c.id, c.product_id AS productId, p.name, p.sku, c.expected_quantity AS expected, c.counted_quantity AS counted, c.variance FROM stocktake_counts c JOIN products p ON p.id = c.product_id WHERE c.stocktake_id = ? ORDER BY p.name').all(id)
  stocktake.history = getStocktakeHistory(id)
  return stocktake
}

export function updateStocktakeCount(stocktakeId, countId, counted) {
  const stocktake = database.prepare('SELECT status FROM stocktakes WHERE id = ? AND organization_id = ?').get(stocktakeId, organizationId)
  if (!stocktake || stocktake.status === 'approved') throw new Error('Approved stock-takes cannot be edited.')
  const numericCount = Number(counted)
  if (!Number.isInteger(numericCount) || numericCount < 0) throw new Error('Count must be a whole number zero or greater.')
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
  database.exec('BEGIN')
  try {
    for (const count of stocktake.counts) {
      if (count.variance === 0) continue
      const adjustmentReason = `${approvalReason} · ${count.name}`
      const product = database.prepare('SELECT stock FROM products WHERE id = ? AND organization_id = ?').get(count.productId, organizationId)
      if (!product) continue
      const nextStock = product.stock + count.variance
      if (nextStock < 0) throw new Error(`Stock cannot be negative for ${count.name}.`)
      database.prepare('UPDATE products SET stock = ?, updated_at = ? WHERE id = ? AND organization_id = ?').run(nextStock, now(), count.productId, organizationId)
      database.prepare('INSERT INTO inventory_movements (id, organization_id, product_id, quantity, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), organizationId, count.productId, count.variance, adjustmentReason, now())
      database.prepare('INSERT INTO stocktake_adjustments (id, stocktake_id, product_id, expected_quantity, counted_quantity, variance, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(crypto.randomUUID(), id, count.productId, count.expected, count.counted, count.variance, adjustmentReason, now())
    }
    database.prepare('UPDATE stocktakes SET status = ?, approval_reason = ?, approved_at = ? WHERE id = ? AND organization_id = ?').run('approved', approvalReason, now(), id, organizationId)
    database.exec('COMMIT')
    const approved = getStocktake(id)
    queueSync('stocktake', id, 'approved', approved)
    return approved
  } catch (error) { database.exec('ROLLBACK'); throw error }
}

export async function updateSettings(appName, currency = 'USD', posProvider = '', posTerminalId = '', posConnection = 'manual', mongoUri = '', mongoDatabase = 'stockroom', logoData = '', policy) {
  const updatedAt = now()
  database.prepare('UPDATE app_settings SET app_name = ?, currency = ?, pos_provider = ?, pos_terminal_id = ?, pos_connection = ?, logo_data = ?, updated_at = ? WHERE organization_id = ?').run(appName, currency, posProvider, posTerminalId, posConnection, logoData, updatedAt, organizationId)
  if (policy !== undefined) database.prepare('UPDATE app_settings SET payment_policy = ? WHERE organization_id = ?').run(JSON.stringify(paymentPolicy(policy)), organizationId)
  const config = { appName, shopName: appName, mongoUri, mongoDatabase, updatedAt }
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

export function listProducts() {
  return database.prepare(`SELECT id, name, sku, barcode, category, stock, reorder_point AS reorder, price, cost_price AS cost, unit, updated_at AS updated FROM products WHERE organization_id = ? ORDER BY name`).all(organizationId)
}

export function createProduct(input) {
  const product = { id: crypto.randomUUID(), updated: now() }
  database.prepare('INSERT INTO products (id, organization_id, name, sku, barcode, category, stock, reorder_point, price, cost_price, unit, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(product.id, organizationId, input.name, input.sku, input.barcode || '', input.category, input.stock, input.reorder, input.price, input.cost || 0, input.unit, product.updated)
  const saved = database.prepare('SELECT id, name, sku, barcode, category, stock, reorder_point AS reorder, price, cost_price AS cost, unit, updated_at AS updated FROM products WHERE id = ?').get(product.id)
  queueSync('product', saved.id, 'upsert', saved)
  return saved
}

export function adjustStock(productId, amount, reason = 'manual-adjustment', shouldSync = true) {
  const product = database.prepare('SELECT stock FROM products WHERE id = ? AND organization_id = ?').get(productId, organizationId)
  if (!product) return null
  const nextStock = product.stock + amount
  if (nextStock < 0) throw new Error('Stock cannot be negative.')
  const updatedAt = now()
  database.exec('BEGIN')
  try {
    database.prepare('UPDATE products SET stock = ?, updated_at = ? WHERE id = ? AND organization_id = ?').run(nextStock, updatedAt, productId, organizationId)
    const movement = { id: crypto.randomUUID(), productId, quantity: amount, reason, createdAt: updatedAt }
    database.prepare('INSERT INTO inventory_movements (id, organization_id, product_id, quantity, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(movement.id, organizationId, productId, amount, reason, updatedAt)
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
  const saved = database.prepare('SELECT id, name, sku, category, stock, reorder_point AS reorder, price, cost_price AS cost, unit, updated_at AS updated FROM products WHERE id = ?').get(productId)
  if (shouldSync) { queueSync('stock', productId, 'adjust', { productId, amount, reason, updatedAt }); queueSync('inventory_movement', productId, 'create', { productId, amount, reason, createdAt: updatedAt }) }
  return saved
}

export function createSale(sale, shouldSync = true) {
  sale = sale.paymentDetails ? recordPayment(sale, shouldSync ? database.prepare('SELECT payment_policy FROM app_settings WHERE organization_id = ?').get(organizationId)?.payment_policy : sale.paymentDetails.policy, true) : normalizeCashSale(sale)
  if (sale.paymentMethod === 'wallet' && !sale.paymentDetails?.customerId) throw new Error('A wallet sale requires a selected customer.')
  if (database.prepare('SELECT id FROM sales WHERE id = ?').get(sale.id)) return { ...sale, syncStatus: 'synced' }
  database.exec('BEGIN')
  try {
    database.prepare('INSERT OR IGNORE INTO sales (id, organization_id, total, payment_method, payment_reference, terminal_provider, staff_id, staff_name, created_at, cash_received, change_given, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(sale.id, organizationId, sale.total, sale.paymentMethod || 'external-pos', sale.paymentReference || '', sale.terminalProvider || '', sale.staffId || '', sale.staffName || '', sale.createdAt, sale.cashReceived ?? null, sale.changeGiven ?? null, sale.paymentDetails ? JSON.stringify(sale.paymentDetails) : null)
    if (sale.paymentMethod === 'wallet') {
      const customerId = sale.paymentDetails.customerId
      const changed = database.prepare('UPDATE customers SET balance = ROUND(balance - ?, 2) WHERE id = ? AND organization_id = ? AND (balance >= ? OR ? = 1)').run(sale.total, customerId, organizationId, sale.total, sale.paymentDetails.creditApproved === true ? 1 : 0)
      if (!changed.changes) throw new Error('Customer wallet does not exist or has insufficient funds.')
      database.prepare('INSERT INTO wallet_transactions (id, organization_id, customer_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), organizationId, customerId, -sale.total, `Sale ${sale.id}`, sale.createdAt)
    }
    for (const item of sale.items) {
      const updatedAt = now()
      const product = database.prepare('SELECT stock, cost_price AS costPrice, name FROM products WHERE id = ? AND organization_id = ?').get(item.productId, organizationId)
      if (!product || product.stock < item.quantity) throw new Error('Insufficient stock for sale.')
      database.prepare('INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), sale.id, item.productId, product.name, item.quantity, item.price, product.costPrice || 0)
      database.prepare('UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ? AND organization_id = ?').run(item.quantity, updatedAt, item.productId, organizationId)
      database.prepare('INSERT INTO inventory_movements (id, organization_id, product_id, quantity, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(crypto.randomUUID(), organizationId, item.productId, -item.quantity, 'sale', updatedAt)
    }
    database.exec('COMMIT')
    if (shouldSync) queueSync('sale', sale.id, 'create', sale)
    return { ...sale, syncStatus: 'synced' }
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}
