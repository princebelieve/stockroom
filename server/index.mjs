import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createProduct, adjustStock, createSale, getSettings, listProducts, updateSettings, storageName } from './repository.mjs'
import { authenticateUser, adjustCustomerWallet, approveStocktake, changePassword, createBackup, createCustomer, createExpense, createOwnerSetup, createSession, createStocktake, createUser, deleteSession, exportSalesCsv, getOwnerMetrics, getReports, getStocktake, listCustomers, listExpenses, listMovements, listSales, listSyncConflicts, listUsers, provisionCloudUser, resetCashierPassword, resolveSyncConflict, sessionUser as savedSessionUser, setCashierOperationalAccess, updateStocktakeCount, updateUserRole } from './repository.mjs'
import { getCloudConfiguration, getSubscriptionAccess, pullLatest, saveCloudConfiguration, startSyncWorker, syncConfigurationStatus, syncNow } from './sync.mjs'
import { createDisplayPairing, getCustomerDisplay, setCustomerDisplay, startCustomerDisplayGateway } from './customer-display.mjs'
import { cloudCreateStaff, cloudEnrollDevice, cloudEnrollDeviceAsInstaller, cloudLogin, cloudLoginAt, cloudOwnerForBusiness, cloudPasswordResetConfirm, cloudPasswordResetRequest, cloudRegister, cloudResetCashierPassword, cloudSetCashierOperationalAccess, getDefaultCloudApiUrl } from './cloud-auth.mjs'

