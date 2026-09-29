import { paymentPolicy, recordPayment } from '../../server/payment.mjs'
import { normalizeCashSale } from '../../server/cash.mjs'
import { loadSubscriptionAccess } from '../../server/subscription-client.mjs'
import { getMobileSyncConfiguration, isNativeMobile, openMobileDatabase, saveMobileSyncConfiguration, type MobileSyncConfiguration } from './mobileDatabase'
import { mobileStocktake } from './mobileStocktake'
import { cloudRequest as requestCloud } from './cloudRequest'
import { collectStaffActivity } from './staffActivityData'

type MobileUser = { id: string; name: string; email: string; username?: string; role: 'owner' | 'admin' | 'cashier'; operationalAccess: boolean; organizationId: string }
type Operation = { operationId: string; entityType: string; entityId: string; action: string; payload: Record<string, unknown>; createdAt: string }

const networkFetch = window.fetch.bind(window)
const originalFetch: typeof fetch = (input, init = {}) => networkFetch(input, { ...init, signal: init.signal || AbortSignal.timeout(20000) })
const cloudUrl = __STOCKROOM_SYNC_API_URL__.replace(/\/$/, '')
const now = () => new Date().toISOString()
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const error = (message: string, status = 400) => json({ error: message }, status)
const id = () => crypto.randomUUID()

