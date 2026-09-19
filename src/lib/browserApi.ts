import { paymentPolicy, recordPayment } from '../../server/payment.mjs'
import { normalizeCashSale } from '../../server/cash.mjs'
// Browser API: separate from native Android so PWA changes cannot alter its storage path.
import { browserStocktake } from './browserStocktake'
import { getBrowserSyncConfiguration as getMobileSyncConfiguration, openBrowserDatabase as openMobileDatabase, saveBrowserSyncConfiguration as saveMobileSyncConfiguration, type BrowserSyncConfiguration as MobileSyncConfiguration } from './browserDatabase'

type MobileUser = { id: string; name: string; email: string; role: 'owner' | 'admin' | 'cashier'; operationalAccess: boolean; organizationId: string }
type Operation = { operationId: string; entityType: string; entityId: string; action: string; payload: Record<string, unknown>; createdAt: string }

const networkFetch = window.fetch.bind(window)
const originalFetch: typeof fetch = (input, init = {}) => networkFetch(input, { ...init, signal: init.signal || AbortSignal.timeout(20000) })
const cloudUrl = (import.meta.env.VITE_SYNC_API_URL || 'https://stockroom-0vm5.onrender.com').replace(/\/$/, '')
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
  const result = await db.query('SELECT id, name, email, role, operational_access AS operationalAccess FROM users WHERE id = ?', [userId])
  const user = result.values?.[0]
  return user ? { ...user, operationalAccess: Boolean(user.operationalAccess), organizationId: 'mobile-shop' } as MobileUser : null
}
async function restoreCloudSession(): Promise<MobileUser | null> {
  const config = await getMobileSyncConfiguration()
  const token = await setting('cloudAccessToken')
  if (!config || !token) return null
  const response = await originalFetch(`${config.syncApiUrl}/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.account?.id) return null
  const account = result.account
  const localUser: MobileUser = { id: account.id, name: account.name, email: account.email || `${account.id}@staff.local.invalid`, role: account.role, operationalAccess: Boolean(account.operationalAccess), organizationId: config.businessId }
  const db = await openMobileDatabase()
  await db.run('INSERT INTO users (id, name, email, role, operational_access, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET id=excluded.id, name=excluded.name, role=excluded.role, operational_access=excluded.operational_access', [localUser.id, localUser.name, localUser.email, localUser.role, localUser.operationalAccess ? 1 : 0, now()])
  const stored = (await db.query('SELECT id, name, email, role, operational_access AS operationalAccess FROM users WHERE email = ?', [localUser.email])).values?.[0]
  if (!stored) return null
  await setSetting('sessionUserId', String(stored.id))
  return { ...stored, operationalAccess: Boolean(stored.operationalAccess), organizationId: config.businessId } as MobileUser
}
function isManager(user: MobileUser | null) { return Boolean(user && ['owner', 'admin'].includes(user.role)) }
function canOperate(user: MobileUser | null) { return isManager(user) || Boolean(user?.role === 'cashier' && user.operationalAccess) }
async function body(init?: RequestInit) { try { return JSON.parse(String(init?.body || '{}')) as Record<string, unknown> } catch { throw new Error('Request body must be valid JSON.') } }

async function queue(entityType: string, entityId: string, action: string, payload: Record<string, unknown>) {
  const db = await openMobileDatabase()
  await db.run('INSERT INTO sync_outbox (operation_id, entity_type, entity_id, action, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id(), entityType, entityId, action, JSON.stringify(payload), now()])
}

async function applyOperation(operation: Operation) {
  const db = await openMobileDatabase()
  const seen = await db.query('SELECT operation_id FROM sync_inbox WHERE operation_id = ?', [operation.operationId])
  if (seen.values?.length) return
  const payload = operation.payload
  if (operation.entityType === 'product' && operation.action === 'upsert') {
    await db.run(`INSERT INTO products (id, name, sku, barcode, category, stock, reorder_point, price, cost_price, unit, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, sku=excluded.sku, barcode=excluded.barcode, category=excluded.category, reorder_point=excluded.reorder_point, price=excluded.price, cost_price=excluded.cost_price, unit=excluded.unit, updated_at=excluded.updated_at`,
    [payload.id, payload.name, payload.sku, payload.barcode || '', payload.category, Number(payload.stock) || 0, Number(payload.reorder) || 0, Number(payload.price) || 0, Number(payload.cost) || 0, payload.unit, payload.updated || operation.createdAt])
  } else if (operation.entityType === 'stock' && operation.action === 'adjust') {
    if (!(await db.query('SELECT id FROM products WHERE id = ?', [payload.productId])).values?.length) throw new Error('A stock change references a missing product. Refresh again after the product is synchronized.')
    await db.run('UPDATE products SET stock = MAX(0, stock + ?), updated_at = ? WHERE id = ?', [Number(payload.amount) || 0, operation.createdAt, payload.productId])
    await db.run('INSERT INTO inventory_movements (id, product_id, quantity, reason, created_at) VALUES (?, ?, ?, ?, ?)', [operation.operationId, payload.productId, Number(payload.amount) || 0, payload.reason || 'remote-adjustment', operation.createdAt])
  } else if (operation.entityType === 'sale' && operation.action === 'create') {
    const existing = await db.query('SELECT id FROM sales WHERE id = ?', [payload.id])
    if (!existing.values?.length) {
      if (payload.paymentMethod === 'wallet') await debitSaleWallet(db, payload)
      await db.run('INSERT INTO sales (id, total, payment_method, payment_reference, terminal_provider, staff_id, staff_name, created_at, cash_received, change_given, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [payload.id, Number(payload.total), payload.paymentMethod || 'cash', payload.paymentReference || '', payload.terminalProvider || '', payload.staffId || '', payload.staffName || '', payload.createdAt || operation.createdAt, normalizeCashSale(payload).cashReceived, (payload.paymentDetails as { changeGiven?: unknown } | undefined)?.changeGiven ?? normalizeCashSale(payload).changeGiven, payload.paymentDetails ? JSON.stringify(payload.paymentDetails) : null])
      for (const item of Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : []) {
        const product = await db.query('SELECT name, cost_price AS cost FROM products WHERE id = ?', [item.productId])
        await db.run('INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?)', [id(), payload.id, item.productId, product.values?.[0]?.name || 'Product', Number(item.quantity), Number(item.price), Number(product.values?.[0]?.cost) || 0])
        await db.run('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?', [Number(item.quantity), item.productId])
      }
    }
  } else if (operation.entityType === 'customer' && operation.action === 'upsert') {
    await db.run('INSERT INTO customers (id, name, phone, balance) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, phone=excluded.phone', [payload.id, payload.name, payload.phone || '', Number(payload.balance) || 0])
  } else if (operation.entityType === 'wallet' && operation.action === 'adjust') {
    const customer = await db.query('SELECT id FROM customers WHERE id = ?', [payload.customerId])
    if (customer.values?.length) {
      await db.run('UPDATE customers SET balance = ROUND(balance + ?, 2) WHERE id = ?', [Number(payload.amount) || 0, payload.customerId])
      await db.run('INSERT INTO wallet_transactions (id, customer_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)', [id(), payload.customerId, Number(payload.amount) || 0, payload.reason || 'remote-wallet', payload.createdAt || operation.createdAt])
    } else throw new Error('A wallet change references a missing customer.')
  } else if (operation.entityType === 'expense' && operation.action === 'create') {
    await db.run('INSERT OR IGNORE INTO expenses (id, category, description, amount, incurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?)', [payload.id, payload.category, payload.description, Number(payload.amount) || 0, payload.incurredAt || operation.createdAt, payload.createdAt || operation.createdAt])
  } else if (operation.entityType === 'stocktake' && operation.action === 'approved') {
    for (const count of (payload.counts || []) as Array<Record<string, unknown>>) {
      const amount = Number(count.variance) || 0
      if (!amount) continue
      if (!(await db.query('SELECT id FROM products WHERE id = ?', [count.productId])).values?.length) throw new Error('A stocktake references a missing product.')
      await db.run('UPDATE products SET stock = MAX(0, stock + ?), updated_at = ? WHERE id = ?', [amount, operation.createdAt, count.productId])
      await db.run('INSERT INTO inventory_movements (id, product_id, quantity, reason, created_at) VALUES (?, ?, ?, ?, ?)', [id(), count.productId, amount, `Stocktake: ${payload.approvalReason || 'approved'}`, operation.createdAt])
    }
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
  if (!config) return { configured: false, pending: 0, lastError: 'This browser has not been enrolled.' }
  const db = await openMobileDatabase()
  try {
    while (true) {
    const pending = await db.query('SELECT operation_id AS operationId, entity_type AS entityType, entity_id AS entityId, action, payload, created_at AS createdAt FROM sync_outbox WHERE synced_at IS NULL ORDER BY created_at, rowid LIMIT 500')
    const operations: Operation[] = (pending.values || []).map((row) => ({ ...row, payload: JSON.parse(String(row.payload)) })) as Operation[]
    if (!operations.length) break
    {
      const response = await originalFetch(`${config.syncApiUrl}/v1/sync/push`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.deviceToken}` }, body: JSON.stringify({ businessId: config.businessId, deviceId: config.deviceId, operations }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Cloud push failed.')
      for (const conflict of result.conflicts || []) {
        const operation = operations.find(item => item.operationId === conflict.operationId)
        if (operation) await db.run('INSERT OR IGNORE INTO sync_conflicts (id, operation_id, entity_type, entity_id, reason, local_payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [conflict.operationId, conflict.operationId, operation.entityType, operation.entityId, conflict.reason || 'Concurrent edit', JSON.stringify(operation.payload), now()])
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
    let cursor = await setting('syncCursor')
    let more = true
    while (more) {
    const response = await originalFetch(`${config.syncApiUrl}/v1/sync/pull?businessId=${encodeURIComponent(config.businessId)}&deviceId=${encodeURIComponent(config.deviceId)}&cursor=${encodeURIComponent(cursor)}`, { headers: { Authorization: `Bearer ${config.deviceToken}` } })
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
  const current = (await db.query('SELECT app_name AS appName, currency, pos_provider AS posProvider, pos_terminal_id AS posTerminalId, pos_connection AS posConnection, logo_data AS logoData, payment_policy AS paymentPolicy, updated_at AS updatedAt FROM app_settings WHERE id = 1')).values?.[0]
  if (current?.appName && current?.currency && !(current.appName === 'My Business' && current.currency === 'USD')) return current
  if (config) {
    await pullLatest(config)
    const synced = (await db.query('SELECT app_name AS appName, currency, pos_provider AS posProvider, pos_terminal_id AS posTerminalId, pos_connection AS posConnection, logo_data AS logoData, payment_policy AS paymentPolicy, updated_at AS updatedAt FROM app_settings WHERE id = 1')).values?.[0]
    if (synced?.appName && synced?.currency && !(synced.appName === 'My Business' && synced.currency === 'USD')) return synced
    // A repaired/cleared local database can retain a sync cursor but lose the
    // old settings operation. Recover the latest business settings directly.
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
  const conflicts = await db.query('SELECT COUNT(*) AS count FROM sync_conflicts WHERE resolved_at IS NULL')
  return { configured: Boolean(config), pending: Number(pending.values?.[0]?.count || 0), conflicts: Number(conflicts.values?.[0]?.count || 0), lastError: config ? await setting('lastSyncError') : 'This browser has not been enrolled.' }
}

async function cloudRequest(path: string, init: RequestInit = {}) {
  const config = await getMobileSyncConfiguration()
  const token = await setting('cloudAccessToken')
  if (!config || !token) throw new Error('Connect to the internet and sign in again to manage staff.')
  const response = await originalFetch(`${config.syncApiUrl}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}), Authorization: `Bearer ${token}` } })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Cloud request failed.')
  return result
}

function reportWindow(sales: Array<Record<string, unknown>>, since: number) {
  const selected = sales.filter((sale) => new Date(String(sale.createdAt)).getTime() >= since)
  return { total: selected.reduce((sum, sale) => sum + Number(sale.total || 0), 0), count: selected.length }
}

export async function handleBrowserApi(path: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase()
  // Logout must also clear stale sessions whose user record no longer exists.
  // Device enrollment lives in separate settings and is preserved.
  if (path === '/api/auth/logout' && method === 'POST') {
    await setSetting('sessionUserId', '')
    await setSetting('cloudAccessToken', '')
    return json({})
  }
  if (path === '/api/auth/login') return error('Use cloud sign-in on this device.', 401)
  if (['/api/auth/password-reset/request', '/api/auth/password-reset/confirm'].includes(path) && method === 'POST') {
    return originalFetch(`${cloudUrl}${path.replace('/api/', '/v1/')}`, { method, headers: { 'Content-Type': 'application/json' }, body: init?.body })
  }
  const user = await sessionUser() || await restoreCloudSession()
  const db = await openMobileDatabase()
  if (path === '/api/health') return json({ ok: true, storage: 'Browser SQLite / IndexedDB' })
  if (path === '/api/settings' && method === 'GET') {
    const config = await getMobileSyncConfiguration()
    const row = await hydrateBusinessSettings(config)
    return json({ ...row, paymentPolicy: paymentPolicy(row?.paymentPolicy), ownerConfigured: Boolean((await db.query('SELECT id FROM users LIMIT 1')).values?.length), cloudConfigured: Boolean(config), existingBusiness: Boolean(config) })
  }
  if (path === '/api/installer/activate' && method === 'POST') {
    const input = await body(init)
    if (input.mode !== 'existing') return error('Browser devices must join an existing business using an owner account.')
    if (await getMobileSyncConfiguration()) return error('This browser is already enrolled. Sign in to continue.', 409)
    const cloud = cloudUrl
    const login = await originalFetch(`${cloud}/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: input.ownerEmail, password: input.ownerPassword }) })
    const account = await login.json(); if (!login.ok || account.account?.role !== 'owner') return error(account.error || 'Only a business owner can enroll this browser.')
    const enrolled = await originalFetch(`${cloud}/v1/devices/enroll`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.accessToken}` }, body: JSON.stringify({ deviceId: input.deviceId, label: input.label }) })
    const device = await enrolled.json(); if (!enrolled.ok) return error(device.error || 'Could not enroll this browser.')
    await saveMobileSyncConfiguration({ syncApiUrl: cloud, businessId: device.businessId, deviceId: device.deviceId, deviceToken: device.deviceToken })
    await setSetting('deviceLabel', String(input.label || input.deviceId))
    return json({ configured: true, existingBusiness: true }, 201)
  }
  if (path === '/api/auth/cloud-session' && method === 'POST') {
    const input = await body(init); let config = await getMobileSyncConfiguration()
    const syncApiUrl = config?.syncApiUrl || cloudUrl
    const identifier = String(input.identifier || input.email || '').trim()
    const response = await originalFetch(`${syncApiUrl}/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(identifier.includes('@') ? { email: identifier, password: input.password } : { username: identifier, password: input.password }) })
    const result = await response.json(); if (!response.ok) return error(result.error || 'Email or password is incorrect.', response.status)
    const account = result.account
    if (!config && account.role !== 'owner') return error('An owner must sign in on this browser once before staff can use it.', 403)
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
    const localId = account.id || id(); const localUser: MobileUser = { id: localId, name: account.name, email: account.email || `${localId}@staff.local.invalid`, role: account.role, operationalAccess: Boolean(account.operationalAccess), organizationId: config.businessId }
    await db.run('INSERT INTO users (id, name, email, role, operational_access, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET id=excluded.id, name=excluded.name, role=excluded.role, operational_access=excluded.operational_access', [localUser.id, localUser.name, localUser.email, localUser.role, localUser.operationalAccess ? 1 : 0, now()])
    const stored = (await db.query('SELECT id, name, email, role, operational_access AS operationalAccess FROM users WHERE email = ?', [localUser.email])).values?.[0]
    await setSetting('sessionUserId', String(stored.id))
    await setSetting('cloudAccessToken', String(result.accessToken))
    const pulled = await pullLatest(config)
    await setSetting('lastSyncError', pulled.lastError)
    const initialized = await hydrateBusinessSettings(config)
    await db.run('INSERT INTO app_settings (id, app_name, currency, pos_provider, pos_terminal_id, pos_connection, logo_data, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET app_name=excluded.app_name, currency=excluded.currency, pos_provider=excluded.pos_provider, pos_terminal_id=excluded.pos_terminal_id, pos_connection=excluded.pos_connection, logo_data=excluded.logo_data, updated_at=excluded.updated_at', [initialized.appName || 'My Business', initialized.currency || 'USD', initialized.posProvider || '', initialized.posTerminalId || '', initialized.posConnection || 'manual', initialized.logoData || '', initialized.updatedAt || now()])
    return json({ token: id(), user: { ...stored, operationalAccess: Boolean(stored.operationalAccess), organizationId: config.businessId }, cloudAccessToken: result.accessToken })
  }
  if (!user) return error('Authentication required.', 401)
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
  if ((path === '/api/sync/pull' || path === '/api/sync/now') && method === 'POST') {
    const status = path === '/api/sync/pull' ? await pullLatest() : await syncNow()
    await setSetting('lastSyncError', status.lastError)
    return json(status)
  }
  if (path === '/api/products' && method === 'GET') return json({ products: (await db.query('SELECT id, name, sku, barcode, category, stock, reorder_point AS reorder, price, cost_price AS cost, unit, updated_at AS updated FROM products ORDER BY updated_at DESC')).values || [] })
  if (path === '/api/products' && method === 'POST') {
    if (!canOperate(user)) return error('Operational access is required.', 403)
    const input = await body(init); const name = String(input.name || '').trim(); const product = { id: id(), name, sku: String(input.sku || '').trim() || `${name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 24).toUpperCase() || 'PRODUCT'}-${crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`, barcode: String(input.barcode || '').trim(), category: String(input.category || '').trim(), stock: Number(input.stock), reorder: Number(input.reorder), price: Number(input.price), cost: Number(input.cost || 0), unit: String(input.unit || '').trim(), updated: now() }
    if (!product.name || !product.sku || !product.category || !product.unit || [product.stock, product.reorder, product.price, product.cost].some((value) => !Number.isFinite(value) || value < 0)) return error('Product fields are invalid.')
    await db.run('INSERT INTO products (id, name, sku, barcode, category, stock, reorder_point, price, cost_price, unit, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [product.id, product.name, product.sku, product.barcode, product.category, product.stock, product.reorder, product.price, product.cost, product.unit, product.updated])
    await queue('product', product.id, 'upsert', product)
    return json(product, 201)
  }
  const stock = path.match(/^\/api\/products\/([^/]+)\/stock$/)
  if (stock && method === 'POST') {
    if (!canOperate(user)) return error('Operational access is required.', 403)
    const input = await body(init); const amount = Number(input.amount); if (!Number.isInteger(amount) || amount === 0) return error('Stock amount must be a non-zero integer.')
    const product = (await db.query('SELECT id, stock FROM products WHERE id = ?', [stock[1]])).values?.[0]; if (!product || Number(product.stock) + amount < 0) return error('Stock cannot be negative.')
    const updated = now(); await db.run('UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?', [amount, updated, stock[1]]); await db.run('INSERT INTO inventory_movements (id, product_id, quantity, reason, created_at) VALUES (?, ?, ?, ?, ?)', [id(), stock[1], amount, 'manual-adjustment', updated]); await queue('stock', stock[1], 'adjust', { productId: stock[1], amount, reason: 'manual-adjustment', updatedAt: updated })
    return json((await db.query('SELECT id, name, sku, category, stock, reorder_point AS reorder, price, cost_price AS cost, unit, updated_at AS updated FROM products WHERE id = ?', [stock[1]])).values?.[0])
  }
  if (path === '/api/sales' && method === 'POST') {
    let sale = await body(init); if (sale.paymentMethod === 'wallet' && (sale.paymentDetails as { creditApproved?: boolean } | undefined)?.creditApproved && user.role !== 'owner') return error('Only the owner may approve credit purchases.', 403); try { sale = sale.paymentDetails ? recordPayment(sale, (await db.query('SELECT payment_policy FROM app_settings WHERE id = 1')).values?.[0]?.payment_policy) : normalizeCashSale(sale) } catch (caught) { return error(caught instanceof Error ? caught.message : 'Invalid cash amount.') }; if (!sale.id || !Array.isArray(sale.items) || !Number.isFinite(Number(sale.total))) return error('Sale is invalid.')
    if ((await db.query('SELECT id FROM sales WHERE id = ?', [sale.id])).values?.length) return json({ ...sale, syncStatus: 'pending' })
    if (!sale.items.length || sale.items.some((item: Record<string, unknown>) => !Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0 || !Number.isFinite(Number(item.price)) || Number(item.price) < 0)) return error('Sale quantities and prices are invalid.')
    const total = sale.items.reduce((sum: number, item: Record<string, unknown>) => sum + Number(item.quantity) * Number(item.price), 0)
    if (Math.abs(total - Number(sale.total)) > 0.01) return error('Sale total does not match its items.')
    if (sale.paymentMethod === 'wallet' && !(sale.paymentDetails as { customerId?: unknown } | undefined)?.customerId) return error('Select the customer wallet.')
    if ((await db.query('SELECT id FROM sales WHERE id = ?', [sale.id])).values?.length) return json({ ...sale, syncStatus: 'synced' })
    await db.beginTransaction(); try { if (sale.paymentMethod === 'wallet') await debitSaleWallet(db, sale); await db.run('INSERT INTO sales (id, total, payment_method, payment_reference, terminal_provider, staff_id, staff_name, created_at, cash_received, change_given, payment_details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [sale.id, Number(sale.total), sale.paymentMethod || 'cash', sale.paymentReference || '', sale.terminalProvider || '', user.id, user.name, sale.createdAt || now(), sale.cashReceived ?? null, sale.changeGiven ?? null, sale.paymentDetails ? JSON.stringify(sale.paymentDetails) : null]); for (const item of sale.items as Array<Record<string, unknown>>) { const product = (await db.query('SELECT name, stock, cost_price AS cost FROM products WHERE id = ?', [item.productId])).values?.[0]; if (!product || Number(product.stock) < Number(item.quantity)) throw new Error('Insufficient stock for sale.'); await db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [Number(item.quantity), item.productId]); await db.run('INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price, unit_cost) VALUES (?, ?, ?, ?, ?, ?, ?)', [id(), sale.id, item.productId, product.name, Number(item.quantity), Number(item.price), Number(product.cost) || 0]) } await db.commitTransaction() } catch (caught) { await db.rollbackTransaction(); return error(caught instanceof Error ? caught.message : 'Could not save sale.') }
    const payload = { ...sale, staffId: user.id, staffName: user.name }; await queue('sale', String(sale.id), 'create', payload); return json({ ...payload, syncStatus: 'pending' }, 201)
  }
  if (path === '/api/sales' && method === 'GET') {
    if (!canOperate(user)) return error('Operational access is required.', 403)
    const sales = (await db.query('SELECT id, total, payment_method AS paymentMethod, payment_reference AS paymentReference, terminal_provider AS terminalProvider, cash_received AS cashReceived, change_given AS changeGiven, payment_details AS paymentDetails, staff_name AS staffName, created_at AS createdAt FROM sales ORDER BY created_at DESC')).values || []
    for (const sale of sales) sale.paymentDetails = sale.paymentDetails ? JSON.parse(String(sale.paymentDetails)) : undefined
    for (const sale of sales) sale.items = (await db.query('SELECT product_id AS productId, product_name AS productName, quantity, unit_price AS unitPrice FROM sale_items WHERE sale_id = ?', [sale.id])).values || []
    return json({ sales })
  }
  if (path === '/api/movements' && method === 'GET') {
    if (!canOperate(user)) return error('Operational access is required.', 403)
    return json({ movements: (await db.query('SELECT m.id, p.name AS productName, p.sku, m.quantity, m.reason, m.created_at AS createdAt FROM inventory_movements m JOIN products p ON p.id = m.product_id ORDER BY m.created_at DESC')).values || [] })
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
    return json({ expenses: (await db.query('SELECT id, category, description, amount, incurred_at AS incurredAt, created_at AS createdAt FROM expenses ORDER BY incurred_at DESC')).values || [] })
  }
  if (path === '/api/expenses' && method === 'POST') {
    if (!isManager(user)) return error('Owner or admin access required.', 403)
    const input = await body(init); const expense = { id: id(), category: String(input.category || '').trim(), description: String(input.description || '').trim(), amount: Number(input.amount), incurredAt: String(input.incurredAt || now()), createdAt: now() }
    if (!expense.category || !expense.description || !Number.isFinite(expense.amount) || expense.amount <= 0) return error('Expense category, description, and a positive amount are required.')
    await db.run('INSERT INTO expenses (id, category, description, amount, incurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?)', [expense.id, expense.category, expense.description, expense.amount, expense.incurredAt, expense.createdAt]); await queue('expense', expense.id, 'create', expense); return json(expense, 201)
  }
  if (path === '/api/reports' && method === 'GET') {
    if (!isManager(user)) return error('Owner or admin access required.', 403)
    const sales = (await db.query('SELECT total, created_at AS createdAt FROM sales')).values || []; const items = (await db.query('SELECT quantity, unit_price AS unitPrice, unit_cost AS unitCost FROM sale_items')).values || []; const products = (await db.query('SELECT stock, reorder_point AS reorder, price FROM products')).values || []; const expenses = (await db.query('SELECT amount FROM expenses')).values || []
    const today = new Date(); today.setHours(0, 0, 0, 0); const week = new Date(today); week.setDate(today.getDate() - 6); const month = new Date(today.getFullYear(), today.getMonth(), 1)
    const revenue = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0); const cost = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0), 0); const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
    return json({ daily: reportWindow(sales, today.getTime()), weekly: reportWindow(sales, week.getTime()), monthly: reportWindow(sales, month.getTime()), inventory: { value: products.reduce((sum, product) => sum + Number(product.stock || 0) * Number(product.price || 0), 0), products: products.length, lowStock: products.filter((product) => Number(product.stock) <= Number(product.reorder)).length }, profit: { revenue, cost, expenses: expenseTotal, amount: revenue - cost - expenseTotal } })
  }
  if (path === '/api/reports/sales.csv' && method === 'GET') {
    if (!isManager(user)) return error('Owner or admin access required.', 403)
    const rows = (await db.query('SELECT id, created_at, total, payment_method, staff_name FROM sales ORDER BY created_at DESC')).values || []
    const cell = (value: unknown) => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`
    const csv = [['ID', 'Date', 'Total', 'Payment', 'Staff'], ...rows.map(row => [row.id, row.created_at, row.total, row.payment_method, row.staff_name])].map(row => row.map(cell).join(',')).join('\r\n')
    return new Response(csv, { headers: { 'Content-Type': 'text/csv;charset=utf-8' } })
  }
  if (path === '/api/users' && method === 'GET') {
    if (user.role !== 'owner') return error('Owner access required.', 403)
    try { const result = await cloudRequest('/v1/staff'); for (const account of result.users || []) await db.run('INSERT INTO users (id, name, email, role, operational_access, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, email=excluded.email, role=excluded.role, operational_access=excluded.operational_access', [account.id, account.name, account.email, account.role, account.operationalAccess ? 1 : 0, String(account.createdAt || now())]); return json({ users: result.users || [] }) } catch (caught) { return error(caught instanceof Error ? caught.message : 'Could not load staff.', 503) }
  }
  if (path === '/api/users' && method === 'POST') {
    if (user.role !== 'owner') return error('Owner access required.', 403)
    try { const input = await body(init); const result = await cloudRequest('/v1/staff', { method: 'POST', body: JSON.stringify(input) }); const account = result.account; await db.run('INSERT INTO users (id, name, email, role, operational_access, created_at) VALUES (?, ?, ?, ?, ?, ?)', [account.id, account.name, account.email || `${account.id}@staff.local.invalid`, account.role, account.operationalAccess ? 1 : 0, now()]); return json(account, 201) } catch (caught) { return error(caught instanceof Error ? caught.message : 'Could not create staff.', 400) }
  }
  const staffAccess = path.match(/^\/api\/users\/([^/]+)\/operational-access$/)
  if (staffAccess && method === 'PUT') {
    if (user.role !== 'owner') return error('Owner access required.', 403)
    try { const input = await body(init); const result = await cloudRequest(`/v1/staff/${encodeURIComponent(staffAccess[1])}/operational-access`, { method: 'PUT', body: JSON.stringify({ enabled: input.enabled === true }) }); const account = result.account; await db.run('UPDATE users SET operational_access = ? WHERE id = ?', [account.operationalAccess ? 1 : 0, account.id]); return json(account) } catch (caught) { return error(caught instanceof Error ? caught.message : 'Could not update cashier access.', 400) }
  }
  const staffPassword = path.match(/^\/api\/users\/([^/]+)\/password$/)
  if (staffPassword && method === 'PUT') {
    if (user.role !== 'owner') return error('Only the owner can reset a cashier password.', 403)
    try { const input = await body(init); const result = await cloudRequest(`/v1/staff/${encodeURIComponent(staffPassword[1])}/password`, { method: 'PUT', body: JSON.stringify({ password: input.password }) }); return json(result.account) } catch (caught) { return error(caught instanceof Error ? caught.message : 'Could not reset cashier password.', 400) }
  }
  if (path === '/api/settings' && method === 'PUT') {
    if (user.role !== 'owner') return error('Only the owner can change business settings.', 403)
    const input = await body(init); const appName = String(input.appName || '').trim(); const currency = String(input.currency || '').toUpperCase(); const posConnection = String(input.posConnection || 'manual'); const logoData = String(input.logoData || '')
    if (!appName || appName.length > 60 || !/^[A-Z]{3}$/.test(currency) || !['manual', 'usb', 'bluetooth', 'network', 'sdk'].includes(posConnection) || (logoData && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(logoData) || logoData.length > 1_400_000))) return error('Business settings are invalid.')
    const updatedAt = now(); const settings = { appName, currency, posProvider: String(input.posProvider || ''), posTerminalId: String(input.posTerminalId || ''), posConnection, logoData, updatedAt }; await db.run('INSERT INTO app_settings (id, app_name, currency, pos_provider, pos_terminal_id, pos_connection, logo_data, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET app_name=excluded.app_name, currency=excluded.currency, pos_provider=excluded.pos_provider, pos_terminal_id=excluded.pos_terminal_id, pos_connection=excluded.pos_connection, logo_data=excluded.logo_data, updated_at=excluded.updated_at', [appName, currency, settings.posProvider, settings.posTerminalId, posConnection, logoData, updatedAt]); const policy = paymentPolicy(input.paymentPolicy ?? (await db.query('SELECT payment_policy FROM app_settings WHERE id = 1')).values?.[0]?.payment_policy); await db.run('UPDATE app_settings SET payment_policy = ? WHERE id = 1', [JSON.stringify(policy)]); await queue('settings', 'business', 'upsert', { ...settings, paymentPolicy: policy }); return json({ ...settings, paymentPolicy: policy })
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