const port = Number(process.env.PORT || 8787)
const customerDisplayPort = Number(process.env.CUSTOMER_DISPLAY_PORT || 8788)
const distDirectory = join(fileURLToPath(new URL('..', import.meta.url)), 'dist')
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' }
const generatedDeviceId = () => `desktop-${randomUUID()}`

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
  response.end(JSON.stringify(payload))
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' })
    return response.end()
  }

  if (request.method === 'GET' && request.url === '/api/health') {
    return sendJson(response, 200, { ok: true, storage: storageName })
  }

  if (request.method === 'GET' && request.url === '/api/subscriptions/access') {
    if (!sessionUser(request)) return sendJson(response, 401, { error: 'Authentication required.' })
    return sendJson(response, 200, await getSubscriptionAccess(request.headers['x-subscription-refresh'] === 'true'))
  }

  if (request.method === 'POST' && request.url === '/api/setup') {
    return readJson(request, response, async (input) => {
      if ((await getSettings()).ownerConfigured) return sendJson(response, 403, { error: 'This installation already has an owner account.' })
      const result = await createOwnerSetup({
        appName: String(input.appName || '').trim(),
        ownerName: String(input.ownerName || '').trim(),
        email: String(input.email || '').trim(),
        password: String(input.password || ''),
      })
      const user = await authenticateUser(String(input.email || '').trim(), String(input.password || ''))
      const token = createSession(user.id)
      return sendJson(response, 200, { token, user, setup: result })
    })
  }

  if (request.method === 'POST' && request.url === '/api/auth/login') {
    return readJson(request, response, async (input) => {
      const user = await authenticateUser(String(input.identifier || input.email || '').trim(), String(input.password || ''))
      if (!user) return sendJson(response, 401, { error: 'Email or password is incorrect.' })
      const token = createSession(user.id)
      return sendJson(response, 200, { token, user })
    })
  }

  // Desktop identity lives in its local SQLite session table. The UI asks this
  // endpoint on startup so it does not guess from an old localStorage copy.
  if (request.method === 'GET' && request.url === '/api/auth/session') {
    const user = sessionUser(request)
    if (!user) return sendJson(response, 401, { error: 'No saved local session.' })
    return sendJson(response, 200, { user })
  }

  if (request.method === 'POST' && request.url === '/api/auth/logout') {
    const token = request.headers.authorization?.replace('Bearer ', '')
    deleteSession(token)
    return sendJson(response, 204, {})
  }

  if (request.method === 'PUT' && request.url === '/api/auth/password') {
    const token = request.headers.authorization?.replace('Bearer ', '')
    const user = savedSessionUser(token)
    if (!user) return sendJson(response, 401, { error: 'Authentication required.' })
    return readJson(request, response, async (input) => {
      try {
        const result = await changePassword(user.id, String(input.currentPassword || ''), String(input.newPassword || ''))
        return sendJson(response, 200, result)
      } catch (error) {
        return sendJson(response, 400, { error: error.message })
      }
    })
  }

  if (request.method === 'GET' && request.url === '/api/owner/metrics') {
    const user = sessionUser(request)
    if (!user || !['owner', 'admin'].includes(user.role)) return sendJson(response, 403, { error: 'Admin access required.' })
    return sendJson(response, 200, await getOwnerMetrics())
  }

  if (request.method === 'GET' && request.url === '/api/customers') {
    if (!canOperate(sessionUser(request))) return sendJson(response, 403, { error: 'Operational access is required.' })
    return sendJson(response, 200, { customers: await listCustomers() })
  }
  if (request.method === 'POST' && request.url === '/api/customers') return readJson(request, response, async (input) => {
    if (!canOperate(sessionUser(request))) return sendJson(response, 403, { error: 'Operational access is required.' })
    try { return sendJson(response, 201, await createCustomer(input)) } catch (error) { return sendJson(response, 400, { error: error.message }) }
  })
  if (request.method === 'GET' && request.url === '/api/sales') {
    if (!canOperate(sessionUser(request))) return sendJson(response, 403, { error: 'Operational access is required.' })
    return sendJson(response, 200, { sales: await listSales() })
  }
  if (request.method === 'GET' && request.url === '/api/expenses') {
    if (!isManager(sessionUser(request))) return sendJson(response, 403, { error: 'Owner or admin access required.' })
    return sendJson(response, 200, { expenses: await listExpenses() })
  }
  if (request.method === 'POST' && request.url === '/api/expenses') {
    const user = sessionUser(request)
    if (!isManager(user)) return sendJson(response, 403, { error: 'Owner or admin access required.' })
    return readJson(request, response, async (input) => { try { return sendJson(response, 201, await createExpense(input)) } catch (error) { return sendJson(response, 400, { error: error.message }) } })
  }

  if (request.method === 'POST' && request.url === '/api/auth/cloud-session') return readJson(request, response, async (input) => {
    try {
      const password = String(input.password || '')
      const remote = await cloudLogin(String(input.identifier || input.email || ''), password)
      const configured = await getCloudConfiguration()
      if (configured.businessId && remote.account?.businessId !== configured.businessId) throw new Error('This account belongs to a different business than this enrolled device.')
      const user = provisionCloudUser({ ...remote.account, password })
      const token = createSession(user.id)
      return sendJson(response, 200, { token, user, cloudAccessToken: remote.accessToken })
    } catch (error) { return sendJson(response, 400, { error: error.message }) }
  })
  if (request.method === 'POST' && request.url === '/api/auth/cloud-register') return readJson(request, response, async (input) => {
    try { return sendJson(response, 201, await cloudRegister(input)) } catch (error) { return sendJson(response, 400, { error: error.message }) }
  })
  if (request.method === 'POST' && request.url === '/api/auth/password-reset/request') return readJson(request, response, async (input) => {
    try { return sendJson(response, 202, await cloudPasswordResetRequest(String(input.email || ''))) } catch (error) { return sendJson(response, 400, { error: error.message }) }
  })
  if (request.method === 'POST' && request.url === '/api/auth/password-reset/confirm') return readJson(request, response, async (input) => {
    try { return sendJson(response, 200, await cloudPasswordResetConfirm(String(input.token || ''), String(input.password || ''))) } catch (error) { return sendJson(response, 400, { error: error.message }) }
  })
  if (request.method === 'GET' && request.url === '/api/movements') {
    if (!canOperate(sessionUser(request))) return sendJson(response, 403, { error: 'Operational access is required.' })
    return sendJson(response, 200, { movements: await listMovements() })
  }
  if (request.method === 'POST' && request.url === '/api/backups') {
    const user = sessionUser(request)
    if (!user || !['owner', 'admin'].includes(user.role)) return sendJson(response, 403, { error: 'Owner or admin access is required.' })
    return sendJson(response, 201, await createBackup())
  }
  if (request.method === 'GET' && request.url === '/api/reports') {
    const user = sessionUser(request)
    if (!user || !['owner', 'admin'].includes(user.role)) return sendJson(response, 403, { error: 'Owner or admin access required.' })
    return sendJson(response, 200, await getReports())
  }
  if (request.method === 'GET' && request.url === '/api/reports/sales.csv') {
    const user = sessionUser(request)
    if (!user || !['owner', 'admin'].includes(user.role)) return sendJson(response, 403, { error: 'Owner or admin access required.' })
    response.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="stockroom-sales.csv"' })
    return response.end(await exportSalesCsv())
  }
  if (request.method === 'GET' && request.url === '/api/customer-display') {
    if (!sessionUser(request)) return sendJson(response, 401, { error: 'Authentication required.' })
    return sendJson(response, 200, getCustomerDisplay())
  }
  if (request.method === 'PUT' && request.url === '/api/customer-display') return readJson(request, response, async (input) => {
    if (!sessionUser(request)) return sendJson(response, 401, { error: 'Authentication required.' })
    return sendJson(response, 200, setCustomerDisplay(input))
  })
  if (request.method === 'POST' && request.url === '/api/customer-display/pair') {
    const user = sessionUser(request)
    if (!user || !['owner', 'admin', 'cashier'].includes(user.role)) return sendJson(response, 403, { error: 'Authenticated staff access required.' })
    return sendJson(response, 201, createDisplayPairing(customerDisplayPort))
  }

  if (request.method === 'GET' && request.url === '/api/users') {
    const user = sessionUser(request)
    if (!user || user.role !== 'owner') return sendJson(response, 403, { error: 'Owner access required.' })
    return sendJson(response, 200, { users: await listUsers() })
  }
  if (request.method === 'POST' && request.url === '/api/users') {
    const user = sessionUser(request)
    if (!user || user.role !== 'owner') return sendJson(response, 403, { error: 'Owner access required.' })
    return readJson(request, response, async (input) => {
      try {
        const configured = await getCloudConfiguration()
        await cloudOwnerForBusiness(String(input.cloudAccessToken || ''), configured.businessId)
        const cloud = await cloudCreateStaff(String(input.cloudAccessToken || ''), input)
        return sendJson(response, 201, await createUser({ ...input, id: cloud.account.id, createdAt: cloud.account.createdAt || new Date().toISOString() }))
      } catch (error) { return sendJson(response, 400, { error: error.message }) }
    })
  }
  const userRoleMatch = request.url?.match(/^\/api\/users\/([^/]+)\/role$/)
  if (request.method === 'PUT' && userRoleMatch) {
    const user = sessionUser(request)
    if (!user || user.role !== 'owner') return sendJson(response, 403, { error: 'Owner access required.' })
    return readJson(request, response, async (input) => {
      try {
        const nextRole = String(input.role || '').trim().toLowerCase()
        if (!['admin', 'cashier'].includes(nextRole)) throw new Error('Role must be admin or cashier.')
        const operationalAccess = nextRole === 'admin' ? Boolean(input.operationalAccess ?? true) : Boolean(input.operationalAccess ?? false)
        return sendJson(response, 200, updateUserRole(userRoleMatch[1], nextRole, operationalAccess))
      } catch (error) { return sendJson(response, 400, { error: error.message }) }
    })
  }
  const cashierAccessMatch = request.url?.match(/^\/api\/users\/([^/]+)\/operational-access$/)
  if (request.method === 'PUT' && cashierAccessMatch) {
    const user = sessionUser(request)
    if (!user || user.role !== 'owner') return sendJson(response, 403, { error: 'Owner access required.' })
    return readJson(request, response, async (input) => {
      try {
        const configured = await getCloudConfiguration()
        await cloudOwnerForBusiness(String(input.cloudAccessToken || ''), configured.businessId)
        const cloud = await cloudSetCashierOperationalAccess(String(input.cloudAccessToken || ''), cashierAccessMatch[1], input.enabled === true)
        return sendJson(response, 200, setCashierOperationalAccess(cashierAccessMatch[1], cloud.account.operationalAccess === true))
      } catch (error) { return sendJson(response, 400, { error: error.message }) }
    })
  }
  const cashierPasswordMatch = request.url?.match(/^\/api\/users\/([^/]+)\/password$/)
  if (request.method === 'PUT' && cashierPasswordMatch) {
    const user = sessionUser(request)
    if (!user || user.role !== 'owner') return sendJson(response, 403, { error: 'Only the owner can reset a cashier password.' })
    return readJson(request, response, async (input) => {
      try {
        const password = String(input.password || '')
        const configured = await getCloudConfiguration()
        await cloudOwnerForBusiness(String(input.cloudAccessToken || ''), configured.businessId)
        await cloudResetCashierPassword(String(input.cloudAccessToken || ''), cashierPasswordMatch[1], password)
        return sendJson(response, 200, resetCashierPassword(cashierPasswordMatch[1], password))
      } catch (error) { return sendJson(response, 400, { error: error.message }) }
    })
  }
  if (request.method === 'POST' && request.url === '/api/installer/activate') {
    if ((await getSettings()).ownerConfigured) return sendJson(response, 403, { error: 'This installation has already been handed over to its owner.' })
    return readJson(request, response, async (input) => {
      try {
        const existingBusiness = input.mode === 'existing'
        const remote = existingBusiness ? await cloudLoginAt('', String(input.ownerEmail || ''), String(input.ownerPassword || '')) : null
        const businessId = existingBusiness ? String(remote?.account?.businessId || '') : String(input.businessId || '').trim()
        if (remote && remote.account?.role !== 'owner') throw new Error('Only a business owner can add another device.')
        const syncApiUrl = existingBusiness ? remote.syncApiUrl : getDefaultCloudApiUrl()
        const deviceId = generatedDeviceId()
        const enrolled = existingBusiness
          ? await cloudEnrollDevice(syncApiUrl, remote.accessToken, { deviceId, label: input.label })
          : await cloudEnrollDeviceAsInstaller(syncApiUrl, String(input.adminApiKey || ''), { businessId, deviceId, label: input.label, expiresInDays: 365 })
        const configuration = await saveCloudConfiguration({ syncApiUrl, businessId: enrolled.businessId, deviceId: enrolled.deviceId, deviceToken: enrolled.deviceToken, existingBusiness })
        return sendJson(response, 201, { ...configuration, configured: true, existingBusiness })
      } catch (error) { return sendJson(response, 400, { error: error.message }) }
    })
  }
  if (request.method === 'GET' && request.url === '/api/sync/status') return sendJson(response, 200, await syncConfigurationStatus())
  if (request.method === 'GET' && request.url === '/api/sync/conflicts') {
    const user = sessionUser(request)
    if (!user || !['owner', 'admin'].includes(user.role)) return sendJson(response, 403, { error: 'Owner or admin access required.' })
    return sendJson(response, 200, { conflicts: listSyncConflicts() })
  }
  const conflictMatch = request.url?.match(/^\/api\/sync\/conflicts\/([^/]+)\/resolve$/)
  if (request.method === 'POST' && conflictMatch) {
    const user = sessionUser(request)
    if (!user || !['owner', 'admin'].includes(user.role)) return sendJson(response, 403, { error: 'Owner or admin access required.' })
    resolveSyncConflict(conflictMatch[1]); return sendJson(response, 200, { ok: true })
  }
  if (request.method === 'POST' && request.url === '/api/sync/now') {
    const user = sessionUser(request)
    if (!user || !['owner', 'admin'].includes(user.role)) return sendJson(response, 403, { error: 'Owner or admin access is required.' })
    return sendJson(response, 200, await syncNow())
  }
  if (request.method === 'POST' && request.url === '/api/sync/pull') {
    const user = sessionUser(request)
    if (!user || !['owner', 'admin'].includes(user.role)) return sendJson(response, 403, { error: 'Owner or admin access is required.' })
    return sendJson(response, 200, await pullLatest())
  }
  const walletMatch = request.url?.match(/^\/api\/customers\/([^/]+)\/wallet$/)
  if (request.method === 'POST' && walletMatch) return readJson(request, response, async (input) => {
    if (!canOperate(sessionUser(request))) return sendJson(response, 403, { error: 'Operational access is required.' })
    const amount = Number(input.amount)
    if (!Number.isFinite(amount) || amount === 0) return sendJson(response, 400, { error: 'Wallet amount must not be zero.' })
    try { return sendJson(response, 200, await adjustCustomerWallet(walletMatch[1], amount, String(input.reason || 'manual-adjustment'))) } catch (error) { return sendJson(response, 400, { error: error.message }) }
  })

  if (request.method === 'POST' && request.url === '/api/stocktakes') {
    const user = sessionUser(request)
    if (!canOperate(user)) return sendJson(response, 403, { error: 'Operational access is required.' })
    return sendJson(response, 201, await createStocktake())
  }
  const stocktakeCountMatch = request.url?.match(/^\/api\/stocktakes\/([^/]+)\/counts\/([^/]+)$/)
  if (request.method === 'PUT' && stocktakeCountMatch) {
    const user = sessionUser(request)
    if (!canOperate(user)) return sendJson(response, 403, { error: 'Operational access is required.' })
    return readJson(request, response, async (input) => sendJson(response, 200, await updateStocktakeCount(stocktakeCountMatch[1], stocktakeCountMatch[2], input.counted)))
  }
  const stocktakeMatch = request.url?.match(/^\/api\/stocktakes\/([^/]+)$/)
  if (request.method === 'GET' && stocktakeMatch) {
    const user = sessionUser(request)
    if (!canOperate(user)) return sendJson(response, 403, { error: 'Operational access is required.' })
    return sendJson(response, 200, await getStocktake(stocktakeMatch[1]))
  }
  const approveMatch = request.url?.match(/^\/api\/stocktakes\/([^/]+)\/approve$/)
  if (request.method === 'POST' && approveMatch) {
    const user = sessionUser(request)
    if (!canOperate(user)) return sendJson(response, 403, { error: 'Operational access is required.' })
    return readJson(request, response, async (input) => sendJson(response, 200, await approveStocktake(approveMatch[1], String(input.reason || 'Approved after physical count'))))
  }

  if (request.method === 'GET' && request.url === '/api/settings') {
    const settings = await getSettings()
    const cloud = await syncConfigurationStatus()
    return sendJson(response, 200, { ...settings, cloudConfigured: cloud.configured, existingBusiness: cloud.existingBusiness })
  }

  if (request.method === 'PUT' && request.url === '/api/settings') {
    const user = sessionUser(request)
    if (!user || user.role !== 'owner') return sendJson(response, 403, { error: 'Only the owner can change business settings.' })
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', async () => {
      try {
        const input = JSON.parse(body)
        const current = await getSettings()
        const appName = String(input.appName ?? current.appName).trim() || current.appName
        const currency = String(input.currency ?? current.currency).trim().toUpperCase() || current.currency
        const posProvider = input.posProvider === undefined ? current.posProvider : String(input.posProvider).trim()
        const posTerminalId = input.posTerminalId === undefined ? current.posTerminalId : String(input.posTerminalId).trim()
        const posConnection = input.posConnection === undefined ? current.posConnection : String(input.posConnection)
        const logoData = input.logoData === undefined ? (current.logoData || '') : String(input.logoData)
        const mongoUri = String(input.mongoUri || '').trim()
        const mongoDatabase = String(input.mongoDatabase || 'stockroom').trim() || 'stockroom'
        if (!appName || appName.length > 60) return sendJson(response, 400, { error: 'App name must be between 1 and 60 characters.' })
        if (!/^[A-Z]{3}$/.test(currency)) return sendJson(response, 400, { error: 'Currency must be a three-letter code.' })
        if (logoData && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(logoData) || logoData.length > 1_400_000)) return sendJson(response, 400, { error: 'Logo must be a PNG, JPEG, or WebP image smaller than 1 MB.' })
        if (!['manual', 'usb', 'bluetooth', 'network', 'sdk'].includes(posConnection)) return sendJson(response, 400, { error: 'POS connection mode is invalid.' })
        return sendJson(response, 200, await updateSettings(appName, currency, posProvider, posTerminalId, posConnection, mongoUri, mongoDatabase, logoData, input.paymentPolicy))
      } catch {
        return sendJson(response, 400, { error: 'Request body must be valid JSON.' })
      }
    })
    return
  }

  if (request.method === 'GET' && request.url === '/api/products') {
    if (!sessionUser(request)) return sendJson(response, 401, { error: 'Authentication required.' })
    return sendJson(response, 200, { products: await listProducts() })
  }

  if (request.method === 'POST' && request.url === '/api/sales') {
    return readJson(request, response, async (input) => {
      const user = sessionUser(request)
      if (!user) return sendJson(response, 401, { error: 'Authentication required.' })
      const subscription = await getSubscriptionAccess()
      if (subscription.blocked) return sendJson(response, 402, { error: subscription.reason })
      if (input.paymentMethod === 'wallet' && input.paymentDetails?.creditApproved && user.role !== 'owner') return sendJson(response, 403, { error: 'Only the owner may approve credit purchases.' })
      if (!input?.id || !Array.isArray(input.items) || !Number.isFinite(Number(input.total))) return sendJson(response, 400, { error: 'Sale is invalid.' })
      try {
        return sendJson(response, 201, await createSale({ ...input, staffId: user.id, staffName: user.name }))
      } catch (error) {
        return sendJson(response, 400, { error: error.message })
      }
    })
  }

  if (request.method === 'POST' && request.url === '/api/products') {
    return readJson(request, response, async (input) => {
      if (!canOperate(sessionUser(request))) return sendJson(response, 403, { error: 'Operational access is required.' })
      const product = validateProduct(input)
      return sendJson(response, 201, await createProduct(product))
    })
  }

  const stockMatch = request.url?.match(/^\/api\/products\/([^/]+)\/stock$/)
  if (request.method === 'POST' && stockMatch) {
    return readJson(request, response, async (input) => {
      if (!canOperate(sessionUser(request))) return sendJson(response, 403, { error: 'Operational access is required.' })
      const amount = Number(input.amount)
      if (!Number.isInteger(amount) || amount === 0) return sendJson(response, 400, { error: 'Stock amount must be a non-zero integer.' })
      try {
        const product = await adjustStock(stockMatch[1], amount)
        return product ? sendJson(response, 200, product) : sendJson(response, 404, { error: 'Product not found.' })
      } catch (error) {
        return sendJson(response, 400, { error: error.message })
      }
    })
  }

  serveFrontend(request, response)
})