async function setting(key: string) {
  const db = await openMobileDatabase()
  const result = await db.query('SELECT value FROM mobile_settings WHERE key = ?', [key])
  return result.values?.[0]?.value ? String(result.values[0].value) : ''
}
async function setSetting(key: string, value: string) {
  const db = await openMobileDatabase()
  await db.run('INSERT INTO mobile_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value])
}
async function subscriptionStatus(force = false) {
  const config = await getMobileSyncConfiguration()
  return loadSubscriptionAccess({ config: config ? { url: config.syncApiUrl, token: config.deviceToken, businessId: config.businessId } : null, read: setting, write: setSetting, fetcher: originalFetch, force })
}
async function mobileDeviceId() {
  const existing = await setting('mobileDeviceId')
  if (existing) return existing
  const generated = `android-${crypto.randomUUID()}`
  await setSetting('mobileDeviceId', generated)
  return generated
}
async function sessionUser(): Promise<MobileUser | null> {
  const userId = await setting('sessionUserId')
  if (!userId) return null
  const db = await openMobileDatabase()
  const result = await db.query('SELECT id, name, email, username, role, operational_access AS operationalAccess FROM users WHERE id = ?', [userId])
  const user = result.values?.[0]
  const config = await getMobileSyncConfiguration()
  return user ? { ...user, operationalAccess: Boolean(user.operationalAccess), organizationId: config?.businessId || 'mobile-local' } as MobileUser : null
}
async function restoreCloudSession(): Promise<MobileUser | null> {
  const config = await getMobileSyncConfiguration()
  const token = await setting('cloudAccessToken')
  if (!config || !token) return null
  const response = await originalFetch(`${config.syncApiUrl}/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.account?.id) return null
  const account = result.account
  if (account.businessId !== config.businessId) {
    await setSetting('cloudAccessToken', '')
    return null
  }
  const localUser: MobileUser = { id: account.id, name: account.name, email: account.email || `${account.id}@staff.local.invalid`, username: account.username || '', role: account.role, operationalAccess: Boolean(account.operationalAccess), organizationId: config.businessId }
  const db = await openMobileDatabase()
  await db.run('INSERT INTO users (id, name, email, username, role, operational_access, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, email=excluded.email, username=excluded.username, role=excluded.role, operational_access=excluded.operational_access', [localUser.id, localUser.name, localUser.email, localUser.username || '', localUser.role, localUser.operationalAccess ? 1 : 0, now()])
  const stored = (await db.query('SELECT id, name, email, username, role, operational_access AS operationalAccess FROM users WHERE id = ?', [localUser.id])).values?.[0]
  if (!stored) return null
  await setSetting('sessionUserId', String(stored.id))
  return { ...stored, operationalAccess: Boolean(stored.operationalAccess), organizationId: config.businessId } as MobileUser
}
async function restoreSavedSession(): Promise<MobileUser | null> {
  const saved = JSON.parse(localStorage.getItem('stockroom-user') || 'null') as Partial<MobileUser> | null
  if (!saved?.id) return null
  const config = await getMobileSyncConfiguration()
  const localUser: MobileUser = { id: saved.id, name: String(saved.name || ''), email: String(saved.email || `${saved.id}@staff.local.invalid`), username: String(saved.username || ''), role: saved.role || 'cashier', operationalAccess: Boolean(saved.operationalAccess), organizationId: config?.businessId || String(saved.organizationId || 'mobile-local') }
  const db = await openMobileDatabase()
  await db.run('INSERT INTO users (id, name, email, username, role, operational_access, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, email=excluded.email, username=excluded.username, role=excluded.role, operational_access=excluded.operational_access', [localUser.id, localUser.name, localUser.email, localUser.username || '', localUser.role, localUser.operationalAccess ? 1 : 0, now()])
  await setSetting('sessionUserId', localUser.id)
  return localUser
}
function isManager(user: MobileUser | null) { return Boolean(user && ['owner', 'admin'].includes(user.role)) }
function canOperate(user: MobileUser | null) { return isManager(user) || Boolean(user?.role === 'cashier' && user.operationalAccess) }
async function body(init?: RequestInit) { try { return JSON.parse(String(init?.body || '{}')) as Record<string, unknown> } catch { throw new Error('Request body must be valid JSON.') } }

async function queue(entityType: string, entityId: string, action: string, payload: Record<string, unknown>) {
  const db = await openMobileDatabase()
  await db.run('INSERT INTO sync_outbox (operation_id, entity_type, entity_id, action, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id(), entityType, entityId, action, JSON.stringify(payload), now()])
}
async function ensureBranches(db: Awaited<ReturnType<typeof openMobileDatabase>>) {
  const timestamp = now()
  await db.run("INSERT OR IGNORE INTO branches (id, name, address, is_default, created_at, updated_at) VALUES ('main', 'Main branch', '', 1, ?, ?)", [timestamp, timestamp])
  await db.run("INSERT OR IGNORE INTO branch_inventory (branch_id, product_id, stock, reorder_point, updated_at) SELECT 'main', id, stock, reorder_point, updated_at FROM products")
}

async function applyOperation(operation: Operation) {
  const db = await openMobileDatabase()
  const seen = await db.query('SELECT operation_id FROM sync_inbox WHERE operation_id = ?', [operation.operationId])
  if (seen.values?.length) return
  const payload = operation.payload
  if (operation.entityType === 'stocktake' && operation.action === 'approved') {
    const branchId = String(payload.branchId || 'main')
    await db.beginTransaction()
    try {
      for (const count of (payload.counts || []) as Array<Record<string, unknown>>) {
        const amount = Number(count.variance) || 0
        if (!amount) continue
        if (!(await db.query('SELECT id FROM products WHERE id = ?', [count.productId])).values?.length) throw new Error('A stocktake references a missing product.')
        await db.run('INSERT OR IGNORE INTO branch_inventory (branch_id, product_id, stock, reorder_point, updated_at) SELECT ?, id, 0, reorder_point, ? FROM products WHERE id = ?', [branchId, operation.createdAt, count.productId])
        await db.run('UPDATE branch_inventory SET stock = MAX(0, stock + ?), updated_at = ? WHERE branch_id = ? AND product_id = ?', [amount, operation.createdAt, branchId, count.productId])
        await db.run('INSERT INTO inventory_movements (id, product_id, quantity, reason, created_at, branch_id) VALUES (?, ?, ?, ?, ?, ?)', [id(), count.productId, amount, `Stocktake: ${payload.approvalReason || 'approved'}`, operation.createdAt, branchId])
      }
      await db.run('INSERT INTO sync_inbox (operation_id, received_at) VALUES (?, ?)', [operation.operationId, now()])
      await db.commitTransaction()
    } catch (error) { await db.rollbackTransaction(); throw error }
    return
  }
  if (operation.entityType === 'branch' && operation.action === 'upsert') {
    await db.run('INSERT INTO branches (id, name, address, is_default, is_active, assigned_user_ids, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, address=excluded.address, is_active=excluded.is_active, assigned_user_ids=excluded.assigned_user_ids, updated_at=excluded.updated_at', [payload.id, payload.name, payload.address || '', payload.isDefault ? 1 : 0, payload.isActive === false ? 0 : 1, JSON.stringify(Array.isArray(payload.assignedUserIds) ? payload.assignedUserIds : []), payload.createdAt || operation.createdAt, payload.updatedAt || operation.createdAt])
    await db.run('INSERT OR IGNORE INTO branch_inventory (branch_id, product_id, stock, reorder_point, updated_at) SELECT ?, id, 0, reorder_point, ? FROM products', [payload.id, operation.createdAt])
  } else if (operation.entityType === 'branch_transfer' && operation.action === 'create') {
    const exists = await db.query('SELECT id FROM inventory_movements WHERE id=?', [`${payload.id}:out`])
    if (!exists.values?.length) {
      const source = (await db.query('SELECT stock FROM branch_inventory WHERE branch_id=? AND product_id=?', [payload.fromBranchId, payload.productId])).values?.[0]
      if (!source || Number(source.stock) < Number(payload.quantity)) throw new Error('Transfer cannot sync because the source branch lacks sufficient stock.')
      await db.beginTransaction()
      try {
        await db.run('UPDATE branch_inventory SET stock=stock-?, updated_at=? WHERE branch_id=? AND product_id=?', [Number(payload.quantity), payload.createdAt || operation.createdAt, payload.fromBranchId, payload.productId])
        await db.run('INSERT INTO branch_inventory (branch_id,product_id,stock,reorder_point,updated_at) VALUES (?,?,?,0,?) ON CONFLICT(branch_id,product_id) DO UPDATE SET stock=branch_inventory.stock+excluded.stock, updated_at=excluded.updated_at', [payload.toBranchId, payload.productId, Number(payload.quantity), payload.createdAt || operation.createdAt])
        await db.run('INSERT OR IGNORE INTO inventory_movements (id,product_id,quantity,reason,created_at,branch_id) VALUES (?,?,?,?,?,?)', [`${payload.id}:out`, payload.productId, -Number(payload.quantity), `Transfer to ${payload.toBranchId}: ${payload.reason}`, payload.createdAt || operation.createdAt, payload.fromBranchId])
        await db.run('INSERT OR IGNORE INTO inventory_movements (id,product_id,quantity,reason,created_at,branch_id) VALUES (?,?,?,?,?,?)', [`${payload.id}:in`, payload.productId, Number(payload.quantity), `Transfer from ${payload.fromBranchId}: ${payload.reason}`, payload.createdAt || operation.createdAt, payload.toBranchId])
        await db.commitTransaction()
      } catch (caught) { await db.rollbackTransaction(); throw caught }
    }
  } else if (operation.entityType === 'product' && operation.action === 'upsert') {
    await db.run(`INSERT INTO products (id, name, sku, barcode, category, stock, reorder_point, price, cost_price, unit, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, sku=excluded.sku, barcode=excluded.barcode, category=excluded.category, reorder_point=excluded.reorder_point, price=excluded.price, cost_price=excluded.cost_price, unit=excluded.unit, updated_at=excluded.updated_at`,
    [payload.id, payload.name, payload.sku, payload.barcode || '', payload.category, Number(payload.stock) || 0, Number(payload.reorder) || 0, Number(payload.price) || 0, Number(payload.cost) || 0, payload.unit, payload.updated || operation.createdAt])
    await db.run("INSERT OR IGNORE INTO branch_inventory (branch_id, product_id, stock, reorder_point, updated_at) VALUES ('main', ?, ?, ?, ?)", [payload.id, Number(payload.stock) || 0, Number(payload.reorder) || 0, payload.updated || operation.createdAt])
  } else if (operation.entityType === 'stock' && operation.action === 'adjust') {
    const branchId = String(payload.branchId || 'main')
    await db.run("INSERT OR IGNORE INTO branches (id, name, address, is_default, created_at, updated_at) VALUES (?, ?, '', 0, ?, ?)", [branchId, branchId === 'main' ? 'Main branch' : 'Branch', operation.createdAt, operation.createdAt])
    await db.run('INSERT OR IGNORE INTO branch_inventory (branch_id, product_id, stock, reorder_point, updated_at) SELECT ?, id, 0, reorder_point, ? FROM products WHERE id = ?', [branchId, operation.createdAt, payload.productId])
    await db.run('UPDATE branch_inventory SET stock = MAX(0, stock + ?), updated_at = ? WHERE product_id = ? AND branch_id = ?', [Number(payload.amount) || 0, operation.createdAt, payload.productId, branchId])
  } else if (operation.entityType === 'sale' && operation.action === 'create') {
    const existing = await db.query('SELECT id FROM sales WHERE id = ?', [payload.id])
    if (!existing.values?.length) {
      if (payload.paymentMethod === 'wallet') await debitSaleWallet(db, payload)
      const branchId = String(payload.branchId || 'main')
      await db.run('INSERT INTO sales (id, total, payment_method, payment_reference, terminal_provider, staff_id, staff_name, created_at, cash_received, change_given, payment_details, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [payload.id, Number(payload.total), payload.paymentMethod || 'cash', payload.paymentReference || '', payload.terminalProvider || '', payload.staffId || '', payload.staffName || '', payload.createdAt || operation.createdAt, normalizeCashSale(payload).cashReceived, (payload.paymentDetails as { changeGiven?: unknown } | undefined)?.changeGiven ?? normalizeCashSale(payload).changeGiven, payload.paymentDetails ? JSON.stringify(payload.paymentDetails) : null, branchId])
      for (const item of Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : []) {
        const product = await db.query('SELECT name, cost_price AS cost FROM products WHERE id = ?', [item.productId])
        await db.run('INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?)', [id(), payload.id, item.productId, product.values?.[0]?.name || 'Product', Number(item.quantity), Number(item.price), Number(product.values?.[0]?.cost) || 0])
        await db.run('INSERT OR IGNORE INTO branch_inventory (branch_id, product_id, stock, reorder_point, updated_at) SELECT ?, id, 0, reorder_point, ? FROM products WHERE id = ?', [branchId, operation.createdAt, item.productId])
        await db.run('UPDATE branch_inventory SET stock = MAX(0, stock - ?) WHERE branch_id = ? AND product_id = ?', [Number(item.quantity), branchId, item.productId])
      }
    }
  } else if (operation.entityType === 'customer' && operation.action === 'upsert') {
    await db.run('INSERT INTO customers (id, name, phone, balance) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, phone=excluded.phone', [payload.id, payload.name, payload.phone || '', Number(payload.balance) || 0])
  } else if (operation.entityType === 'wallet' && operation.action === 'adjust') {
    const customer = await db.query('SELECT id FROM customers WHERE id = ?', [payload.customerId])
    if (customer.values?.length) {
      await db.run('UPDATE customers SET balance = ROUND(balance + ?, 2) WHERE id = ?', [Number(payload.amount) || 0, payload.customerId])
      await db.run('INSERT INTO wallet_transactions (id, customer_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)', [id(), payload.customerId, Number(payload.amount) || 0, payload.reason || 'remote-wallet', payload.createdAt || operation.createdAt])
    }
  } else if (operation.entityType === 'expense' && operation.action === 'create') {
    await db.run('INSERT OR IGNORE INTO expenses (id, category, description, amount, incurred_at, created_at, branch_id, staff_id, staff_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [payload.id, payload.category, payload.description, Number(payload.amount) || 0, payload.incurredAt || operation.createdAt, payload.createdAt || operation.createdAt, payload.branchId || 'main', payload.staffId || '', payload.staffName || ''])
  } else if (operation.entityType === 'settings' && operation.action === 'upsert') {
    if (payload.paymentPolicy !== undefined) await db.run('UPDATE app_settings SET payment_policy = ? WHERE id = 1', [JSON.stringify(paymentPolicy(payload.paymentPolicy))])
    await db.run('INSERT INTO app_settings (id, app_name, currency, pos_provider, pos_terminal_id, pos_connection, logo_data, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET app_name=excluded.app_name, currency=excluded.currency, pos_provider=excluded.pos_provider, pos_terminal_id=excluded.pos_terminal_id, pos_connection=excluded.pos_connection, logo_data=excluded.logo_data, updated_at=excluded.updated_at', [payload.appName || 'My Business', payload.currency || 'USD', payload.posProvider || '', payload.posTerminalId || '', payload.posConnection || 'manual', payload.logoData || '', payload.updatedAt || operation.createdAt])
  }
  await db.run('INSERT INTO sync_inbox (operation_id, received_at) VALUES (?, ?)', [operation.operationId, now()])
}

// Serialize network sync jobs so refresh and background downloads cannot
// apply the same operation in overlapping database transactions.
let syncTail: Promise<unknown> = Promise.resolve()
function serializeSync<T>(job: () => Promise<T>): Promise<T> {
  const next = syncTail.then(job, job)
  syncTail = next.catch(() => undefined)
  return next
}
function syncNow() { return serializeSync(syncNowImpl) }
function pullLatest(config?: MobileSyncConfiguration | null) { return serializeSync(() => pullLatestImpl(config)) }
async function syncNowImpl() {
  const config = await getMobileSyncConfiguration()
  if (!config) return { configured: false, pending: 0, lastError: 'This phone has not been enrolled.' }
  const db = await openMobileDatabase()
  try {
    while (true) {
    const pending = await db.query('SELECT operation_id AS operationId, entity_type AS entityType, entity_id AS entityId, action, payload, created_at AS createdAt FROM sync_outbox WHERE synced_at IS NULL ORDER BY created_at LIMIT 500')
    const operations: Operation[] = (pending.values || []).map((row) => ({ ...row, payload: JSON.parse(String(row.payload)) })) as Operation[]
    if (!operations.length) break
    {
      const response = await originalFetch(`${config.syncApiUrl}/v1/sync/push`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.deviceToken}` }, body: JSON.stringify({ businessId: config.businessId, deviceId: config.deviceId, operations }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Cloud push failed.')
      const acknowledged = [...(result.acceptedOperationIds || []), ...(result.conflicts || []).map((item: { operationId: string }) => item.operationId)].filter((operationId: string) => operations.some(operation => operation.operationId === operationId))
      if (!acknowledged.length) throw new Error('Cloud did not acknowledge any queued changes. Retry sync.')
      for (const operationId of acknowledged) await db.run('UPDATE sync_outbox SET synced_at = ? WHERE operation_id = ?', [now(), operationId])
    }
    }
    return await pullLatestImpl(config)
  } catch (caught) {
    const pending = await db.query('SELECT COUNT(*) AS count FROM sync_outbox WHERE synced_at IS NULL')
    return { configured: true, pending: Number(pending.values?.[0]?.count || 0), lastError: caught instanceof Error ? caught.message : 'Sync failed.' }
  }
}

