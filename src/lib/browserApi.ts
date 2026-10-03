import { validateLoyaltyBalance, validateCheckoutSettings } from '../../server/pos-pricing.mjs'
import { stockChange, stockTransfer, batchReport, applySyncedSale } from '../../server/stock-ledger.mjs'
import { validQuantity } from '../../server/quantities.mjs'
import { handleRetail, applyRetailRecord } from '../../server/retail.mjs'
import { buildReports } from '../../server/reports.mjs'
import { validateCounterPayment, validateCounterRetry, counterConflictRecord, requiresCounterSync } from '../../server/counter-service.mjs'
import { handlePos, ensurePos, applyPosRecord } from '../../server/pos-service.mjs'
import { readCustomValues, validateCustomValues, validateCoreRequirements } from '../../server/shop-fields.mjs'
import { normalizeShopProfile, validateShopProfile } from '../../server/shop-profile.mjs'
import { paymentPolicy, recordPayment } from '../../server/payment.mjs'
import { normalizeCashSale } from '../../server/cash.mjs'
import { loadSubscriptionAccess } from '../../server/subscription-client.mjs'
// Browser API: separate from native Android so PWA changes cannot alter its storage path.
import { browserStocktake } from './browserStocktake'
import { cloudRequest as requestCloud } from './cloudRequest'
import { collectStaffActivity } from './staffActivityData'
import { getBrowserSyncConfiguration as getMobileSyncConfiguration, openBrowserDatabase as openMobileDatabase, saveBrowserSyncConfiguration as saveMobileSyncConfiguration, type BrowserSyncConfiguration as MobileSyncConfiguration } from './browserDatabase'

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
  return loadSubscriptionAccess({ config: config ? { url: config.syncApiUrl, token: config.deviceToken, businessId: config.businessId } : null, read: setting, write: setSetting, fetcher: originalFetch, force, cacheOnly: !force })
}
async function browserDeviceId() {
  const existing = await setting('browserDeviceId')
  if (existing) return existing
  const generated = `pwa-${crypto.randomUUID()}`
  await setSetting('browserDeviceId', generated)
  return generated
}
async function sessionUser(): Promise<MobileUser | null> {
  const userId = await setting('sessionUserId')
  if (!userId) return null
  const db = await openMobileDatabase()
  const result = await db.query('SELECT id, name, email, username, role, operational_access AS operationalAccess FROM users WHERE id = ?', [userId])
  const user = result.values?.[0]
  const config = await getMobileSyncConfiguration()
  return user ? { ...user, operationalAccess: Boolean(user.operationalAccess), organizationId: config?.businessId || 'mobile-shop' } as MobileUser : null
}
async function restoreSavedSession(): Promise<MobileUser | null> {
  const config = await getMobileSyncConfiguration()
  const saved = JSON.parse(localStorage.getItem('stockroom-user') || 'null') as Partial<MobileUser> | null
  // Authentication for a previously signed-in PWA must remain available
  // offline. Enrollment only supplies cloud sync details; it must not decide
  // whether the locally saved owner/staff session can use local inventory.
  if (!saved?.id || !['owner', 'admin', 'cashier'].includes(String(saved.role))) return null
  const organizationId = config?.businessId || String(saved.organizationId || 'browser-local')
  const localUser: MobileUser = { id: saved.id, name: String(saved.name || ''), email: String(saved.email || `${saved.id}@staff.local.invalid`), username: String(saved.username || ''), role: saved.role || 'cashier', operationalAccess: Boolean(saved.operationalAccess), organizationId }
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
  await ensureBranches(db)
  const seen = await db.query('SELECT operation_id FROM sync_inbox WHERE operation_id = ?', [operation.operationId])
  if (seen.values?.length) return
  const payload = operation.payload
  if (operation.entityType === 'retail_record') {
    await db.beginTransaction()
    try { await applyRetailRecord(db, 'business', payload); await db.commitTransaction() } catch (caught) { await db.rollbackTransaction(); throw caught }
  } else if (operation.entityType === 'pos_record') {
    await ensurePos(db)
    await db.beginTransaction()
    try { await applyPosRecord(db, 'business', payload); await db.commitTransaction() } catch (caught) { await db.rollbackTransaction(); throw caught }
  } else if (operation.entityType === 'branch' && operation.action === 'upsert') {
    await db.run('INSERT INTO branches (id, name, address, is_default, is_active, assigned_user_ids, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, address=excluded.address, is_active=excluded.is_active, assigned_user_ids=excluded.assigned_user_ids, updated_at=excluded.updated_at', [payload.id, payload.name, payload.address || '', payload.isDefault ? 1 : 0, payload.isActive === false ? 0 : 1, JSON.stringify(Array.isArray(payload.assignedUserIds) ? payload.assignedUserIds : []), payload.createdAt || operation.createdAt, payload.updatedAt || operation.createdAt])
    await db.run('INSERT OR IGNORE INTO branch_inventory (branch_id, product_id, stock, reorder_point, updated_at) SELECT ?, id, 0, reorder_point, ? FROM products', [payload.id, operation.createdAt])
  } else if (operation.entityType === 'branch_transfer' && operation.action === 'create') {
    const exists = await db.query('SELECT id FROM inventory_movements WHERE id=?', [`${payload.id}:out`])
    if (!exists.values?.length) {
      const source = (await db.query('SELECT stock FROM branch_inventory WHERE branch_id=? AND product_id=?', [payload.fromBranchId, payload.productId])).values?.[0]
      if (!source || Number(source.stock) < Number(payload.quantity)) throw new Error('Transfer cannot sync because the source branch lacks sufficient stock.')
      await db.beginTransaction()
      try {
        await stockTransfer(db,payload)
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
    if (payload.customValues != null) await db.run('UPDATE products SET custom_values = ? WHERE id = ?', [JSON.stringify(readCustomValues(payload.customValues)), payload.id])
  } else if (operation.entityType === 'stock' && operation.action === 'adjust') {
    if (!(await db.query('SELECT id FROM products WHERE id = ?', [payload.productId])).values?.length) throw new Error('A stock change references a missing product. Refresh again after the product is synchronized.')
    const branchId = String(payload.branchId || 'main')
    await db.run('INSERT OR IGNORE INTO branches (id, name, address, is_default, created_at, updated_at) VALUES (?, ?, \'\', 0, ?, ?)', [branchId, branchId === 'main' ? 'Main branch' : 'Branch', operation.createdAt, operation.createdAt])
    await db.run('INSERT OR IGNORE INTO branch_inventory (branch_id, product_id, stock, reorder_point, updated_at) SELECT ?, id, 0, reorder_point, ? FROM products WHERE id = ?', [branchId, operation.createdAt, payload.productId])
    if(payload.stockEvent || Number(payload.amount)<0)await stockChange(db,payload.stockEvent || {id:operation.operationId,branchId,productId:payload.productId,delta:Number(payload.amount),createdAt:operation.createdAt,allowExpired:true})
    await db.run('UPDATE branch_inventory SET stock = stock + ?, updated_at = ? WHERE product_id = ? AND branch_id = ?', [Number(payload.amount) || 0, operation.createdAt, payload.productId, branchId])
    await db.run('INSERT INTO inventory_movements (id, product_id, quantity, reason, created_at, branch_id) VALUES (?, ?, ?, ?, ?, ?)', [operation.operationId, payload.productId, Number(payload.amount) || 0, payload.reason || 'remote-adjustment', operation.createdAt, String(payload.branchId || 'main')])
  } else if (operation.entityType === 'sale' && operation.action === 'create') {
    await applySyncedSale(db,payload,operation,debitSaleWallet)
  } else if (operation.entityType === 'sale_void' && operation.action === 'create') {
    await db.run('INSERT OR IGNORE INTO sale_item_voids (id, order_id, product_id, product_name, quantity, unit_price, reason, staff_id, staff_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [payload.id, payload.orderId, payload.productId, payload.productName, Number(payload.quantity), Number(payload.unitPrice), payload.reason, payload.staffId || '', payload.staffName || '', payload.createdAt || operation.createdAt])
  } else if (operation.entityType === 'customer' && operation.action === 'upsert') {
    await db.run('INSERT INTO customers (id, name, phone, balance) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, phone=excluded.phone', [payload.id, payload.name, payload.phone || '', Number(payload.balance) || 0])
  } else if (operation.entityType === 'wallet' && operation.action === 'adjust') {
    const customer = await db.query('SELECT id FROM customers WHERE id = ?', [payload.customerId])
    if (customer.values?.length) {
      await db.run('UPDATE customers SET balance = ROUND(balance + ?, 2) WHERE id = ?', [Number(payload.amount) || 0, payload.customerId])
      await db.run('INSERT INTO wallet_transactions (id, customer_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)', [id(), payload.customerId, Number(payload.amount) || 0, payload.reason || 'remote-wallet', payload.createdAt || operation.createdAt])
    } else throw new Error('A wallet change references a missing customer.')
  } else if (operation.entityType === 'expense' && operation.action === 'create') {
    await db.run('INSERT OR IGNORE INTO expenses (id, category, description, amount, incurred_at, created_at, branch_id, staff_id, staff_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [payload.id, payload.category, payload.description, Number(payload.amount) || 0, payload.incurredAt || operation.createdAt, payload.createdAt || operation.createdAt, payload.branchId || 'main', payload.staffId || '', payload.staffName || ''])
  } else if (operation.entityType === 'stocktake' && operation.action === 'approved') {
    const branchId = String(payload.branchId || 'main')
    for (const count of (payload.counts || []) as Array<Record<string, unknown>>) {
      const amount = Number(count.variance) || 0
      if (!amount) continue
      if (!(await db.query('SELECT id FROM products WHERE id = ?', [count.productId])).values?.length) throw new Error('A stocktake references a missing product.')
      await db.run('INSERT OR IGNORE INTO branch_inventory (branch_id, product_id, stock, reorder_point, updated_at) SELECT ?, id, 0, reorder_point, ? FROM products WHERE id = ?', [branchId, operation.createdAt, count.productId])
      if(count.stockEvent || amount<0)await stockChange(db,count.stockEvent || {id:`${payload.id}:count:${count.productId}`,branchId,productId:count.productId,delta:amount,createdAt:payload.approvedAt||operation.createdAt,allowExpired:true})
      await db.run('UPDATE branch_inventory SET stock = stock + ?, updated_at = ? WHERE branch_id = ? AND product_id = ?', [amount, operation.createdAt, branchId, count.productId])
      await db.run('INSERT INTO inventory_movements (id, product_id, quantity, reason, created_at, branch_id) VALUES (?, ?, ?, ?, ?, ?)', [id(), count.productId, amount, `Stocktake: ${payload.approvalReason || 'approved'}`, operation.createdAt, branchId])
    }
  } else if (operation.entityType === 'settings' && operation.action === 'upsert') {
    if (payload.paymentPolicy !== undefined) await db.run('UPDATE app_settings SET payment_policy = ? WHERE id = 1', [JSON.stringify(paymentPolicy(payload.paymentPolicy))])
    await db.run('INSERT INTO app_settings (id, app_name, currency, pos_provider, pos_terminal_id, pos_connection, logo_data, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET app_name=excluded.app_name, currency=excluded.currency, pos_provider=excluded.pos_provider, pos_terminal_id=excluded.pos_terminal_id, pos_connection=excluded.pos_connection, logo_data=excluded.logo_data, updated_at=excluded.updated_at', [payload.appName || 'My Business', payload.currency || 'USD', payload.posProvider || '', payload.posTerminalId || '', payload.posConnection || 'manual', payload.logoData || '', payload.updatedAt || operation.createdAt])
    if (payload.shopProfile != null) await db.run('UPDATE app_settings SET shop_profile = ? WHERE id = 1', [JSON.stringify(normalizeShopProfile(payload.shopProfile))])
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
  if (!config) return { configured: false, pending: 0, lastError: 'This browser has not been enrolled.' }
  const db = await openMobileDatabase()
  try {
    while (true) {
    const pending = await db.query('SELECT operation_id AS operationId, entity_type AS entityType, entity_id AS entityId, action, payload, created_at AS createdAt FROM sync_outbox WHERE synced_at IS NULL ORDER BY created_at, rowid LIMIT 500')
    const operations: Operation[] = (pending.values || []).map((row) => ({ ...row, payload: JSON.parse(String(row.payload)) })) as Operation[]
    if (!operations.length) break
    if (operations.some(requiresCounterSync)) {
      const support = await originalFetch(config.syncApiUrl + '/v1/sync/capabilities', { headers: { Authorization: 'Bearer ' + config.deviceToken } })
      if (!support.ok || !(await support.json()).capabilities?.includes('counter-v2')) throw new Error('Update the cloud server before synchronizing Fast food orders. Your records remain on this device.')
    }
    {
      const response = await originalFetch(`${config.syncApiUrl}/v1/sync/push`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.deviceToken}` }, body: JSON.stringify({ businessId: config.businessId, deviceId: config.deviceId, operations }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Cloud push failed.')
      for (const conflict of result.conflicts || []) {
        const operation = operations.find(item => item.operationId === conflict.operationId)
        if (!operation) continue
        const details = { ...conflict, entityType: operation.entityType, entityId: operation.entityId, localPayload: operation.payload }
        await db.run('INSERT OR IGNORE INTO sync_conflicts (id,operation_id,entity_type,entity_id,reason,local_payload,remote_payload,created_at) VALUES(?,?,?,?,?,?,?,?)', [conflict.operationId,conflict.operationId,operation.entityType,operation.entityId,conflict.reason || 'Concurrent order edit',JSON.stringify(operation.payload),JSON.stringify(conflict.remotePayload || {}),now()])
        const remote = counterConflictRecord(details)
        if (remote) await db.run("UPDATE pos_records SET payload=?,updated_at=? WHERE scope='business' AND id=?", [JSON.stringify(remote), remote.updatedAt, remote.id])
      }
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
  if (!config) return { configured: false, pending: 0, lastError: 'This browser has not been enrolled.' }
  const db = await openMobileDatabase()
  try {
    // The cloud can return this device's own history after a browser-storage
    // restore. Those writes already exist locally, so mark their operation IDs
    // first; missing data is then restored while existing data is not replayed.
    await db.run('INSERT OR IGNORE INTO sync_inbox (operation_id, received_at) SELECT operation_id, ? FROM sync_outbox', [now()])
    let cursor = await setting('syncCursor')
    let more = true
    while (more) {
    const response = await originalFetch(`${config.syncApiUrl}/v1/sync/pull?protocol=retail-v3&capabilities=counter-v2&businessId=${encodeURIComponent(config.businessId)}&deviceId=${encodeURIComponent(config.deviceId)}&includeOwn=1&cursor=${encodeURIComponent(cursor)}`, { headers: { Authorization: `Bearer ${config.deviceToken}` } })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Cloud pull failed.')
    for (const operation of result.operations || []) {
      await db.beginTransaction()
      try { await applyOperation(operation); await db.commitTransaction() }
      catch (error) { await db.rollbackTransaction(); throw error }
    }
    if (result.cursor) await setSetting('syncCursor', result.cursor)
    more = result.operations?.length === 500 && result.cursor !== cursor
    cursor = result.cursor || cursor
    }
    const pending = await db.query('SELECT COUNT(*) AS count FROM sync_outbox WHERE synced_at IS NULL')
    return { ...(await localSyncStatus()), pending: Number(pending.values?.[0]?.count || 0), lastError: '' }
  } catch (caught) {
    const pending = await db.query('SELECT COUNT(*) AS count FROM sync_outbox WHERE synced_at IS NULL')
    return { configured: true, pending: Number(pending.values?.[0]?.count || 0), lastError: caught instanceof Error ? caught.message : 'Cloud refresh failed.' }
  }
}

async function hydrateBusinessSettings(config?: MobileSyncConfiguration | null) {
  const db = await openMobileDatabase()
  const current = (await db.query('SELECT app_name AS appName, currency, pos_provider AS posProvider, pos_terminal_id AS posTerminalId, pos_connection AS posConnection, logo_data AS logoData, payment_policy AS paymentPolicy, shop_profile AS shopProfile, updated_at AS updatedAt FROM app_settings WHERE id = 1')).values?.[0]
  // Startup is always local-first. A valid local settings row, including the
  // initial default values, must never make reopening the PWA wait for cloud.
  if (current?.appName && current?.currency) return current
  if (config) {
    await pullLatest(config)
    const synced = (await db.query('SELECT app_name AS appName, currency, pos_provider AS posProvider, pos_terminal_id AS posTerminalId, pos_connection AS posConnection, logo_data AS logoData, payment_policy AS paymentPolicy, shop_profile AS shopProfile, updated_at AS updatedAt FROM app_settings WHERE id = 1')).values?.[0]
    if (synced?.appName && synced?.currency && !(synced.appName === 'My Business' && synced.currency === 'USD')) return synced
    // A repaired/cleared local database can retain a sync cursor but lose the
    // old settings operation. Recover the latest business settings directly.
    const response = await originalFetch(`${config.syncApiUrl}/v1/business/settings?businessId=${encodeURIComponent(config.businessId)}`, { headers: { Authorization: `Bearer ${config.deviceToken}` } })
    const remote = await response.json().catch(() => ({}))
    if (response.ok && remote.settings?.appName && remote.settings?.currency) {
      const settings = remote.settings
      await db.run('INSERT INTO app_settings (id, app_name, currency, pos_provider, pos_terminal_id, pos_connection, logo_data, payment_policy, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET app_name=excluded.app_name, currency=excluded.currency, pos_provider=excluded.pos_provider, pos_terminal_id=excluded.pos_terminal_id, pos_connection=excluded.pos_connection, logo_data=excluded.logo_data, payment_policy=excluded.payment_policy, updated_at=excluded.updated_at', [settings.appName, settings.currency, settings.posProvider || '', settings.posTerminalId || '', settings.posConnection || 'manual', settings.logoData || '', JSON.stringify(paymentPolicy(settings.paymentPolicy)), settings.updatedAt || now()])
      if (settings.shopProfile != null) await db.run('UPDATE app_settings SET shop_profile = ? WHERE id = 1', [JSON.stringify(normalizeShopProfile(settings.shopProfile))])
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
  const conflicts = await db.query('SELECT COUNT(*) AS count FROM sync_conflicts WHERE resolved_at IS NULL')
  return { configured: Boolean(config), pending: Number(pending.values?.[0]?.count || 0), conflicts: Number(conflicts.values?.[0]?.count || 0), lastError: config ? await setting('lastSyncError') : 'This browser has not been enrolled.' }
}

async function cloudRequest(path: string, init: RequestInit = {}) {
  const config = await getMobileSyncConfiguration()
  const token = await setting('cloudAccessToken')
  if (!config) throw new Error('Connect this browser to a business before managing staff.')
  return requestCloud(config.syncApiUrl, path, init, (accessToken, refreshToken) => {
    void Promise.all([setSetting('cloudAccessToken', accessToken), setSetting('cloudRefreshToken', refreshToken)])
  }, token)
}
async function cachedStaff(db: Awaited<ReturnType<typeof openMobileDatabase>>) {
  const rows = (await db.query('SELECT id, name, email, username, role, operational_access AS operationalAccess, created_at AS createdAt FROM users ORDER BY created_at ASC')).values || []
  return rows.map(account => ({ ...account, operationalAccess: Boolean(account.operationalAccess) }))
}


export async function handleBrowserApi(path: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase()
  if (path === '/api/auth/register-business' && method === 'POST') {
    if (await getMobileSyncConfiguration() || await sessionUser()) return error('This device already belongs to a business. Sign in to continue.', 409)
    return originalFetch(`${cloudUrl}/v1/business-registration`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: init?.body, signal: AbortSignal.timeout(20000) })
  }
  if (path === '/api/auth/registration-key' && method === 'POST') {
    if (await getMobileSyncConfiguration() || await sessionUser()) return error('This device already belongs to a business. Sign in to continue.', 409)
    return originalFetch(`${cloudUrl}/v1/public/registration-keys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: init?.body, signal: AbortSignal.timeout(20000) })
  }
  // Logout must also clear stale sessions whose user record no longer exists.
  // Device enrollment lives in separate settings and is preserved.
  if (path === '/api/auth/logout' && method === 'POST') {
    await setSetting('sessionUserId', '')
    await setSetting('cloudAccessToken', '')
    await setSetting('cloudRefreshToken', '')
    return json({})
  }
  if (path === '/api/auth/login') return error('Use cloud sign-in on this device.', 401)
  if (['/api/auth/password-reset/request', '/api/auth/password-reset/confirm'].includes(path) && method === 'POST') {
    return originalFetch(`${cloudUrl}${path.replace('/api/', '/v1/')}`, { method, signal: AbortSignal.timeout(30_000), headers: { 'Content-Type': 'application/json' }, body: init?.body })
  }
  if (path === '/api/users' || path.startsWith('/api/users/')) {
    const suppliedToken = new Headers(init?.headers).get('Authorization')?.replace(/^Bearer\s+/i, '') || ''
    if (!suppliedToken || suppliedToken !== localStorage.getItem('stockroom-token')) return error('Your app session expired. Sign in again to manage the team.', 401)
  }
  const savedUser = await sessionUser() || await restoreSavedSession()
  // Local routes never recover identity over the network. A missing saved
  // session goes to sign-in, where the user explicitly requests cloud access.
  const user = savedUser
  const db = await openMobileDatabase()
  if (path === '/api/health') return json({ ok: true, storage: 'Browser SQLite / IndexedDB' })
  if (path === '/api/settings' && method === 'GET') {
    const config = await getMobileSyncConfiguration()
    const row = await hydrateBusinessSettings()
    return json({ ...row, paymentPolicy: paymentPolicy(row?.paymentPolicy), ownerConfigured: Boolean((await db.query('SELECT id FROM users LIMIT 1')).values?.length), cloudConfigured: Boolean(config), existingBusiness: Boolean(config) })
  }
  if (path === '/api/installer/activate' && method === 'POST') {
    const input = await body(init)
    if (input.mode !== 'existing') return error('Browser devices must join an existing business using an owner account.')
    if (await getMobileSyncConfiguration()) return error('This browser is already enrolled. Sign in to continue.', 409)
    const cloud = cloudUrl
    const login = await originalFetch(`${cloud}/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: input.ownerEmail, password: input.ownerPassword }) })
    const account = await login.json(); if (!login.ok || account.account?.role !== 'owner') return error(account.error || 'Only a business owner can enroll this browser.')
    const enrolled = await originalFetch(`${cloud}/v1/devices/enroll`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.accessToken}` }, body: JSON.stringify({ deviceId: await browserDeviceId(), label: input.label }) })
    const device = await enrolled.json(); if (!enrolled.ok) return error(device.error || 'Could not enroll this browser.')
    await saveMobileSyncConfiguration({ syncApiUrl: cloud, businessId: device.businessId, deviceId: device.deviceId, deviceToken: device.deviceToken })
    await setSetting('deviceLabel', String(input.label || input.deviceId))
    return json({ configured: true, existingBusiness: true }, 201)
  }
  if (path === '/api/auth/cloud-session' && method === 'POST') {
    const input = await body(init); let config = await getMobileSyncConfiguration()
    const syncApiUrl = config?.syncApiUrl || cloudUrl
    const requestedBusinessId = String(new URLSearchParams(window.location.search).get('business') || '').trim()
    if (config && requestedBusinessId && requestedBusinessId !== config.businessId) return error('This browser is already connected to a different business. Sign out and use a separate browser profile to join another business.', 403)
    const businessId = config?.businessId || requestedBusinessId
    const identifier = String(input.identifier || input.email || '').trim()
    const response = await originalFetch(`${syncApiUrl}/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(identifier.includes('@') ? { email: identifier, password: input.password } : { username: identifier, password: input.password, businessId }) })
    const result = await response.json(); if (!response.ok) return error(result.error || 'Email or password is incorrect.', response.status)
    const account = result.account
    if (businessId && account.businessId !== businessId) return error('These credentials belong to a different business than this sign-in link.', 403)
    if (config && account.businessId !== config.businessId) return error('This account belongs to a different business.', 403)
    if (!config) {
      const deviceId = await browserDeviceId()
      const enrolled = await originalFetch(`${syncApiUrl}/v1/devices/enroll`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${result.accessToken}` }, body: JSON.stringify({ deviceId, label: `PWA ${deviceId.slice(-8)}` }) })
      const device = await enrolled.json()
      if (!enrolled.ok) return error(device.error || 'Could not enroll this browser.', enrolled.status)
      config = { syncApiUrl, businessId: device.businessId, deviceId: device.deviceId, deviceToken: device.deviceToken }
      await saveMobileSyncConfiguration(config)
      await navigator.storage?.persist?.().catch(() => false)
    }
    // Explicit owner sign-in renews this device after token expiry/password reset.
    // Keep the same device ID, cursor and outbox so queued work is preserved.
    if (account.role === 'owner') {
      const renewed = await originalFetch(`${config.syncApiUrl}/v1/devices/enroll`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${result.accessToken}` }, body: JSON.stringify({ deviceId: config.deviceId, label: await setting('deviceLabel') || config.deviceId }) })
      const device = await renewed.json()
      if (!renewed.ok) return error(device.error || 'Could not renew this device.', renewed.status)
      config.deviceToken = device.deviceToken
      await saveMobileSyncConfiguration(config)
    }
    const localId = account.id || id(); const localUser: MobileUser = { id: localId, name: account.name, email: account.email || `${localId}@staff.local.invalid`, username: account.username || '', role: account.role, operationalAccess: Boolean(account.operationalAccess), organizationId: config.businessId }
    await db.run('INSERT INTO users (id, name, email, username, role, operational_access, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, email=excluded.email, username=excluded.username, role=excluded.role, operational_access=excluded.operational_access', [localUser.id, localUser.name, localUser.email, localUser.username || '', localUser.role, localUser.operationalAccess ? 1 : 0, now()])
    const stored = (await db.query('SELECT id, name, email, username, role, operational_access AS operationalAccess FROM users WHERE id = ?', [localUser.id])).values?.[0]
    await setSetting('sessionUserId', String(stored.id))
    await setSetting('cloudAccessToken', String(result.accessToken))
    await setSetting('cloudRefreshToken', String(result.refreshToken || ''))
    const pulled = await pullLatest(config)
    await setSetting('lastSyncError', pulled.lastError)
    await subscriptionStatus(true)
    const initialized = await hydrateBusinessSettings(config)
    await db.run('INSERT INTO app_settings (id, app_name, currency, pos_provider, pos_terminal_id, pos_connection, logo_data, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET app_name=excluded.app_name, currency=excluded.currency, pos_provider=excluded.pos_provider, pos_terminal_id=excluded.pos_terminal_id, pos_connection=excluded.pos_connection, logo_data=excluded.logo_data, updated_at=excluded.updated_at', [initialized.appName || 'My Business', initialized.currency || 'USD', initialized.posProvider || '', initialized.posTerminalId || '', initialized.posConnection || 'manual', initialized.logoData || '', initialized.updatedAt || now()])
    return json({ token: id(), user: { ...stored, operationalAccess: Boolean(stored.operationalAccess), organizationId: config.businessId }, cloudAccessToken: result.accessToken, refreshToken: result.refreshToken })
  }
  if (!user) return error('Authentication required.', 401)
  await ensureBranches(db)
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
    if (!fromBranchId || !toBranchId || fromBranchId === toBranchId || !validQuantity(quantity, 0.001) || reason.length < 3) return error('Choose two different branches, a positive quantity, and a reason.')
    if (Number((await db.query('SELECT COUNT(*) AS count FROM branches WHERE id IN (?, ?) AND is_active=1', [fromBranchId, toBranchId])).values?.[0]?.count) !== 2) return error('Both branches must be active.')
    const source = (await db.query('SELECT stock FROM branch_inventory WHERE branch_id=? AND product_id=?', [fromBranchId, productId])).values?.[0]
    if (!source || Number(source.stock) < quantity) return error('The source branch does not have enough stock.')
    const destinationStock = (await db.query('SELECT stock FROM branch_inventory WHERE branch_id=? AND product_id=?', [toBranchId, productId])).values?.[0]
    const transfer: any = { id: id(), fromBranchId, toBranchId, productId, quantity, reason, sourceBeforeStock: Number(source.stock), destinationBeforeStock: Number(destinationStock?.stock) || 0, createdAt: now() }
    await db.beginTransaction()
    try {
      transfer.batchAllocations=await stockTransfer(db,transfer)
      await db.run('UPDATE branch_inventory SET stock=stock-?, updated_at=? WHERE branch_id=? AND product_id=?', [quantity, transfer.createdAt, fromBranchId, productId])
      await db.run('INSERT INTO branch_inventory (branch_id,product_id,stock,reorder_point,updated_at) VALUES (?,?,?,0,?) ON CONFLICT(branch_id,product_id) DO UPDATE SET stock=branch_inventory.stock+excluded.stock, updated_at=excluded.updated_at', [toBranchId, productId, quantity, transfer.createdAt])
      await db.run('INSERT INTO inventory_movements (id,product_id,quantity,reason,created_at,branch_id) VALUES (?,?,?,?,?,?)', [`${transfer.id}:out`, productId, -quantity, `Transfer to ${toBranchId}: ${reason}`, transfer.createdAt, fromBranchId])
      await db.run('INSERT INTO inventory_movements (id,product_id,quantity,reason,created_at,branch_id) VALUES (?,?,?,?,?,?)', [`${transfer.id}:in`, productId, quantity, `Transfer from ${fromBranchId}: ${reason}`, transfer.createdAt, toBranchId])
      await queue('branch_transfer', transfer.id, 'create', transfer); await db.commitTransaction()
    } catch (caught) { await db.rollbackTransaction(); return error(caught instanceof Error ? caught.message : 'Could not transfer stock.') }
    return json(transfer, 201)
  }
  if (path === '/api/auth/session' && method === 'GET') {
    const token = new Headers(init?.headers).get('Authorization')?.replace(/^Bearer\s+/i, '') || id()
    return json({ user, token })
  }
  const stocktakeResponse = await browserStocktake(path, init, canOperate(user), queue)
  if (stocktakeResponse) return stocktakeResponse
  if (path === '/api/sync/conflicts' && method === 'GET') {
    if (!isManager(user)) return error('Owner or admin access required.', 403)
    return json({ conflicts: (await db.query('SELECT id, entity_type AS entityType, reason, created_at AS createdAt FROM sync_conflicts WHERE resolved_at IS NULL')).values })
  }
  const conflictMatch = path.match(/^\/api\/sync\/conflicts\/([^/]+)\/resolve$/)
  if (conflictMatch && method === 'POST') {
    if (!isManager(user)) return error('Owner or admin access required.', 403)
    await db.run('UPDATE sync_conflicts SET resolved_at = ? WHERE id = ?', [now(), conflictMatch[1]])
    return json({ ok: true })
  }
  if (path === '/api/sync/status') return json(await localSyncStatus())
  if (path === '/api/subscriptions/access') {
    if (!await sessionUser()) return error('Authentication required.', 401)
    return json(await subscriptionStatus(new Headers(init?.headers).get('X-Subscription-Refresh') === 'true'))
  }
  if ((path === '/api/sync/pull' || path === '/api/sync/now') && method === 'POST') {
    const status = path === '/api/sync/pull' ? await pullLatest() : await syncNow()
    await subscriptionStatus(true)
    await setSetting('lastSyncError', status.lastError)
    return json(status)
  }
  if (path === '/api/products' && method === 'GET') return json({ products: (await db.query('SELECT p.id, p.name, p.sku, p.barcode, p.category, COALESCE(i.stock, 0) AS stock, COALESCE(i.reorder_point, p.reorder_point) AS reorder, p.price, p.cost_price AS cost, p.unit, p.custom_values AS customValues, p.updated_at AS updated FROM products p LEFT JOIN branch_inventory i ON i.product_id = p.id AND i.branch_id = ? ORDER BY p.updated_at DESC', [branchId])).values || [] })
  if (path === '/api/products/export' && method === 'GET') {
    if (user.role !== 'owner') return error('Owner access required.', 403)
    try {
      const response = await cloudRequest('/v1/subscriptions/business-exit')
      const status = await response.json() as { feeAmount?: number; paid?: boolean; closed?: boolean }
      if (!response.ok || status.closed || (Number(status.feeAmount) > 0 && !status.paid)) return error('Complete the one-time product export payment before downloading.', 402)
    } catch { return error('Could not verify product export eligibility with Stockroom cloud.', 503) }
    const rows = (await db.query('SELECT p.name, p.sku, p.barcode, p.category, p.cost_price AS cost, p.price, p.unit, p.custom_values AS customValues, b.name AS branch, COALESCE(i.stock,0) AS stock, COALESCE(i.reorder_point,p.reorder_point) AS reorder FROM products p CROSS JOIN branches b LEFT JOIN branch_inventory i ON i.product_id=p.id AND i.branch_id=b.id ORDER BY p.name,b.is_default DESC,b.name')).values || []
    const cell = (value: unknown) => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`
    const profile = normalizeShopProfile((await hydrateBusinessSettings()).shopProfile)
    const customIds = [...new Set(rows.flatMap(row => Object.keys(readCustomValues(row.customValues))))]
    const csv = [['Product','SKU','Barcode','Category','Cost price','Selling price','Unit','Branch','Stock','Reorder point', ...customIds.map(id => `${profile.fields.find(field => field.id === id)?.label || id} [${id}]`)], ...rows.map(row => [row.name,row.sku,row.barcode,row.category,row.cost,row.price,row.unit,row.branch,row.stock,row.reorder, ...customIds.map(id => readCustomValues(row.customValues)[id] || '')])].map(row => row.map(cell).join(',')).join('\r\n')
    return new Response(csv, { headers: { 'Content-Type': 'text/csv;charset=utf-8', 'Content-Disposition': 'attachment; filename="stockroom-products.csv"' } })
  }
  if (path === '/api/products' && method === 'POST') {
    if (!canOperate(user)) return error('Operational access is required.', 403)
    const input = await body(init); const name = String(input.name || '').trim(); const product = { id: id(), name, sku: String(input.sku || '').trim() || `${name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 24).toUpperCase() || 'PRODUCT'}-${crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`, barcode: String(input.barcode || '').trim(), category: String(input.category || '').trim(), stock: Number(input.stock), reorder: Number(input.reorder), price: Number(input.price), cost: Number(input.cost || 0), unit: String(input.unit || '').trim(), updated: now() }
    if (!product.name || !product.sku || !product.category || !product.unit || [product.stock, product.reorder, product.price, product.cost].some((value) => !Number.isFinite(value) || value < 0)) return error('Product fields are invalid.')
    if (!validQuantity(product.stock) || !validQuantity(product.reorder)) return error('Stock values must have at most three decimals.')
    let customValues: Record<string, string>
    try { const profile = normalizeShopProfile((await hydrateBusinessSettings()).shopProfile); validateCoreRequirements(product, profile); customValues = validateCustomValues(input.customValues, profile) } catch (caught) { return error(caught instanceof Error ? caught.message : 'Invalid custom fields.') }
    Object.assign(product, { customValues })
    await db.run('INSERT INTO products (id, name, sku, barcode, category, stock, reorder_point, price, cost_price, unit, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)', [product.id, product.name, product.sku, product.barcode, product.category, product.reorder, product.price, product.cost, product.unit, product.updated])
    await db.run('UPDATE products SET custom_values = ? WHERE id = ?', [JSON.stringify(customValues), product.id])
    await db.run('INSERT INTO branch_inventory (branch_id, product_id, stock, reorder_point, updated_at) VALUES (?, ?, ?, ?, ?)', [branchId, product.id, product.stock, product.reorder, product.updated])
    await queue('product', product.id, 'upsert', { ...product, stock: 0 })
    if (product.stock) await queue('stock', product.id, 'adjust', { productId: product.id, branchId, amount: product.stock, reason: 'initial-stock', updatedAt: product.updated })
    return json(product, 201)
  }
  const fieldsMatch = path.match(/^\/api\/products\/([^/]+)\/custom-values$/)
  if (fieldsMatch && method === 'PUT') {
    if (!canOperate(user)) return error('Operational access is required.', 403)
    const current = (await db.query('SELECT p.id, p.name, p.sku, p.barcode, p.category, COALESCE(i.stock,0) AS stock, p.reorder_point AS reorder, p.price, p.cost_price AS cost, p.unit, p.custom_values AS customValues FROM products p LEFT JOIN branch_inventory i ON i.product_id=p.id AND i.branch_id=? WHERE p.id=?', [branchId, fieldsMatch[1]])).values?.[0]
    if (!current) return error('Product not found.', 404)
    let customValues: Record<string, string>
    try { customValues = { ...readCustomValues(current.customValues), ...validateCustomValues((await body(init)).customValues, normalizeShopProfile((await hydrateBusinessSettings()).shopProfile)) } } catch (caught) { return error(caught instanceof Error ? caught.message : 'Invalid custom fields.') }
    const updated = now()
    await db.run('UPDATE products SET custom_values = ?, updated_at = ? WHERE id = ?', [JSON.stringify(customValues), updated, fieldsMatch[1]])
    const saved = { ...current, customValues, updated }
    await queue('product', String(current.id), 'upsert', { ...saved, stock: 0 })
    return json(saved)
  }
  const stock = path.match(/^\/api\/products\/([^/]+)\/stock$/)
  if (stock && method === 'POST') {
    if (!canOperate(user)) return error('Operational access is required.', 403)
    const input = await body(init); const amount = Number(input.amount); if (!validQuantity(amount, -Number.MAX_SAFE_INTEGER) || amount === 0) return error('Stock amount must be non-zero with at most three decimals.')
    const product = (await db.query('SELECT stock FROM branch_inventory WHERE product_id = ? AND branch_id = ?', [stock[1], branchId])).values?.[0]; if (!product || Number(product.stock) + amount < 0) return error('Stock cannot be negative.')
    const updated = now(), eventId = id()
    await db.beginTransaction()
    try {
      const stockEvent = await stockChange(db,{id:eventId,branchId,productId:stock[1],delta:amount,createdAt:updated,category:amount<0?'stock-loss':'stock-adjustment',reason:'manual-adjustment',allowExpired:true})
      await db.run('UPDATE branch_inventory SET stock = stock + ?, updated_at = ? WHERE product_id = ? AND branch_id = ?', [amount, updated, stock[1], branchId])
      await db.run('INSERT INTO inventory_movements (id, product_id, quantity, reason, created_at, branch_id) VALUES (?, ?, ?, ?, ?, ?)', [eventId, stock[1], amount, 'manual-adjustment', updated, branchId])
      await queue('stock', stock[1], 'adjust', { productId: stock[1], branchId, amount, beforeStock: Number(product.stock), reason: 'manual-adjustment', updatedAt: updated, stockEvent })
      await db.commitTransaction()
    } catch(caught) { await db.rollbackTransaction(); return error(caught instanceof Error?caught.message:'Could not adjust stock.') }

    return json((await db.query('SELECT p.id, p.name, p.sku, p.category, i.stock, i.reorder_point AS reorder, p.price, p.cost_price AS cost, p.unit, p.custom_values AS customValues, p.updated_at AS updated FROM products p JOIN branch_inventory i ON i.product_id=p.id WHERE p.id = ? AND i.branch_id = ?', [stock[1], branchId])).values?.[0])
  }
  if (path.startsWith('/api/integrations/')) {
    const routes: Record<string, string> = { '/api/integrations/paystack/config': '/v1/pos-paystack/config', '/api/integrations/paystack/presence': '/v1/pos-paystack/presence', '/api/integrations/paystack/start': '/v1/pos-paystack/start', '/api/integrations/paystack/verify': '/v1/pos-paystack/verify', '/api/integrations/receipts/send': '/v1/receipts/send' }
    if (!routes[path]) return error('Integration route not found.', 404)
    const config = await getMobileSyncConfiguration()
    if (!config) return error('Connect this device to the cloud first.', 503)
    try {
      return await originalFetch(`${config.syncApiUrl}${routes[path]}`, { method, headers: { Authorization: `Bearer ${config.deviceToken}`, 'Content-Type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify({ ...await body(init), branchId }) }), signal: AbortSignal.timeout(45000) })
    } catch { return error('Could not reach the payment service. Check payment status before retrying.', 503) }
  }
  if (path === '/api/retail') {
    if (!isManager(user)) return error('Owner or admin access required for purchasing.', 403)
    try { return json(await handleRetail({ currency: (await hydrateBusinessSettings()).currency, db, scope: 'business', branchId, user, method, input: method === 'GET' ? {} : await body(init), publish: (record: Record<string, unknown>) => queue('retail_record', String(record.id), 'create', record) }), method === 'GET' ? 200 : 201) }
    catch (caught) { return error(caught instanceof Error ? caught.message : 'Could not save purchasing changes.') }
  }
  if (path.startsWith('/api/pos')) {
    try {
      return json(await handlePos({ db, scope: 'business', branchId, user, path, method, tillId: new Headers(init?.headers).get('X-Stockroom-Till') || '', input: method === 'GET' ? {} : await body(init),
        sales: async () => {
          const loaded = (await db.query('SELECT id,total,payment_reference AS paymentReference,terminal_provider AS terminalProvider,cash_received AS cashReceived,change_given AS changeGiven,payment_method AS paymentMethod,payment_details AS paymentDetails,created_at AS createdAt FROM sales WHERE branch_id=?', [branchId])).values || []
          for (const sale of loaded) {
            sale.paymentDetails = sale.paymentDetails ? JSON.parse(String(sale.paymentDetails)) : undefined
            sale.items = (await db.query('SELECT product_id AS productId,product_name AS productName,quantity,unit_cost AS unitCost,batch_allocations AS batchAllocations,unit_price AS price FROM sale_items WHERE sale_id=? ORDER BY rowid', [sale.id])).values || []
          }
          return loaded
        }, publish: (record: Record<string, unknown>) => queue('pos_record', String(record.id), 'upsert', record) }))
    } catch (caught) { return error(caught instanceof Error ? caught.message : 'POS action failed.') }
  }
  if (path === '/api/sales' && method === 'POST') {
    const subscription = await subscriptionStatus()
    if (subscription.blocked) return error(subscription.reason, 402)
    let sale = await body(init); sale.branchId = branchId; if (sale.paymentMethod === 'wallet' && (sale.paymentDetails as { creditApproved?: boolean } | undefined)?.creditApproved && user.role !== 'owner') return error('Only the owner may approve credit purchases.', 403); try { sale = sale.paymentDetails ? recordPayment(sale, (await db.query('SELECT payment_policy FROM app_settings WHERE id = 1')).values?.[0]?.payment_policy) : normalizeCashSale(sale) } catch (caught) { return error(caught instanceof Error ? caught.message : 'Invalid cash amount.') }; if (!sale.id || !Array.isArray(sale.items) || !Number.isFinite(Number(sale.total))) return error('Sale is invalid.')
    const previousSale = (await db.query('SELECT id,total,branch_id AS branchId,payment_method AS paymentMethod,payment_reference AS paymentReference,terminal_provider AS terminalProvider,payment_details AS paymentDetails,created_at AS createdAt FROM sales WHERE id=?', [sale.id])).values?.[0]
    if (previousSale) {
      if ((sale.paymentDetails as { counterOrder?: unknown } | undefined)?.counterOrder) {
        try {
          const counter = (sale.paymentDetails as { counterOrder: { id: string } }).counterOrder
          const orderRow = (await db.query("SELECT payload FROM pos_records WHERE scope='business' AND id=?", [counter.id])).values?.[0]
          const tillId = new Headers(init?.headers).get('X-Stockroom-Till') || ''
          if (!tillId) throw new Error('Payment must be taken on the original till.')
          validateCounterPayment(sale, orderRow ? JSON.parse(String(orderRow.payload)) : undefined, tillId)
          validateCounterRetry(sale, { ...previousSale, paymentDetails: JSON.parse(String(previousSale.paymentDetails)) })
        } catch (caught) { return error(caught instanceof Error ? caught.message : 'Order already paid.') }
      }
      return json({ ...sale, createdAt: previousSale.createdAt, syncStatus: 'pending' })
    }
    if (!sale.items.length || sale.items.some((item: Record<string, unknown>) => !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 || !Number.isFinite(Number(item.price)) || Number(item.price) < 0)) return error('Sale quantities and prices are invalid.')
    const total = sale.items.reduce((sum: number, item: Record<string, unknown>) => sum + Number(item.quantity) * Number(item.price), 0)
    if (!((sale.paymentDetails as { pos?: unknown } | undefined)?.pos) && Math.abs(total - Number(sale.total)) > 0.01) return error('Sale total does not match its items.')
    if (sale.paymentMethod === 'wallet' && !(sale.paymentDetails as { customerId?: unknown } | undefined)?.customerId) return error('Select the customer wallet.')
    if ((await db.query('SELECT id FROM sales WHERE id = ?', [sale.id])).values?.length) return json({ ...sale, syncStatus: 'synced' })
    const terminalOrder = (sale.paymentDetails as { pos?: { terminalRequestId?: string } } | undefined)?.pos?.terminalRequestId
    if (terminalOrder) {
      if (terminalOrder !== sale.id || sale.paymentMethod !== 'external-pos') return error('Paystack payment belongs to a different order.')
      const config = await getMobileSyncConfiguration()
      if (!config) return error('Connect to the payment service before completing this sale.')
      const response = await originalFetch(`${config.syncApiUrl}/v1/pos-paystack/verify`, { method: 'POST', headers: { Authorization: `Bearer ${config.deviceToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: terminalOrder }), signal: AbortSignal.timeout(25000) })
      const verified = await response.json()
      if (!response.ok || !verified.paid || verified.amount !== sale.total || verified.currency !== sale.currency) return error('Paystack has not verified this sale amount and currency.')
      sale.terminalProvider = 'Paystack'; sale.paymentReference = verified.reference
    }
    await db.beginTransaction(); try {
      const rewardSales = ((await db.query('SELECT id,payment_details FROM sales WHERE branch_id=?', [branchId])).values || []).map(row => ({ id: row.id, paymentDetails: row.payment_details ? JSON.parse(String(row.payment_details)) : undefined }))
      const rewardReturns = ((await db.query("SELECT payload FROM pos_records WHERE scope='business' AND branch_id=? AND kind='return'", [branchId])).values || []).map(row => JSON.parse(String(row.payload)))
      const checkoutSettings = (await db.query("SELECT payload FROM pos_records WHERE scope='business' AND id='pos-settings'")).values?.[0]
      const checkoutPos = (sale.paymentDetails as {pos?: {tillId?: string}} | undefined)?.pos
      if (checkoutPos) checkoutPos.tillId = new Headers(init?.headers).get('X-Stockroom-Till') || ''
      const counter = (sale.paymentDetails as { counterOrder?: { id: string } } | undefined)?.counterOrder
      if (counter) {
        const row = (await db.query("SELECT payload FROM pos_records WHERE scope='business' AND id=?", [counter.id])).values?.[0]
        const tillId = new Headers(init?.headers).get('X-Stockroom-Till') || ''
        if (!tillId) throw new Error('Payment must be taken on the original till.')
        validateCounterPayment(sale, row ? JSON.parse(String(row.payload)) : undefined, tillId)
      }
      validateCheckoutSettings(sale, checkoutSettings ? JSON.parse(String(checkoutSettings.payload)).value : undefined)
      const loyaltyCustomer = (sale.paymentDetails as { pos?: { customerId?: string } } | undefined)?.pos?.customerId
      if (loyaltyCustomer && !(await db.query('SELECT id FROM customers WHERE id=?', [loyaltyCustomer])).values?.length) throw new Error('Selected customer does not exist.')
      validateLoyaltyBalance(sale, rewardSales, rewardReturns)
      if (sale.paymentMethod === 'wallet') await debitSaleWallet(db, sale); await db.run('INSERT INTO sales (id, total, payment_method, payment_reference, terminal_provider, staff_id, staff_name, created_at, cash_received, change_given, payment_details, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [sale.id, Number(sale.total), sale.paymentMethod || 'cash', sale.paymentReference || '', sale.terminalProvider || '', user.id, user.name, sale.createdAt || now(), sale.cashReceived ?? null, sale.changeGiven ?? null, sale.paymentDetails ? JSON.stringify(sale.paymentDetails) : null, branchId]); for (const item of sale.items as Array<Record<string, unknown>>) { if (String(item.productId).startsWith('service:')) { const quantity = Number(item.quantity), price = Number(item.price); if (!String(item.productName || '').trim() || String(item.productName).length > 200 || !validQuantity(quantity, 0.001) || Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 0.000001 || !Number.isFinite(price) || price < 0) throw new Error('Enter a service description, positive quantity and valid price.'); await db.run('INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?)', [id(), sale.id, item.productId, item.productName, quantity, price, 0]); continue } const product = (await db.query('SELECT p.name, i.stock, p.cost_price AS cost FROM products p JOIN branch_inventory i ON i.product_id=p.id WHERE p.id = ? AND i.branch_id = ?', [item.productId, branchId])).values?.[0]; if (!product || Number(product.stock) < Number(item.quantity)) throw new Error('Insufficient stock for sale.'); item.beforeStock = Number(product.stock); const allocation=await stockChange(db,{id:`${sale.id}:sale:${sale.items.indexOf(item)}`,branchId,productId:item.productId,delta:-Number(item.quantity),createdAt:sale.createdAt||now()});item.beforeStock=Number(product.stock);item.unitCost=allocation.unitCost;item.batchAllocations=allocation.allocations; await db.run('UPDATE branch_inventory SET stock = stock - ? WHERE product_id = ? AND branch_id = ?', [Number(item.quantity), item.productId, branchId]); await db.run('INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?)', [id(), sale.id, item.productId, item.productName || product.name, Number(item.quantity), Number(item.price), Number(item.unitCost) || 0]); await db.run('UPDATE sale_items SET batch_allocations=? WHERE sale_id=? AND id=(SELECT id FROM sale_items WHERE sale_id=? ORDER BY rowid DESC LIMIT 1)',[JSON.stringify(item.batchAllocations),sale.id,sale.id]) } await queue('sale', String(sale.id), 'create', { ...sale, staffId: user.id, staffName: user.name }); await db.commitTransaction() } catch (caught) { await db.rollbackTransaction(); return error(caught instanceof Error ? caught.message : 'Could not save sale.') }
    const payload = { ...sale, staffId: user.id, staffName: user.name }; return json({ ...payload, syncStatus: 'pending' }, 201)
  }
  if (path === '/api/sales' && method === 'GET') {
    if (!canOperate(user)) return error('Operational access is required.', 403)
    const sales = (await db.query('SELECT id, total, payment_method AS paymentMethod, payment_reference AS paymentReference, terminal_provider AS terminalProvider, cash_received AS cashReceived, change_given AS changeGiven, payment_details AS paymentDetails, staff_name AS staffName, created_at AS createdAt FROM sales WHERE branch_id = ? ORDER BY created_at DESC', [branchId])).values || []
    for (const sale of sales) sale.paymentDetails = sale.paymentDetails ? JSON.parse(String(sale.paymentDetails)) : undefined
    for (const sale of sales) sale.items = (await db.query('SELECT product_id AS productId, product_name AS productName, quantity, unit_cost AS unitCost, batch_allocations AS batchAllocations, unit_price AS unitPrice FROM sale_items WHERE sale_id = ?', [sale.id])).values || []
    return json({ sales })
  }
  if (path === '/api/sales/voids' && method === 'POST') {
    const input = await body(init)
    const reason = String(input.reason || '').trim()
    const quantity = Number(input.quantity)
    const unitPrice = Number(input.unitPrice)
    if (!String(input.id || '').trim() || !String(input.orderId || '').trim() || !String(input.productId || '').trim() || !String(input.productName || '').trim() || !validQuantity(quantity, 0.001) || !Number.isFinite(unitPrice) || unitPrice < 0 || reason.length < 3 || reason.length > 500) return error('Select a valid item and enter a void reason of 3 to 500 characters.')
    const event = { id: String(input.id), orderId: String(input.orderId), productId: String(input.productId), productName: String(input.productName).trim().slice(0, 200), quantity, unitPrice, reason, branchId, staffId: user.id, staffName: user.name, createdAt: now() }
    await db.run('INSERT OR IGNORE INTO sale_item_voids (id, order_id, product_id, product_name, quantity, unit_price, reason, staff_id, staff_name, created_at, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [event.id, event.orderId, event.productId, event.productName, event.quantity, event.unitPrice, event.reason, event.staffId, event.staffName, event.createdAt, branchId])
    if ((await db.query('SELECT changes() AS changed')).values?.[0]?.changed) await queue('sale_void', event.id, 'create', event)
    return json(event, 201)
  }
  if (path === '/api/sales/voids' && method === 'GET') {
    if (!canOperate(user)) return error('Operational access is required.', 403)
    return json({ voids: (await db.query('SELECT id, order_id AS orderId, product_id AS productId, product_name AS productName, quantity, unit_price AS unitPrice, reason, staff_id AS staffId, staff_name AS staffName, created_at AS createdAt FROM sale_item_voids WHERE branch_id = ? ORDER BY created_at DESC', [branchId])).values || [] })
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
    if (!Number.isFinite(Date.parse(expense.incurredAt))) return error('Enter a valid expense date.')
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
    await ensurePos(db)
    const sales = (await db.query('SELECT id,total,payment_details AS paymentDetails,created_at AS createdAt FROM sales WHERE branch_id = ?', [branchId])).values || []
    const items = (await db.query('SELECT si.sale_id AS saleId,si.product_id AS productId,si.product_name AS productName,si.quantity, si.unit_cost AS unitCost FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.branch_id = ? ORDER BY si.rowid', [branchId])).values || []
    const products = (await db.query('SELECT p.id,p.cost_price AS cost,COALESCE(i.stock,0) AS stock, COALESCE(i.reorder_point,p.reorder_point) AS reorder, p.price FROM products p LEFT JOIN branch_inventory i ON i.product_id=p.id AND i.branch_id=?', [branchId])).values || []
    const expenses = (await db.query('SELECT amount, incurred_at AS incurredAt FROM expenses WHERE branch_id = ?', [branchId])).values || []
    const returns = ((await db.query("SELECT payload FROM pos_records WHERE scope = 'business' AND branch_id = ? AND kind = 'return'", [branchId])).values || []).map(row => JSON.parse(String(row.payload)))
    const retail=((await db.query("SELECT payload FROM retail_records WHERE scope=? AND (branch_id=? OR kind='supplier')",['business',branchId])).values||[]).map(row=>JSON.parse(String(row.payload)))
    const batchData=await batchReport(db,branchId)
    const adjustments=(await db.query('SELECT payload FROM stock_events')).values.map(row=>JSON.parse(String(row.payload))).filter(row=>row.branchId===branchId && row.category==='stock-loss')
    const registers=(await db.query("SELECT payload FROM pos_records WHERE scope='business' AND branch_id=? AND kind='register'",[branchId])).values.map(row=>JSON.parse(String(row.payload)))
    return json(buildReports({ sales, items, products, expenses, returns,retail,batches:batchData.lots,adjustments,registers }))
  }
  if (path === '/api/reports/sales.csv' && method === 'GET') {
    if (!isManager(user)) return error('Owner or admin access required.', 403)
    const rows = (await db.query('SELECT id, created_at, total, payment_method, staff_name FROM sales WHERE branch_id = ? ORDER BY created_at DESC', [branchId])).values || []
    const cell = (value: unknown) => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`
    const csv = [['ID', 'Date', 'Total', 'Payment', 'Staff'], ...rows.map(row => [row.id, row.created_at, row.total, row.payment_method, row.staff_name])].map(row => row.map(cell).join(',')).join('\r\n')
    return new Response(csv, { headers: { 'Content-Type': 'text/csv;charset=utf-8' } })
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
  if (path === '/api/settings/shop-profile' && method === 'PUT') {
    if (user.role !== 'owner') return error('Only the owner can customize the shop.', 403)
    let profile
    try { profile = validateShopProfile(await body(init)) } catch (caught) { return error(caught instanceof Error ? caught.message : 'Invalid shop setup.') }
    await db.run('INSERT OR IGNORE INTO app_settings (id, updated_at) VALUES (1, ?)', [now()])
    await db.run('UPDATE app_settings SET shop_profile = ?, updated_at = ? WHERE id = 1', [JSON.stringify(profile), now()])
    const snapshot = await hydrateBusinessSettings()
    await queue('settings', 'business', 'upsert', { ...snapshot, shopProfile: profile, paymentPolicy: paymentPolicy(snapshot.paymentPolicy) })
    return json(profile)
  }
  if (path === '/api/settings' && method === 'PUT') {
    if (user.role !== 'owner') return error('Only the owner can change business settings.', 403)
    const input = await body(init); const appName = String(input.appName || '').trim(); const currency = String(input.currency || '').toUpperCase(); const posConnection = String(input.posConnection || 'manual'); const logoData = String(input.logoData || '')
    if (!appName || appName.length > 60 || !/^[A-Z]{3}$/.test(currency) || !['manual', 'usb', 'bluetooth', 'network', 'sdk'].includes(posConnection) || (logoData && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(logoData) || logoData.length > 1_400_000))) return error('Business settings are invalid.')
    const updatedAt = now(); const settings = { appName, currency, posProvider: String(input.posProvider || ''), posTerminalId: String(input.posTerminalId || ''), posConnection, logoData, updatedAt }; await db.run('INSERT INTO app_settings (id, app_name, currency, pos_provider, pos_terminal_id, pos_connection, logo_data, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET app_name=excluded.app_name, currency=excluded.currency, pos_provider=excluded.pos_provider, pos_terminal_id=excluded.pos_terminal_id, pos_connection=excluded.pos_connection, logo_data=excluded.logo_data, updated_at=excluded.updated_at', [appName, currency, settings.posProvider, settings.posTerminalId, posConnection, logoData, updatedAt]); const policy = paymentPolicy(input.paymentPolicy ?? (await db.query('SELECT payment_policy FROM app_settings WHERE id = 1')).values?.[0]?.payment_policy); await db.run('UPDATE app_settings SET payment_policy = ? WHERE id = 1', [JSON.stringify(policy)]); const rawProfile = (await db.query('SELECT shop_profile FROM app_settings WHERE id = 1')).values?.[0]?.shop_profile; const shopProfile = rawProfile && rawProfile !== 'null' ? normalizeShopProfile(rawProfile) : null; await queue('settings', 'business', 'upsert', { ...settings, paymentPolicy: policy, shopProfile }); return json({ ...settings, paymentPolicy: policy, shopProfile })
  }
  return error('This action is available in the installed desktop app.', 501)
}

async function debitSaleWallet(db: Awaited<ReturnType<typeof openMobileDatabase>>, sale: Record<string, any>) {
  const customerId = sale.paymentDetails?.customerId
  if (!customerId) throw new Error('Wallet sale is missing its customer.')
  const customer = (await db.query('SELECT balance FROM customers WHERE id = ?', [customerId])).values?.[0]
  if (!customer || (Number(customer.balance) < Number(sale.total) && sale.paymentDetails?.creditApproved !== true)) throw new Error('Customer wallet has insufficient funds.')
  await db.run('UPDATE customers SET balance = ROUND(balance - ?, 2) WHERE id = ?', [sale.total, customerId])
  await db.run('INSERT INTO wallet_transactions (id, customer_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)', [id(), customerId, -Number(sale.total), `Sale ${sale.id}`, sale.createdAt || now()])
}