function serveFrontend(request, response) {
  if (!existsSync(distDirectory)) return sendJson(response, 503, { error: 'Frontend build not found. Run npm run build first.' })
  const requestedPath = decodeURIComponent((request.url || '/').split('?')[0])
  const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.replace(/^\/+/, '')
  const candidate = join(distDirectory, relativePath)
  const filePath = existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(distDirectory, 'index.html')
  const extension = extname(filePath)
  response.writeHead(200, { 'Content-Type': contentTypes[extension] || 'application/octet-stream' })
  createReadStream(filePath).pipe(response)
}

function readJson(request, response, callback) {
  let body = ''
  request.on('data', (chunk) => { body += chunk })
  request.on('end', () => {
    try {
      Promise.resolve(callback(JSON.parse(body))).catch((error) => sendJson(response, 400, { error: error.message }))
    } catch {
      sendJson(response, 400, { error: 'Request body must be valid JSON.' })
    }
  })
}

function validateProduct(input) {
  const product = {
    name: String(input.name || '').trim(), sku: String(input.sku || '').trim() || `${String(input.name || '').trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 24).toUpperCase() || 'PRODUCT'}-${crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`, barcode: String(input.barcode || '').trim(), category: String(input.category || '').trim(),
    stock: Number(input.stock), reorder: Number(input.reorder), price: Number(input.price), cost: Number(input.cost || 0), unit: String(input.unit || '').trim(),
  }
  if (!product.name || !product.sku || !product.category || !product.unit || [product.stock, product.reorder, product.price, product.cost].some((value) => !Number.isFinite(value) || value < 0)) throw new Error('Product fields are invalid.')
  if (!Number.isInteger(product.stock) || !Number.isInteger(product.reorder)) throw new Error('Stock values must be whole numbers.')
  return product
}

// The packaged desktop application is a single-device app. Keep its local API
// off the network; a separately hosted web deployment can still opt in to its
// normal server binding.
const listenHost = process.env.STOCKROOM_LOCAL_ONLY === 'true' ? '127.0.0.1' : undefined
server.listen(port, listenHost, () => console.log(`API listening at http://${listenHost || 'localhost'}:${port} using ${storageName}`))
startSyncWorker()
startCustomerDisplayGateway(customerDisplayPort)

function sessionUser(request) {
  const token = request.headers.authorization?.replace('Bearer ', '')
  return savedSessionUser(token)
}

function isManager(user) { return Boolean(user && ['owner', 'admin'].includes(user.role)) }
function canOperate(user) { return isManager(user) || Boolean(user?.role === 'cashier' && user.operationalAccess) }