// Pull-to-refresh uses this path. It never uploads this device's outbox; it
// only applies newer cloud changes to native SQLite.
async function pullLatestImpl(configInput?: MobileSyncConfiguration | null) {
  const config = configInput || await getMobileSyncConfiguration()
  if (!config) return { configured: false, pending: 0, lastError: 'This phone has not been enrolled.' }
  const db = await openMobileDatabase()
  try {
    let cursor = await setting('syncCursor')
    while (true) {
    const response = await originalFetch(`${config.syncApiUrl}/v1/sync/pull?businessId=${encodeURIComponent(config.businessId)}&deviceId=${encodeURIComponent(config.deviceId)}&cursor=${encodeURIComponent(cursor)}`, { headers: { Authorization: `Bearer ${config.deviceToken}` } })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Cloud pull failed.')
    for (const operation of result.operations || []) await applyOperation(operation)
    if (result.cursor) await setSetting('syncCursor', result.cursor)
    if ((result.operations || []).length < 500 || !result.cursor || result.cursor === cursor) break
    cursor = result.cursor
    }
    const pending = await db.query('SELECT COUNT(*) AS count FROM sync_outbox WHERE synced_at IS NULL')
    return { configured: true, pending: Number(pending.values?.[0]?.count || 0), conflicts: 0, lastError: '' }
  } catch (caught) {
    const pending = await db.query('SELECT COUNT(*) AS count FROM sync_outbox WHERE synced_at IS NULL')
    return { configured: true, pending: Number(pending.values?.[0]?.count || 0), lastError: caught instanceof Error ? caught.message : 'Cloud refresh failed.' }
  }
}

async function hydrateBusinessSettings(config?: MobileSyncConfiguration | null) {
  const db = await openMobileDatabase()
  const current = (await db.query('SELECT app_name AS appName, currency, pos_provider AS posProvider, pos_terminal_id AS posTerminalId, pos_connection AS posConnection, logo_data AS logoData, payment_policy AS paymentPolicy, updated_at AS updatedAt FROM app_settings WHERE id = 1')).values?.[0]
  // Native startup is local-first too. The default local row is still usable
  // offline; a cloud refresh must not delay identity or screen restoration.
  if (current?.appName && current?.currency) return current
  if (config) {
    await pullLatest(config)
    const synced = (await db.query('SELECT app_name AS appName, currency, pos_provider AS posProvider, pos_terminal_id AS posTerminalId, pos_connection AS posConnection, logo_data AS logoData, payment_policy AS paymentPolicy, updated_at AS updatedAt FROM app_settings WHERE id = 1')).values?.[0]
    if (synced?.appName && synced?.currency && !(synced.appName === 'My Business' && synced.currency === 'USD')) return synced
    // Recover settings even when a local repair retained the sync cursor.
    const response = await originalFetch(`${config.syncApiUrl}/v1/business/settings?businessId=${encodeURIComponent(config.businessId)}`, { headers: { Authorization: `Bearer ${config.deviceToken}` } })
    const remote = await response.json().catch(() => ({}))
    if (response.ok && remote.settings?.appName && remote.settings?.currency) {
      const settings = remote.settings
      await db.run('INSERT INTO app_settings (id, app_name, currency, pos_provider, pos_terminal_id, pos_connection, logo_data, payment_policy, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET app_name=excluded.app_name, currency=excluded.currency, pos_provider=excluded.pos_provider, pos_terminal_id=excluded.pos_terminal_id, pos_connection=excluded.pos_connection, logo_data=excluded.logo_data, payment_policy=excluded.payment_policy, updated_at=excluded.updated_at', [settings.appName, settings.currency, settings.posProvider || '', settings.posTerminalId || '', settings.posConnection || 'manual', settings.logoData || '', JSON.stringify(paymentPolicy(settings.paymentPolicy)), settings.updatedAt || now()])
      return { ...settings, paymentPolicy: JSON.stringify(paymentPolicy(settings.paymentPolicy)) }
    }
    if (synced?.appName && synced?.currency) return synced
  }
  return current || { appName: 'My Business', currency: 'USD', posProvider: '', posTerminalId: '', posConnection: 'manual', logoData: '', updatedAt: now() }
}

async function localSyncStatus() {
  const config = await getMobileSyncConfiguration()
  const db = await openMobileDatabase()
  const pending = await db.query('SELECT COUNT(*) AS count FROM sync_outbox WHERE synced_at IS NULL')
  return { configured: Boolean(config), pending: Number(pending.values?.[0]?.count || 0), conflicts: 0, lastError: config ? '' : 'This phone has not been enrolled.' }
}

async function cloudRequest(path: string, init: RequestInit = {}) {
  const config = await getMobileSyncConfiguration()
  const token = await setting('cloudAccessToken')
  if (!config) throw new Error('Connect this phone to a business before managing staff.')
  return requestCloud(config.syncApiUrl, path, init, (accessToken, refreshToken) => {
    void Promise.all([setSetting('cloudAccessToken', accessToken), setSetting('cloudRefreshToken', refreshToken)])
  }, token)
}
async function cachedStaff(db: Awaited<ReturnType<typeof openMobileDatabase>>) {
  const rows = (await db.query('SELECT id, name, email, username, role, operational_access AS operationalAccess, created_at AS createdAt FROM users ORDER BY created_at ASC')).values || []
  return rows.map(account => ({ ...account, operationalAccess: Boolean(account.operationalAccess) }))
}

function reportWindow(sales: Array<Record<string, unknown>>, since: number) {
  const selected = sales.filter((sale) => new Date(String(sale.createdAt)).getTime() >= since)
  return { total: selected.reduce((sum, sale) => sum + Number(sale.total || 0), 0), count: selected.length }
}

async function handle(path: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase()
  if (path === '/api/auth/register-business' && method === 'POST') {
    if (await getMobileSyncConfiguration() || await sessionUser()) return error('This device already belongs to a business. Sign in to continue.', 409)
    return originalFetch(`${cloudUrl}/v1/business-registration`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: init?.body, signal: AbortSignal.timeout(20000) })
  }
  if (path === '/api/auth/registration-key' && method === 'POST') {
    if (await getMobileSyncConfiguration() || await sessionUser()) return error('This device already belongs to a business. Sign in to continue.', 409)
    return originalFetch(`${cloudUrl}/v1/public/registration-keys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: init?.body, signal: AbortSignal.timeout(20000) })
  }
  if (['/api/auth/password-reset/request', '/api/auth/password-reset/confirm'].includes(path) && method === 'POST') {
    return originalFetch(`${cloudUrl}${path.replace('/api/', '/v1/')}`, { method, signal: AbortSignal.timeout(30_000), headers: { 'Content-Type': 'application/json' }, body: init?.body })
  }
  // Logout must also clear stale sessions whose user record no longer exists.
  // Device enrollment lives in separate settings and is preserved.
  if (path === '/api/auth/logout' && method === 'POST') {
    await setSetting('sessionUserId', '')
    await setSetting('cloudAccessToken', '')
    await setSetting('cloudRefreshToken', '')
    return json({})
  }
  if (path === '/api/users' || path.startsWith('/api/users/')) {
    const suppliedToken = new Headers(init?.headers).get('Authorization')?.replace(/^Bearer\s+/i, '') || ''
    if (!suppliedToken || suppliedToken !== localStorage.getItem('stockroom-token')) return error('Your app session expired. Sign in again to manage the team.', 401)
  }
  const user = await sessionUser() || await restoreSavedSession() || await restoreCloudSession()
  const db = await openMobileDatabase()
  if (user) await ensureBranches(db)
  if (path === '/api/health') return json({ ok: true, storage: 'Native SQLite' })
  if (path === '/api/settings' && method === 'GET') {
    const config = await getMobileSyncConfiguration()
    const row = await hydrateBusinessSettings(config)
    return json({ ...row, paymentPolicy: paymentPolicy(row?.paymentPolicy), ownerConfigured: Boolean((await db.query('SELECT id FROM users LIMIT 1')).values?.length), cloudConfigured: Boolean(config), existingBusiness: Boolean(config) })
  }
  if (path === '/api/installer/activate' && method === 'POST') {
    const input = await body(init)
    if (input.mode !== 'existing') return error('Mobile devices must join an existing business using an owner account.')
    const cloud = 'https://stockroom-0vm5.onrender.com'
    const login = await originalFetch(`${cloud}/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: input.ownerEmail, password: input.ownerPassword }) })
    const account = await login.json(); if (!login.ok || account.account?.role !== 'owner') return error(account.error || 'Only a business owner can enroll this phone.')
    const enrolled = await originalFetch(`${cloud}/v1/devices/enroll`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.accessToken}` }, body: JSON.stringify({ deviceId: await mobileDeviceId(), label: input.label }) })
    const device = await enrolled.json(); if (!enrolled.ok) return error(device.error || 'Could not enroll this phone.')
    await saveMobileSyncConfiguration({ syncApiUrl: cloud, businessId: device.businessId, deviceId: device.deviceId, deviceToken: device.deviceToken })
    return json({ configured: true, existingBusiness: true }, 201)
  }
  if (path === '/api/auth/cloud-session' && method === 'POST') {
    const input = await body(init); const config = await getMobileSyncConfiguration(); if (!config) return error('Enroll this phone before signing in.', 400)
    const identifier = String(input.identifier || input.email || '').trim()
    const response = await originalFetch(`${config.syncApiUrl}/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(identifier.includes('@') ? { email: identifier, password: input.password } : { username: identifier, password: input.password, businessId: config.businessId }) })
    const result = await response.json(); if (!response.ok) return error(result.error || 'Email or password is incorrect.', response.status)
    const account = result.account; if (account.businessId !== config.businessId) return error('This account belongs to a different business.', 403); const localId = account.id || id(); const localUser: MobileUser = { id: localId, name: account.name, email: account.email || `${localId}@staff.local.invalid`, username: account.username || '', role: account.role, operationalAccess: Boolean(account.operationalAccess), organizationId: config.businessId }
    await db.run('INSERT INTO users (id, name, email, username, role, operational_access, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, email=excluded.email, username=excluded.username, role=excluded.role, operational_access=excluded.operational_access', [localUser.id, localUser.name, localUser.email, localUser.username || '', localUser.role, localUser.operationalAccess ? 1 : 0, now()])
    const stored = (await db.query('SELECT id, name, email, username, role, operational_access AS operationalAccess FROM users WHERE id = ?', [localUser.id])).values?.[0]
    await setSetting('sessionUserId', String(stored.id))
    await setSetting('cloudAccessToken', String(result.accessToken))
    await setSetting('cloudRefreshToken', String(result.refreshToken || ''))
    await pullLatest(config)
    const initialized = await hydrateBusinessSettings(config)
    await db.run('INSERT INTO app_settings (id, app_name, currency, pos_provider, pos_terminal_id, pos_connection, logo_data, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET app_name=excluded.app_name, currency=excluded.currency, pos_provider=excluded.pos_provider, pos_terminal_id=excluded.pos_terminal_id, pos_connection=excluded.pos_connection, logo_data=excluded.logo_data, updated_at=excluded.updated_at', [initialized.appName || 'My Business', initialized.currency || 'USD', initialized.posProvider || '', initialized.posTerminalId || '', initialized.posConnection || 'manual', initialized.logoData || '', initialized.updatedAt || now()])
    return json({ token: id(), user: { ...stored, operationalAccess: Boolean(stored.operationalAccess), organizationId: config.businessId }, cloudAccessToken: result.accessToken, refreshToken: result.refreshToken })
  }
  if (!user) return error('Authentication required.', 401)
  const requestedBranchId = new Headers(init?.headers).get('X-Stockroom-Branch') || 'main'
  const allBranches = (await db.query('SELECT id, name, address, is_default AS isDefault, is_active AS isActive, assigned_user_ids AS assignedUserIds, created_at AS createdAt, updated_at AS updatedAt FROM branches ORDER BY is_default DESC, name')).values || []
  const permittedBranches = allBranches.filter(branch => user.role === 'owner' || !(JSON.parse(String(branch.assignedUserIds || '[]') || '[]') as string[]).length || (JSON.parse(String(branch.assignedUserIds || '[]') || '[]') as string[]).includes(user.id))
  if (user.role !== 'owner' && !permittedBranches.some(branch => Number(branch.isActive))) return error('No active shop branch is assigned to this account.', 403)
  const branchId = (permittedBranches.find(branch => branch.id === requestedBranchId && Number(branch.isActive)) || permittedBranches.find(branch => Number(branch.isActive)))?.id || 'main'
  if (path === '/api/branches' && method === 'GET') return json({ branches: permittedBranches })
  if (path === '/api/branches' && method === 'POST') {
    if (user.role !== 'owner') return error('Owner access required.', 403)
    const input = await body(init); const name = String(input.name || '').trim().slice(0, 100); const address = String(input.address || '').trim().slice(0, 250)
    if (name.length < 2) return error('Branch name must contain at least 2 characters.')
    if ((await db.query('SELECT id FROM branches WHERE lower(name)=lower(?)', [name])).values?.length) return error('A branch with that name already exists.')
    const branch = { id: id(), name, address, isDefault: false, isActive: true, assignedUserIds: [], createdAt: now(), updatedAt: now() }
    await db.run('INSERT INTO branches (id, name, address, is_default, is_active, assigned_user_ids, created_at, updated_at) VALUES (?, ?, ?, 0, 1, ?, ?, ?)', [branch.id, name, address, '[]', branch.createdAt, branch.updatedAt]); await db.run('INSERT OR IGNORE INTO branch_inventory (branch_id, product_id, stock, reorder_point, updated_at) SELECT ?, id, 0, reorder_point, ? FROM products', [branch.id, branch.createdAt]); await queue('branch', branch.id, 'upsert', branch)
    return json(branch, 201)
  }
  const branchPath = path.match(/^\/api\/branches\/([^/]+)$/)
  if (branchPath && method === 'PUT') {
    if (user.role !== 'owner') return error('Owner access required.', 403)
    const input = await body(init), branchId = decodeURIComponent(branchPath[1]), current = (await db.query('SELECT id, is_default AS isDefault, created_at AS createdAt, assigned_user_ids AS assignedUserIds FROM branches WHERE id = ?', [branchId])).values?.[0]
    if (!current) return error('Branch not found.', 404)
    const name = String(input.name || '').trim().slice(0, 100), address = String(input.address || '').trim().slice(0, 250), isActive = input.isActive !== false
    if (name.length < 2) return error('Branch name must contain at least 2 characters.')
    if (!isActive && Number(current.isDefault)) return error('The Main branch cannot be deactivated.')
    if (!isActive && Number((await db.query('SELECT COUNT(*) AS count FROM branches WHERE is_active=1')).values?.[0]?.count) <= 1) return error('Keep at least one active branch.')
    if ((await db.query('SELECT id FROM branches WHERE lower(name)=lower(?) AND id<>?', [name, branchId])).values?.length) return error('A branch with that name already exists.')
    const assignedUserIds = Array.isArray(input.assignedUserIds) ? [...new Set(input.assignedUserIds.map(String))] : JSON.parse(String(current.assignedUserIds || '[]'))
    const branch = { id: branchId, name, address, isDefault: Boolean(current.isDefault), isActive, assignedUserIds, createdAt: String(current.createdAt), updatedAt: now() }
    await db.run('UPDATE branches SET name=?, address=?, is_active=?, assigned_user_ids=?, updated_at=? WHERE id=?', [name, address, isActive ? 1 : 0, JSON.stringify(assignedUserIds), branch.updatedAt, branchId]); await queue('branch', branch.id, 'upsert', branch)
    return json(branch)
  }
  if (path === '/api/branch-transfers' && method === 'POST') {
    if (!(user.role === 'owner' || user.role === 'admin' || user.operationalAccess)) return error('Inventory access required.', 403)
    const input = await body(init), fromBranchId = String(input.fromBranchId || ''), toBranchId = String(input.toBranchId || ''), productId = String(input.productId || ''), quantity = Number(input.quantity), reason = String(input.reason || '').trim().slice(0, 250)
    if (fromBranchId !== branchId) return error('Select the source branch before transferring stock.')
    if (!permittedBranches.some(branch => branch.id === toBranchId && Number(branch.isActive))) return error('You do not have access to the destination branch.', 403)
    if (!fromBranchId || !toBranchId || fromBranchId === toBranchId || !Number.isSafeInteger(quantity) || quantity < 1 || reason.length < 3) return error('Choose two different branches, a whole quantity, and a reason.')
    if (Number((await db.query('SELECT COUNT(*) AS count FROM branches WHERE id IN (?, ?) AND is_active=1', [fromBranchId, toBranchId])).values?.[0]?.count) !== 2) return error('Both branches must be active.')
    const source = (await db.query('SELECT stock FROM branch_inventory WHERE branch_id=? AND product_id=?', [fromBranchId, productId])).values?.[0]
    if (!source || Number(source.stock) < quantity) return error('The source branch does not have enough stock.')
    const transfer = { id: id(), fromBranchId, toBranchId, productId, quantity, reason, createdAt: now() }
    await db.beginTransaction()
    try {
      await db.run('UPDATE branch_inventory SET stock=stock-?, updated_at=? WHERE branch_id=? AND product_id=?', [quantity, transfer.createdAt, fromBranchId, productId])
      await db.run('INSERT INTO branch_inventory (branch_id,product_id,stock,reorder_point,updated_at) VALUES (?,?,?,0,?) ON CONFLICT(branch_id,product_id) DO UPDATE SET stock=branch_inventory.stock+excluded.stock, updated_at=excluded.updated_at', [toBranchId, productId, quantity, transfer.createdAt])
      await db.run('INSERT INTO inventory_movements (id,product_id,quantity,reason,created_at,branch_id) VALUES (?,?,?,?,?,?)', [`${transfer.id}:out`, productId, -quantity, `Transfer to ${toBranchId}: ${reason}`, transfer.createdAt, fromBranchId])
      await db.run('INSERT INTO inventory_movements (id,product_id,quantity,reason,created_at,branch_id) VALUES (?,?,?,?,?,?)', [`${transfer.id}:in`, productId, quantity, `Transfer from ${fromBranchId}: ${reason}`, transfer.createdAt, toBranchId])
      await queue('branch_transfer', transfer.id, 'create', transfer)
      await db.commitTransaction()
    } catch (caught) { await db.rollbackTransaction(); return error(caught instanceof Error ? caught.message : 'Could not transfer stock.') }
    return json(transfer, 201)
  }
  if (path === '/api/auth/session' && method === 'GET') {
    const token = new Headers(init?.headers).get('Authorization')?.replace(/^Bearer\s+/i, '') || id()
    return json({ user, token })
  }
  const stocktakeResponse = await mobileStocktake(path, init, canOperate(user), queue)
  if (stocktakeResponse) return stocktakeResponse
  if (path === '/api/sync/status') return json(await localSyncStatus())
  if (path === '/api/subscriptions/access') {
    if (!await sessionUser()) return error('Authentication required.', 401)
    return json(await subscriptionStatus(new Headers(init?.headers).get('X-Subscription-Refresh') === 'true'))
  }
  if (path === '/api/sync/pull' && method === 'POST') return json(await pullLatest())
  if (path === '/api/sync/now' && method === 'POST') return json(await syncNow())
  if (path === '/api/products' && method === 'GET') return json({ products: (await db.query('SELECT p.id, p.name, p.sku, p.barcode, p.category, COALESCE(i.stock, 0) AS stock, COALESCE(i.reorder_point, p.reorder_point) AS reorder, p.price, p.cost_price AS cost, p.unit, p.updated_at AS updated FROM products p LEFT JOIN branch_inventory i ON i.product_id = p.id AND i.branch_id = ? ORDER BY p.updated_at DESC', [branchId])).values || [] })
  if (path === '/api/products/export' && method === 'GET') {
    if (user.role !== 'owner') return error('Owner access required.', 403)
    try {
      const response = await cloudRequest('/v1/subscriptions/business-exit')
      const status = await response.json() as { feeAmount?: number; paid?: boolean; closed?: boolean }
      if (!response.ok || status.closed || (Number(status.feeAmount) > 0 && !status.paid)) return error('Complete the one-time product export payment before downloading.', 402)
    } catch { return error('Could not verify product export eligibility with Stockroom cloud.', 503) }
    const rows = (await db.query('SELECT p.name, p.sku, p.barcode, p.category, p.cost_price AS cost, p.price, p.unit, b.name AS branch, COALESCE(i.stock,0) AS stock, COALESCE(i.reorder_point,p.reorder_point) AS reorder FROM products p CROSS JOIN branches b LEFT JOIN branch_inventory i ON i.product_id=p.id AND i.branch_id=b.id ORDER BY p.name,b.is_default DESC,b.name')).values || []
    const cell = (value: unknown) => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`
    const csv = [['Product','SKU','Barcode','Category','Cost price','Selling price','Unit','Branch','Stock','Reorder point'], ...rows.map(row => [row.name,row.sku,row.barcode,row.category,row.cost,row.price,row.unit,row.branch,row.stock,row.reorder])].map(row => row.map(cell).join(',')).join('\r\n')
    return new Response(csv, { headers: { 'Content-Type': 'text/csv;charset=utf-8', 'Content-Disposition': 'attachment; filename="stockroom-products.csv"' } })
  }
  if (path === '/api/products' && method === 'POST') {
    if (!canOperate(user)) return error('Operational access is required.', 403)
    const input = await body(init); const name = String(input.name || '').trim(); const product = { id: id(), name, sku: String(input.sku || '').trim() || `${name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 24).toUpperCase() || 'PRODUCT'}-${crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`, barcode: String(input.barcode || '').trim(), category: String(input.category || '').trim(), stock: Number(input.stock), reorder: Number(input.reorder), price: Number(input.price), cost: Number(input.cost || 0), unit: String(input.unit || '').trim(), updated: now() }
    if (!product.name || !product.sku || !product.category || !product.unit || [product.stock, product.reorder, product.price, product.cost].some((value) => !Number.isFinite(value) || value < 0)) return error('Product fields are invalid.')
    await db.run('INSERT INTO products (id, name, sku, barcode, category, stock, reorder_point, price, cost_price, unit, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)', [product.id, product.name, product.sku, product.barcode, product.category, product.reorder, product.price, product.cost, product.unit, product.updated])
    await db.run('INSERT INTO branch_inventory (branch_id, product_id, stock, reorder_point, updated_at) VALUES (?, ?, ?, ?, ?)', [branchId, product.id, product.stock, product.reorder, product.updated])
    await queue('product', product.id, 'upsert', { ...product, stock: 0 }); if (product.stock) await queue('stock', product.id, 'adjust', { productId: product.id, branchId, amount: product.stock, reason: 'initial-stock', updatedAt: product.updated })
    return json(product, 201)
  }
  const stock = path.match(/^\/api\/products\/([^/]+)\/stock$/)
  if (stock && method === 'POST') {
    if (!canOperate(user)) return error('Operational access is required.', 403)
    const input = await body(init); const amount = Number(input.amount); if (!Number.isInteger(amount) || amount === 0) return error('Stock amount must be a non-zero integer.')
    const product = (await db.query('SELECT stock FROM branch_inventory WHERE product_id = ? AND branch_id = ?', [stock[1], branchId])).values?.[0]; if (!product || Number(product.stock) + amount < 0) return error('Stock cannot be negative.')
    const updated = now(); await db.run('UPDATE branch_inventory SET stock = stock + ?, updated_at = ? WHERE product_id = ? AND branch_id = ?', [amount, updated, stock[1], branchId]); await db.run('INSERT INTO inventory_movements (id, product_id, quantity, reason, created_at, branch_id) VALUES (?, ?, ?, ?, ?, ?)', [id(), stock[1], amount, 'manual-adjustment', updated, branchId]); await queue('stock', stock[1], 'adjust', { productId: stock[1], branchId, amount, reason: 'manual-adjustment', updatedAt: updated })
    return json((await db.query('SELECT p.id, p.name, p.sku, p.category, i.stock, i.reorder_point AS reorder, p.price, p.cost_price AS cost, p.unit, p.updated_at AS updated FROM products p JOIN branch_inventory i ON i.product_id=p.id WHERE p.id = ? AND i.branch_id = ?', [stock[1], branchId])).values?.[0])
  }
  if (path === '/api/sales' && method === 'POST') {
    const subscription = await subscriptionStatus()
    if (subscription.blocked) return error(subscription.reason, 402)
    let sale = await body(init); sale.branchId = branchId; if (sale.paymentMethod === 'wallet' && (sale.paymentDetails as { creditApproved?: boolean } | undefined)?.creditApproved && user.role !== 'owner') return error('Only the owner may approve credit purchases.', 403); try { sale = sale.paymentDetails ? recordPayment(sale, (await db.query('SELECT payment_policy FROM app_settings WHERE id = 1')).values?.[0]?.payment_policy) : normalizeCashSale(sale) } catch (caught) { return error(caught instanceof Error ? caught.message : 'Invalid cash amount.') }; if (!sale.id || !Array.isArray(sale.items) || !Number.isFinite(Number(sale.total))) return error('Sale is invalid.')
    if (sale.paymentMethod === 'wallet' && !(sale.paymentDetails as { customerId?: unknown } | undefined)?.customerId) return error('Select the customer wallet.')
    if ((await db.query('SELECT id FROM sales WHERE id = ?', [sale.id])).values?.length) return json({ ...sale, syncStatus: 'synced' })
    await db.beginTransaction(); try { if (sale.paymentMethod === 'wallet') await debitSaleWallet(db, sale); await db.run('INSERT INTO sales (id, total, payment_method, payment_reference, terminal_provider, staff_id, staff_name, created_at, cash_received, change_given, payment_details, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [sale.id, Number(sale.total), sale.paymentMethod || 'cash', sale.paymentReference || '', sale.terminalProvider || '', user.id, user.name, sale.createdAt || now(), sale.cashReceived ?? null, sale.changeGiven ?? null, sale.paymentDetails ? JSON.stringify(sale.paymentDetails) : null, branchId]); for (const item of sale.items as Array<Record<string, unknown>>) { const product = (await db.query('SELECT p.name, i.stock, p.cost_price AS cost FROM products p JOIN branch_inventory i ON i.product_id=p.id WHERE p.id = ? AND i.branch_id = ?', [item.productId, branchId])).values?.[0]; if (!product || Number(product.stock) < Number(item.quantity)) throw new Error('Insufficient stock for sale.'); await db.run('UPDATE branch_inventory SET stock = stock - ? WHERE product_id = ? AND branch_id = ?', [Number(item.quantity), item.productId, branchId]); await db.run('INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?)', [id(), sale.id, item.productId, product.name, Number(item.quantity), Number(item.price), Number(product.cost) || 0]) } await db.commitTransaction() } catch (caught) { await db.rollbackTransaction(); return error(caught instanceof Error ? caught.message : 'Could not save sale.') }
    const payload = { ...sale, staffId: user.id, staffName: user.name }; await queue('sale', String(sale.id), 'create', payload); return json({ ...payload, syncStatus: 'synced' }, 201)
  }
  if (path === '/api/sales' && method === 'GET') {
    if (!canOperate(user)) return error('Operational access is required.', 403)
    const sales = (await db.query('SELECT id, total, payment_method AS paymentMethod, payment_reference AS paymentReference, terminal_provider AS terminalProvider, cash_received AS cashReceived, change_given AS changeGiven, payment_details AS paymentDetails, staff_name AS staffName, created_at AS createdAt FROM sales WHERE branch_id = ? ORDER BY created_at DESC', [branchId])).values || []
    for (const sale of sales) sale.paymentDetails = sale.paymentDetails ? JSON.parse(String(sale.paymentDetails)) : undefined
    for (const sale of sales) sale.items = (await db.query('SELECT product_id AS productId, product_name AS productName, quantity, unit_price AS unitPrice FROM sale_items WHERE sale_id = ?', [sale.id])).values || []
    return json({ sales })
  }
  if (path === '/api/movements' && method === 'GET') {
    if (!canOperate(user)) return error('Operational access is required.', 403)
    return json({ movements: (await db.query('SELECT m.id, p.name AS productName, p.sku, m.quantity, m.reason, m.created_at AS createdAt FROM inventory_movements m JOIN products p ON p.id = m.product_id WHERE m.branch_id = ? ORDER BY m.created_at DESC', [branchId])).values || [] })
  }
  if (path === '/api/customers' && method === 'GET') {
    if (!canOperate(user)) return error('Operational access is required.', 403)
    const customers = (await db.query('SELECT id, name, phone, balance FROM customers ORDER BY name')).values || []
    return json({ customers: await Promise.all(customers.map(async customer => ({ ...customer, transactions: (await db.query('SELECT id, amount, reason, created_at AS createdAt FROM wallet_transactions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50', [customer.id])).values || [] }))) })
  }
  if (path === '/api/customers' && method === 'POST') {
    if (!canOperate(user)) return error('Operational access is required.', 403)
    const input = await body(init); const customer = { id: id(), name: String(input.name || '').trim(), phone: String(input.phone || '').trim(), balance: 0 }
    if (!customer.name || customer.name.length > 100) return error('Customer name is required and must be 100 characters or less.')
    await db.run('INSERT INTO customers (id, name, phone, balance) VALUES (?, ?, ?, ?)', [customer.id, customer.name, customer.phone, 0]); await queue('customer', customer.id, 'upsert', customer)
    return json(customer, 201)
  }
  const wallet = path.match(/^\/api\/customers\/([^/]+)\/wallet$/)
  if (wallet && method === 'POST') {
    if (!canOperate(user)) return error('Operational access is required.', 403)
    const input = await body(init); const amount = Number(input.amount); if (!Number.isSafeInteger(Math.round(amount * 100)) || amount === 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) return error('Enter a non-zero amount with at most two decimals.')
    const customer = (await db.query('SELECT id, name, phone, balance FROM customers WHERE id = ?', [wallet[1]])).values?.[0]; if (!customer || (amount < 0 && Number(customer.balance) + amount < 0)) return error('Customer wallet cannot be negative.')
    const createdAt = now()
    await db.beginTransaction()
    try {
      await db.run('UPDATE customers SET balance = ROUND(balance + ?, 2) WHERE id = ?', [amount, wallet[1]])
      await db.run('INSERT INTO wallet_transactions (id, customer_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)', [id(), wallet[1], amount, String(input.reason || 'manual-adjustment'), createdAt])
      await db.commitTransaction()
    } catch (caught) { await db.rollbackTransaction(); return error(caught instanceof Error ? caught.message : 'Wallet adjustment failed.') }
    await queue('wallet', wallet[1], 'adjust', { customerId: wallet[1], amount, reason: String(input.reason || 'manual-adjustment'), createdAt })
    return json({ ...customer, balance: Number(customer.balance) + amount })
  }
  if (path === '/api/expenses' && method === 'GET') {
    if (!isManager(user)) return error('Owner or admin access required.', 403)
    return json({ expenses: (await db.query('SELECT id, category, description, amount, incurred_at AS incurredAt, created_at AS createdAt, staff_id AS staffId, staff_name AS staffName FROM expenses WHERE branch_id = ? ORDER BY incurred_at DESC', [branchId])).values || [] })
  }
  if (path === '/api/expenses' && method === 'POST') {
    if (!isManager(user)) return error('Owner or admin access required.', 403)
    const input = await body(init); const expense = { id: id(), category: String(input.category || '').trim(), description: String(input.description || '').trim(), amount: Number(input.amount), incurredAt: String(input.incurredAt || now()), createdAt: now(), branchId, staffId: user.id, staffName: user.name }
    if (!expense.category || !expense.description || !Number.isFinite(expense.amount) || expense.amount <= 0) return error('Expense category, description, and a positive amount are required.')
    await db.run('INSERT INTO expenses (id, category, description, amount, incurred_at, created_at, branch_id, staff_id, staff_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [expense.id, expense.category, expense.description, expense.amount, expense.incurredAt, expense.createdAt, branchId, expense.staffId, expense.staffName]); await queue('expense', expense.id, 'create', expense); return json(expense, 201)
  }
  if (path === '/api/staff/activity' && method === 'GET') {
    if (!isManager(user)) return error('Owner or admin access required.', 403)
    const headers = new Headers(init?.headers), from = headers.get('X-Activity-From') || '', to = headers.get('X-Activity-To') || ''
    if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(from) >= Date.parse(to)) return error('A valid start and end date are required.')
    return json(await collectStaffActivity(db, branchId, new Date(from).toISOString(), new Date(to).toISOString()))
  }
  if (path === '/api/reports' && method === 'GET') {
    if (!isManager(user)) return error('Owner or admin access required.', 403)
    const sales = (await db.query('SELECT total, created_at AS createdAt FROM sales WHERE branch_id = ?', [branchId])).values || []; const items = (await db.query('SELECT si.quantity, si.unit_price AS unitPrice, si.unit_cost AS unitCost FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.branch_id = ?', [branchId])).values || []; const products = (await db.query('SELECT COALESCE(i.stock,0) AS stock, COALESCE(i.reorder_point,p.reorder_point) AS reorder, p.price FROM products p LEFT JOIN branch_inventory i ON i.product_id=p.id AND i.branch_id=?', [branchId])).values || []; const expenses = (await db.query('SELECT amount FROM expenses WHERE branch_id = ?', [branchId])).values || []
    const today = new Date(); today.setHours(0, 0, 0, 0); const week = new Date(today); week.setDate(today.getDate() - 6); const month = new Date(today.getFullYear(), today.getMonth(), 1)
    const revenue = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0); const cost = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0), 0); const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
    return json({ daily: reportWindow(sales, today.getTime()), weekly: reportWindow(sales, week.getTime()), monthly: reportWindow(sales, month.getTime()), inventory: { value: products.reduce((sum, product) => sum + Number(product.stock || 0) * Number(product.price || 0), 0), products: products.length, lowStock: products.filter((product) => Number(product.stock) <= Number(product.reorder)).length }, profit: { revenue, cost, expenses: expenseTotal, amount: revenue - cost - expenseTotal } })
  }
  if (path === '/api/users' && method === 'GET') {
    if (user.role !== 'owner') return error('Owner access required.', 403)
    try { const result = await cloudRequest('/v1/staff'); for (const account of result.users || []) await db.run('INSERT INTO users (id, name, email, username, role, operational_access, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, email=excluded.email, username=excluded.username, role=excluded.role, operational_access=excluded.operational_access', [account.id, account.name, account.email || `${account.id}@staff.local.invalid`, account.username || '', account.role, account.operationalAccess ? 1 : 0, String(account.createdAt || now())]); return json({ users: await cachedStaff(db), refreshed: true }) } catch (caught) { return json({ users: await cachedStaff(db), refreshed: false, refreshError: caught instanceof Error ? caught.message : 'Could not refresh team accounts.' }) }
  }
  if (path === '/api/users' && method === 'POST') {
    if (user.role !== 'owner') return error('Owner access required.', 403)
    try { const input = await body(init); const result = await cloudRequest('/v1/staff', { method: 'POST', body: JSON.stringify(input) }); const account = result.account; await db.run('INSERT INTO users (id, name, email, username, role, operational_access, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, email=excluded.email, username=excluded.username, role=excluded.role, operational_access=excluded.operational_access', [account.id, account.name, account.email || `${account.id}@staff.local.invalid`, account.username || '', account.role, account.operationalAccess ? 1 : 0, now()]); return json(account, 201) } catch (caught) { return error(caught instanceof Error ? caught.message : 'Could not create staff.', 400) }
  }
  const staffAccess = path.match(/^\/api\/users\/([^/]+)\/operational-access$/)
  if (staffAccess && method === 'PUT') {
    if (user.role !== 'owner') return error('Owner access required.', 403)
    try { const input = await body(init); const result = await cloudRequest(`/v1/staff/${encodeURIComponent(staffAccess[1])}/operational-access`, { method: 'PUT', body: JSON.stringify({ enabled: input.enabled === true, ownerPassword: input.ownerPassword }) }); const account = result.account; await db.run('UPDATE users SET operational_access = ? WHERE id = ?', [account.operationalAccess ? 1 : 0, account.id]); return json(account) } catch (caught) { return error(caught instanceof Error ? caught.message : 'Could not update cashier access.', 400) }
  }
  const staffRole = path.match(/^\/api\/users\/([^/]+)\/role$/)
  if (staffRole && method === 'PUT') {
    if (user.role !== 'owner') return error('Owner access required.', 403)
    try { const input = await body(init); const result = await cloudRequest(`/v1/staff/${encodeURIComponent(staffRole[1])}/role`, { method: 'PUT', body: JSON.stringify({ role: input.role, operationalAccess: input.operationalAccess === true, ownerPassword: input.ownerPassword }) }); const account = result.account; await db.run('UPDATE users SET role = ?, operational_access = ? WHERE id = ?', [account.role, account.operationalAccess ? 1 : 0, account.id]); return json(account) } catch (caught) { return error(caught instanceof Error ? caught.message : 'Could not update staff role.', 400) }
  }
  const staffPassword = path.match(/^\/api\/users\/([^/]+)\/password$/)
  if (staffPassword && method === 'PUT') {
    if (user.role !== 'owner') return error('Only the owner can reset staff passwords.', 403)
    try { const input = await body(init); const result = await cloudRequest(`/v1/staff/${encodeURIComponent(staffPassword[1])}/password`, { method: 'PUT', body: JSON.stringify({ password: input.password }) }); return json(result.account) } catch (caught) { return error(caught instanceof Error ? caught.message : 'Could not reset staff password.', 400) }
  }
  if (path === '/api/settings' && method === 'PUT') {
    if (user.role !== 'owner') return error('Only the owner can change business settings.', 403)
    const input = await body(init); const appName = String(input.appName || '').trim(); const currency = String(input.currency || '').toUpperCase(); const posConnection = String(input.posConnection || 'manual')
    if (!appName || appName.length > 60 || !/^[A-Z]{3}$/.test(currency) || !['manual', 'usb', 'bluetooth', 'network', 'sdk'].includes(posConnection)) return error('Business settings are invalid.')
    const updatedAt = now(); const settings = { appName, currency, posProvider: String(input.posProvider || ''), posTerminalId: String(input.posTerminalId || ''), posConnection, updatedAt }; await db.run('INSERT INTO app_settings (id, app_name, currency, pos_provider, pos_terminal_id, pos_connection, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET app_name=excluded.app_name, currency=excluded.currency, pos_provider=excluded.pos_provider, pos_terminal_id=excluded.pos_terminal_id, pos_connection=excluded.pos_connection, updated_at=excluded.updated_at', [appName, currency, settings.posProvider, settings.posTerminalId, posConnection, updatedAt]); const policy = paymentPolicy(input.paymentPolicy ?? (await db.query('SELECT payment_policy FROM app_settings WHERE id = 1')).values?.[0]?.payment_policy); await db.run('UPDATE app_settings SET payment_policy = ? WHERE id = 1', [JSON.stringify(policy)]); await queue('settings', 'business', 'upsert', { ...settings, paymentPolicy: policy }); return json({ ...settings, paymentPolicy: policy })
  }
  return error('This mobile action is not available yet.', 501)
}

export function installMobileApi() {
  if (!isNativeMobile()) return
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    return url.startsWith('/api/') ? handle(new URL(url, 'https://mobile.local').pathname, init).catch((caught) => error(caught instanceof Error ? caught.message : 'Mobile database error.', 500)) : originalFetch(input, init)
  }) as typeof window.fetch
}

async function debitSaleWallet(db: Awaited<ReturnType<typeof openMobileDatabase>>, sale: Record<string, any>) {
  const customerId = sale.paymentDetails?.customerId
  if (!customerId) throw new Error('Wallet sale is missing its customer.')
  const customer = (await db.query('SELECT balance FROM customers WHERE id = ?', [customerId])).values?.[0]
  if (!customer || (Number(customer.balance) < Number(sale.total) && sale.paymentDetails?.creditApproved !== true)) throw new Error('Customer wallet has insufficient funds.')
  await db.run('UPDATE customers SET balance = ROUND(balance - ?, 2) WHERE id = ?', [sale.total, customerId])
  await db.run('INSERT INTO wallet_transactions (id, customer_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)', [id(), customerId, -Number(sale.total), `Sale ${sale.id}`, sale.createdAt || now()])
}
