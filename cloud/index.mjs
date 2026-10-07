import { createPreparationPrint } from './preparation-print.mjs'
import { customerOrderSettings, customerHandoff } from '../server/customer-order-settings.mjs'
import { createTillRecovery } from './till-recovery.mjs'
import { authorizeCustomerOrder, customerOrderLines, publishCustomerOrder, acceptCustomerOrder } from './customer-orders.mjs'
import { createStaffRemoval } from './staff-removal.mjs'
import { validateServiceJob, requiresServiceJobSync } from '../server/service-jobs.mjs'
import { floorId,restaurantTabs,billContains,validateRestaurantFloor } from '../server/restaurant-floor.mjs'
import { validateRestaurantLedger, restaurantLedgerId, restaurantReceiptHash, restaurantOrderPayment } from '../server/restaurant-payments.mjs'
import { recordPayment } from '../server/payment.mjs'
import { validateRestaurantRecord, validateRestaurantClose } from '../server/restaurant-service.mjs'
import { validateConsumption, recipeRequirements, consumptionId } from '../server/counter-recipes.mjs'
import { createSupermarketCoordinator } from './supermarket-coordination.mjs'
import { validateRetailRecord } from '../server/retail.mjs'
import { validateCounterRecord, validateCounterPayment, validateCounterRetry, counterItems, counterSaleId } from '../server/counter-service.mjs'
import { createPosPaystack } from './pos-paystack.mjs'
import { createServer } from 'node:http'
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { MongoClient, ObjectId } from 'mongodb'
import { isNewerMutableOperation, mutableEntities, operationUpdatedAt } from './conflict-policy.mjs'
import { mailConfigured, mailDiagnostics, sendPosReceipt, sendBusinessRegistrationKey, sendPasswordReset } from './mailer.mjs'
import { corsHeadersFor } from './cors.mjs'
import { createSubscriptions } from './subscriptions.mjs'
import { createRegistration, canIssueRegistrationKey } from './registration.mjs'
import { completeOwnerPasswordReset } from './password-reset.mjs'
import { createVisitorAccounts } from './visitor-accounts.mjs'
import { createAccountDeletion } from './account-deletion.mjs'
import { createReferralWallet } from './referral-wallet.mjs'
import { createGooglePlayBilling } from './google-play-billing.mjs'
import { createNotifications } from './notifications.mjs'
import { createProductFormReader } from './product-form.mjs'
import { normalizeShopProfile, validateShopProfile } from '../server/shop-profile.mjs'
import { readCustomValues } from '../server/shop-fields.mjs'
import { posSettings, priceOrder } from '../server/pos-pricing.mjs'

const port = Number(process.env.PORT || 8080)
const uri = process.env.MONGODB_URI
const jwtSecret = process.env.JWT_SECRET
const adminApiKey = process.env.ADMIN_API_KEY
if (!uri || !jwtSecret || !adminApiKey) throw new Error('MONGODB_URI, JWT_SECRET, and ADMIN_API_KEY are required for the cloud sync API.')

const client = new MongoClient(uri)
await client.connect()
const database = client.db(process.env.MONGODB_DATABASE || 'stockroom_sync')
const operations = database.collection('sync_operations')
const coordinateSupermarket=createSupermarketCoordinator(database,client)
const entityHeads = database.collection('sync_entity_heads')
const businessSettings = database.collection('business_settings')
const inventoryAlertState = database.collection('inventory_alert_state')
const accounts = database.collection('accounts')
const devices = database.collection('devices')
const passwordResets = database.collection('password_resets')
const refreshTokens = database.collection('auth_refresh_tokens')
const referralVisitors = database.collection('referral_visitors')
const customerPortalAccounts = database.collection('customer_portal_accounts')
const customerPortalLoginLimits = new Map()
const businessExitPayments = database.collection('business_exit_payments')
await operations.createIndex({ businessId: 1, operationId: 1 }, { unique: true })
await operations.createIndex({ businessId: 1, entityId: 1 }, { unique: true, partialFilterExpression: { entityType: 'retail_record' } })
await operations.createIndex({businessId:1,'payload.branchId':1,'payload.supplierId':1},{unique:true,partialFilterExpression:{entityType:'retail_record','payload.kind':'supplier-opening'}})
await operations.createIndex({ businessId: 1, entityType: 1, entityId: 1 }, { name: 'counter_order_receipt', unique: true, partialFilterExpression: { entityType: 'sale', 'payload.paymentDetails.counterOrder.id': { $exists: true } } })
await operations.createIndex({ businessId: 1, _id: 1 })
await entityHeads.createIndex({ businessId: 1, entityType: 1, entityId: 1 }, { unique: true })
await businessSettings.createIndex({ businessId: 1 }, { unique: true })
await inventoryAlertState.createIndex({ businessId: 1, branchId: 1, productId: 1 }, { unique: true })
// Staff email is optional contact data. Convert the original mandatory unique
// index once so several staff accounts can omit it.
await accounts.dropIndex('email_1').catch((error) => { if (error?.codeName !== 'IndexNotFound') throw error })
await accounts.createIndex({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } })
// A business has one owner and can have many staff. Older deployments created
// this index as unique, which silently limited every business to one account
// and surfaced as a misleading email/username collision on staff creation.
await accounts.dropIndex('businessId_1').catch((error) => { if (error?.codeName !== 'IndexNotFound') throw error })
await accounts.createIndex({ businessId: 1 })
await accounts.createIndex({ businessId: 1, role: 1 }, { unique: true, partialFilterExpression: { role: 'owner' }, name: 'one_owner_per_business' })
await accounts.createIndex({ businessId: 1, username: 1 }, { unique: true, partialFilterExpression: { username: { $type: 'string' } } })
await devices.createIndex({ businessId: 1, deviceId: 1 }, { unique: true })
await database.collection('checkout_tills').createIndex({ businessId: 1, tillId: 1 }, { unique: true })
await database.collection('till_recoveries').createIndex({ businessId: 1, requestId: 1 }, { unique: true })
await passwordResets.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
await refreshTokens.createIndex({ tokenHash: 1 }, { unique: true })
await refreshTokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
await referralVisitors.createIndex({ email: 1 }, { unique: true })
await customerPortalAccounts.createIndex({ businessId: 1, customerId: 1 }, { unique: true })
await customerPortalAccounts.createIndex({ businessId: 1, username: 1 }, { unique: true })

// Sales, stock movements, wallet adjustments, expenses, and audit events are
// immutable financial/inventory events: accept once by operation ID. Mutable
// records use a cloud entity head and newer `updatedAt` wins; the losing device
// receives a reviewable conflict instead of silently overwriting data.

// Capacitor's Android WebView is served from this local HTTPS origin. Keep the
// cloud API usable from the installed app without opening it to arbitrary sites.
function send(response, status, payload) { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(payload)) }
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
function signToken(payload) {
  const header = encode({ alg: 'HS256', typ: 'JWT' })
  const body = encode(payload)
  const signature = createHmac('sha256', jwtSecret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}
function hashPassword(password) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}` }
function matchesPassword(password, stored) { const [salt, value] = String(stored).split(':'); if (!salt || !value) return false; const actual = scryptSync(password, salt, 64); const expected = Buffer.from(value, 'hex'); return actual.length === expected.length && timingSafeEqual(actual, expected) }
function publicAccount(account) { return { id: account._id?.toString(), businessId: account.businessId, name: account.name || account.ownerName, email: account.email, username: account.username || '', role: account.role || 'owner', operationalAccess: Boolean(account.operationalAccess) } }
function accessToken(account) { return signToken({ kind: 'access', sub: account._id?.toString() || '', businessId: account.businessId, email: account.email || '', username: account.username || '', role: account.role || 'owner', operationalAccess: Boolean(account.operationalAccess), exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8 }) }
function refreshTokenHash(token) { return createHmac('sha256', jwtSecret).update(token).digest('hex') }
async function cloudSession(account) {
  const refreshToken = randomBytes(32).toString('base64url')
  await refreshTokens.insertOne({ tokenHash: refreshTokenHash(refreshToken), accountId: account._id, businessId: account.businessId, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), createdAt: new Date() })
  return { account: publicAccount(account), accessToken: accessToken(account), refreshToken }
}
function deviceToken(businessId, deviceId) { return signToken({ kind: 'device', businessId, deviceId, exp: Math.floor(Date.now() / 1000) + 365 * 86_400 }) }
function isAccess(claims) { return claims?.kind === 'access' }
function isDevice(claims) { return claims?.kind === 'device' }
function verifyToken(request) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '') || ''
  const [header, body, signature] = token.split('.')
  if (!header || !body || !signature) return null
  const expected = createHmac('sha256', jwtSecret).update(`${header}.${body}`).digest('base64url')
  const valid = Buffer.byteLength(signature) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  if (!valid) return null
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    return claims.exp > Math.floor(Date.now() / 1000) ? claims : null
  } catch { return null }
}
function readJson(request, maxBytes = Infinity) {
  return new Promise((resolve, reject) => {
    let body = ''
    let size = 0
    request.on('data', (chunk) => { size += chunk.length; if (size > maxBytes) { reject(new Error('Request too large.')); return }; body += chunk })
    request.on('end', () => { try { resolve(JSON.parse(body || '{}')) } catch { reject(new Error('Invalid JSON.')) } })
  })
}
function username(value) { return String(value || '').trim().toLowerCase() }
function validUsername(value) { return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(value) }
async function assignLegacyStaffUsername(account) {
  if (account.role === 'owner' || validUsername(account.username)) return account
  const base = username(String(account.email || '').split('@')[0]).replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '').slice(0, 28) || 'staff'
  let candidate = base.length >= 3 ? base : `${base}01`
  let suffix = 2
  while (await accounts.findOne({ businessId: account.businessId, username: candidate, _id: { $ne: account._id } })) candidate = `${base.slice(0, 28)}-${suffix++}`
  await accounts.updateOne({ _id: account._id, username: { $exists: false } }, { $set: { username: candidate, usernameAssignedAt: new Date() } })
  return { ...account, username: candidate }
}
async function ownerPasswordIsValid(claims, value) {
  const owner = await accounts.findOne({ businessId: claims.businessId, email: claims.email, role: 'owner' })
  return Boolean(owner && matchesPassword(String(value || ''), owner.passwordHash))
}

const registration = await createRegistration({ database, client, accounts, hashPassword, sendBusinessRegistrationKey })
const visitorAccounts = createVisitorAccounts({ database, hashPassword, matchesPassword, signToken })
const accountDeletion = createAccountDeletion({ database, accounts, devices, refreshTokens, visitors: referralVisitors, verifyToken, graceDays: async () => (await database.collection('subscription_settings').findOne({ _id: 'plan' }))?.accountDeletionGraceDays ?? 14 })
const notifications = await createNotifications({ database, accounts, visitors: referralVisitors, verifyToken })

async function inventoryDelta(businessId, branchId, productId, delta, source, beforeStock) {
  if (!productId || !Number.isFinite(delta) || delta === 0) return
  const productHead = await entityHeads.findOne({ businessId, entityType: 'product', entityId: String(productId) })
  const product = productHead?.payload || {}
  const productName = String(product.name || 'A product').slice(0, 100)
  const reorder = Math.max(0, Number(product.reorder) || 0)
  const filter = { businessId, branchId: String(branchId || 'main'), productId: String(productId) }
  const initialStock = Math.max(0, Number.isFinite(Number(beforeStock)) ? Number(beforeStock) : 0)
  const previous = await inventoryAlertState.findOneAndUpdate(filter, [{ $set: { ...filter, stock: { $max: [0, { $add: [{ $ifNull: ['$stock', initialStock] }, delta] }] }, reorder: { $literal: reorder }, productName: { $literal: productName }, updatedAt: { $literal: new Date() } } }], { upsert: true, returnDocument: 'before' })
  const previousStock = previous ? Number(previous.stock) || 0 : initialStock
  const stock = Math.max(0, previousStock + delta)
  const crossedLow = previousStock > reorder && stock <= reorder && stock > 0
  const crossedOut = previousStock > 0 && stock === 0
  const recovered = previousStock <= reorder && stock > reorder
  const branch = filter.branchId === 'main' ? 'Main branch' : String((await entityHeads.findOne({ businessId, entityType: 'branch', entityId: filter.branchId }))?.payload?.name || filter.branchId)
  const inventoryUrl = `/?screen=Inventory&search=${encodeURIComponent(String(product.sku || productId))}`
  if (crossedOut) await notifyInventoryTeam(businessId, { title: 'Out of stock', body: `${productName} has run out at ${branch}.`, type: 'inventory-out', url: inventoryUrl })
  else if (crossedLow) await notifyInventoryTeam(businessId, { title: 'Low stock', body: `${productName} is down to ${stock} (reorder at ${reorder}) at ${branch}.`, type: 'inventory-low', url: inventoryUrl })
  else if (recovered) await notifyInventoryTeam(businessId, { title: 'Stock replenished', body: `${productName} is above its reorder level at ${branch} (${stock} in stock).`, type: 'inventory-restocked', url: inventoryUrl })
  if (source === 'stock-adjustment' && delta < 0 && stock > reorder && Math.abs(delta) >= Math.max(10, reorder * 2)) {
    await notifyInventoryTeam(businessId, { title: 'Large stock reduction', body: `${Math.abs(delta)} ${product.unit || 'units'} of ${productName} were removed at ${branch}. Review inventory activity.`, type: 'inventory-adjustment', url: inventoryUrl })
  }
  if (source === 'stocktake' && delta < 0 && Math.abs(delta) >= Math.max(5, reorder)) {
    await notifyInventoryTeam(businessId, { title: 'Stocktake discrepancy', body: `The count found ${Math.abs(delta)} fewer ${product.unit || 'units'} of ${productName} than expected at ${branch}.`, type: 'inventory-discrepancy', url: inventoryUrl })
  }
}

async function notifyInventoryTeam(businessId, message) {
  const team = await accounts.find({ businessId, $or: [{ role: { $in: ['owner', 'admin'] } }, { role: 'cashier', operationalAccess: true }] }).project({ _id: 1 }).toArray()
  await Promise.all(team.map(account => notifications.notifyAccount(account._id.toString(), message)))
}

async function processInventoryNotification(operation) {
  const { businessId, entityType, action, payload = {} } = operation
  if (entityType === 'product' && action === 'upsert') {
    const branchId = 'main'
    const filter = { businessId, branchId, productId: String(payload.id || operation.entityId) }
    await inventoryAlertState.updateOne(filter, { $setOnInsert: { ...filter, stock: Math.max(0, Number(payload.stock) || 0), reorder: Math.max(0, Number(payload.reorder) || 0), productName: String(payload.name || 'Product'), updatedAt: new Date() } }, { upsert: true })
  } else if (entityType === 'retail_record' && action === 'create' && ['receipt', 'waste', 'supplier-return'].includes(payload.kind)) {
    for (const line of payload.lines || []) await inventoryDelta(businessId, payload.branchId, line.productId, Number(line.units) * (payload.kind === 'receipt' ? 1 : -1), payload.kind, line.beforeStock)
  } else if (entityType === 'stock' && action === 'adjust') {
    await inventoryDelta(businessId, payload.branchId, payload.productId || operation.entityId, Number(payload.amount) || 0, 'stock-adjustment', payload.beforeStock)
  } else if (entityType === 'sale' && action === 'create') {
    for (const item of Array.isArray(payload.items) ? payload.items : []) if (!String(item.productId).startsWith('service:')) await inventoryDelta(businessId, payload.branchId, item.productId, -(Number(item.quantity) || 0), 'sale', item.beforeStock)
  } else if (entityType === 'branch_transfer' && action === 'create') {
    await inventoryDelta(businessId, payload.fromBranchId, payload.productId, -(Number(payload.quantity) || 0), 'transfer', payload.sourceBeforeStock)
    await inventoryDelta(businessId, payload.toBranchId, payload.productId, Number(payload.quantity) || 0, 'transfer', payload.destinationBeforeStock)
  } else if (entityType === 'stocktake' && action === 'approved') {
    for (const item of Array.isArray(payload.counts) ? payload.counts : []) await inventoryDelta(businessId, payload.branchId, item.productId, Number(item.variance) || 0, 'stocktake', item.beforeStock)
  }
}
const referralWallet = await createReferralWallet({ database, accounts, verifyToken, notifications })
const googlePlayBilling = createGooglePlayBilling({ database, accounts, verifyToken })
const subscriptionHandler = await createSubscriptions({ database, accounts, verifyToken, send, handlePayoutWebhook: referralWallet.handleWebhook, notifications })
const productFormReader = await createProductFormReader({ database, accounts, verifyToken, readJson, send })
const posPaystack = await createPosPaystack({ database })
// Keep dependent floor, payment-allocation and bill-close operations in order
// across simultaneous pushes to this existing sync server.
const businessSyncJobs=new Map()
async function serializeBusinessSync(businessId,job) {
  const previous=businessSyncJobs.get(businessId)||Promise.resolve()
  const next=previous.catch(()=>{}).then(job)
  businessSyncJobs.set(businessId,next)
  try{return await next}finally{if(businessSyncJobs.get(businessId)===next)businessSyncJobs.delete(businessId)}
}
const staffRemoval = createStaffRemoval({ accounts, refreshTokens, operations, verifyToken, ownerPasswordIsValid, readJson, send })

const tillRecovery = createTillRecovery({ database, devices, entityHeads, operations, serialize: serializeBusinessSync, verifyToken, ownerIsActive: async claims => ObjectId.isValid(claims.sub) && Boolean(await accounts.findOne({ _id: new ObjectId(claims.sub), businessId: claims.businessId, role: 'owner' })), ownerPasswordIsValid, readJson, send })
await database.collection('preparation_printers').createIndex({ businessId: 1, branchId: 1 }, { unique: true })
await database.collection('preparation_print_jobs').createIndex({ businessId: 1, branchId: 1, id: 1 }, { unique: true })
const preparationPrint = createPreparationPrint({ database, devices, entityHeads, verifyToken, ownerIsActive: async claims => ObjectId.isValid(claims.sub) && Boolean(await accounts.findOne({ _id: new ObjectId(claims.sub), businessId: claims.businessId, role: 'owner', removedAt: { $exists: false } })), readJson, send })

const server = createServer(async (request, response) => {
  const corsHeaders = corsHeadersFor(request.headers.origin, process.env.PWA_ALLOWED_ORIGINS)
  if (request.url?.startsWith('/v1/customer-portal/')) {
    response.setHeader('Cache-Control', 'no-store')
    corsHeaders['Access-Control-Allow-Origin'] = '*'
    corsHeaders['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
  }
  // Referral percentages are intentionally public. They are displayed on the
  // marketing site, whose origin can differ from configured app origins.
  if (request.url?.startsWith('/v1/visitors/') || request.method === 'GET' && request.url === '/v1/public/landing') {
    corsHeaders['Access-Control-Allow-Origin'] = '*'
    corsHeaders['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
  }
  for (const [name, value] of Object.entries(corsHeaders)) response.setHeader(name, value)
  if (request.method === 'OPTIONS') { response.writeHead(204, corsHeaders); return response.end() }
  if (request.method === 'GET' && request.url === '/health') return send(response, 200, { ok: true })
  try {
    if (await staffRemoval.blocked(request)) return send(response, 403, { error: 'Your staff access has been removed by the owner.' })
    if (await staffRemoval.handle(request, response)) return
    if (await accountDeletion.handle(request, response)) return
    const deletionBlock = await accountDeletion.blocked(request)
    if (deletionBlock) return send(response, 403, { error: deletionBlock })
    if (request.method === 'GET' && request.url === '/v1/public/landing') {
      const plan = await database.collection('subscription_settings').findOne({ _id: 'plan' })
      return send(response, 200, {
        firstReferralPercent: Number(plan?.firstReferralPercent || 0),
        recurringReferralPercent: Number(plan?.recurringReferralPercent || 0),
        visitorFirstReferralPercent: plan?.visitorFirstReferralPercent == null ? null : Number(plan.visitorFirstReferralPercent),
        visitorRecurringReferralPercent: plan?.visitorRecurringReferralPercent == null ? null : Number(plan.visitorRecurringReferralPercent),
      })
    }
    if (request.method === 'POST' && request.url === '/v1/customer-portal/login') {
      const input = await readJson(request)
      const businessId = String(input.businessId || '').trim()
      const login = username(input.username)
      const address = String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || '').split(',')[0].trim()
      const attemptKey = `${address}:${businessId}:${login}`
      const now = Date.now()
      const attempts = customerPortalLoginLimits.get(attemptKey)
      if (customerPortalLoginLimits.size > 10000) for (const [key, value] of customerPortalLoginLimits) if (value.until <= now) customerPortalLoginLimits.delete(key)
      if (attempts?.until > now && attempts.count >= 10) return send(response, 429, { error: 'Too many sign-in attempts. Wait 15 minutes and try again.' })
      const account = await customerPortalAccounts.findOne({ businessId, username: login, active: true })
      if (!account || !matchesPassword(String(input.password || ''), account.passwordHash)) {
        const current = attempts?.until > now ? attempts : { count: 0, until: now + 15 * 60 * 1000 }
        customerPortalLoginLimits.set(attemptKey, { count: current.count + 1, until: current.until })
        return send(response, 401, { error: 'Username or password is incorrect.' })
      }
      if (await database.collection('account_deletion_requests').findOne({ type: 'business', businessId, status: { $in: ['pending', 'processing'] } })) return send(response, 403, { error: 'This business is currently closed for ordering.' })
      customerPortalLoginLimits.delete(attemptKey)
      return send(response, 200, { accessToken: signToken({ kind: 'customer', sub: account._id.toString(), businessId, customerId: account.customerId, authVersion: new Date(account.updatedAt || account.createdAt).getTime(), role: 'customer', exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8 }) })
    }
    if (request.method === 'GET' && request.url.startsWith('/v1/customer-portal/catalog?')) {
      const query = new URL(request.url, 'http://localhost').searchParams
      const businessId = String(query.get('businessId') || '')
      if (await database.collection('account_deletion_requests').findOne({ type: 'business', businessId, status: { $in: ['pending', 'processing'] } })) return send(response, 403, { error: 'This business is currently closed for ordering.' })
      const saved = await businessSettings.findOne({ businessId })
      if (!saved) return send(response, 404, { error: 'Business customer ordering is not available.' })
      const settings = saved.settings || {}
      const profile = normalizeShopProfile(settings.shopProfile)
      const menuId = profile.restaurant ? 'restaurant-menu' : profile.fastFood ? 'counter-menu' : ''
      if (!menuId) return send(response, 200, { businessId, businessName: settings.appName || 'Business', currency: settings.currency || 'USD', mode: 'account', menu: null })
      const head = await entityHeads.findOne({ businessId, entityType: 'pos_record', entityId: menuId })
      const taxHead = await entityHeads.findOne({ businessId, entityType: 'pos_record', entityId: 'pos-settings' })
      const pricing = posSettings(taxHead?.payload?.value)
      const publicTax = { taxEnabled: pricing.taxEnabled, taxRate: pricing.taxRate, taxLabel: pricing.taxLabel, taxIncluded: pricing.taxIncluded, taxRates: {} }
      const menu = head?.payload?.kind === 'counter-menu' ? head.payload : null
      publicTax.taxRates = Object.fromEntries((menu?.items || []).filter(item => item.available && item.type === 'stock' && !profile.restaurant).map(item => [item.id, pricing.taxRates[item.productId] ?? pricing.taxRate]))
      return send(response, 200, { businessId, businessName: settings.appName || 'Business', currency: settings.currency || 'USD', mode: profile.restaurant ? 'restaurant' : 'fast-food', tax: publicTax, walletAllowed: settings.paymentPolicy?.allowWallet === true, customerOrdering: customerOrderSettings(settings.paymentPolicy?.customerOrdering), menu: menu ? { id: menu.id, updatedAt: menu.updatedAt, items: menu.items.filter(item => item.available).map(item => ({ id: item.id, name: item.name, description: item.description || '', price: item.price, options: item.options.filter(option => option.available !== false).map(option => ({ id: option.id, name: option.name, price: option.price })) })) } : { id: menuId, updatedAt: '', items: [] } })
    }
    if (request.method === 'POST' && request.url === '/v1/customer-portal/guest') {
      const input = await readJson(request, 4096)
      const businessId = String(input.businessId || '').trim()
      const name = String(input.name || '').trim().slice(0, 100)
      if (!name) return send(response, 400, { error: 'Enter your name for pickup.' })
      const closing = await database.collection('account_deletion_requests').findOne({ type: 'business', businessId, status: { $in: ['pending', 'processing'] } })
      const saved = await businessSettings.findOne({ businessId })
      const profile = normalizeShopProfile(saved?.settings?.shopProfile)
      if (closing || !saved || (!profile.fastFood && !profile.restaurant)) return send(response, 403, { error: 'Guest ordering is not available for this business.' })
      const rateKey = `guest-entry:${String(request.socket.remoteAddress || '')}:${businessId}`
      const rateNow = Date.now(), rate = customerPortalLoginLimits.get(rateKey)
      const window = rate?.until > rateNow ? rate : { count: 0, until: rateNow + 15 * 60 * 1000 }
      if (window.count >= 60) return send(response, 429, { error: 'Too many ordering requests. Wait fifteen minutes before trying again.' })
      customerPortalLoginLimits.set(rateKey, { ...window, count: window.count + 1 })
      const customerId = `guest-${randomBytes(24).toString('hex')}`
      return send(response, 201, { accessToken: signToken({ kind: 'customer', guest: true, customerId, name, businessId, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 }) })
    }
    if (request.method === 'POST' && request.url === '/v1/customer-portal/accept') {
      const claims = verifyToken(request)
      if (!isAccess(claims) || !['owner', 'admin', 'cashier'].includes(claims.role) || !ObjectId.isValid(claims.sub)) return send(response, 403, { error: 'Staff sign-in required.' })
      const staff = await accounts.findOne({ _id: new ObjectId(claims.sub), businessId: claims.businessId, removedAt: { $exists: false } })
      if (!staff) return send(response, 403, { error: 'Staff access is no longer available.' })
      const input = await readJson(request, 4096)
      try {
        const order = await acceptCustomerOrder({ entityHeads, operations, serialize: serializeBusinessSync, businessId: claims.businessId, orderId: String(input.orderId || ''), tillId: String(input.tillId || ''), staffId: claims.sub })
        return send(response, 200, { order })
      } catch (error) { return send(response, 409, { error: error.message }) }
    }
    if (request.method === 'POST' && request.url === '/v1/customer-portal/orders') {
      const claims = verifyToken(request)
      if (claims?.kind !== 'customer') return send(response, 401, { error: 'Customer sign-in required.' })
      if (!claims.guest) {
        const account = ObjectId.isValid(claims.sub) && await customerPortalAccounts.findOne({ _id: new ObjectId(claims.sub), businessId: claims.businessId, customerId: claims.customerId, active: true })
        if (!account || claims.authVersion !== new Date(account.updatedAt || account.createdAt).getTime()) return send(response, 401, { error: 'Customer account is no longer available. Sign in again.' })
      }
      const input = await readJson(request, 32768)
      const clientOrderId = String(input.clientOrderId || '')
      if (!/^[a-zA-Z0-9_-]{12,100}$/.test(clientOrderId)) return send(response, 400, { error: 'Invalid order request ID.' })
      const rateKey = `customer-order:${String(request.socket.remoteAddress || '')}:${claims.businessId}:${claims.customerId}`
      const rateNow = Date.now(), rate = customerPortalLoginLimits.get(rateKey)
      const window = rate?.until > rateNow ? rate : { count: 0, until: rateNow + 15 * 60 * 1000 }
      if (window.count >= 120) return send(response, 429, { error: 'Too many ordering requests. Wait fifteen minutes before trying again.' })
      customerPortalLoginLimits.set(rateKey, { ...window, count: window.count + 1 })
      const orderId = `online-${clientOrderId}`
      const prior = await entityHeads.findOne({ businessId: claims.businessId, entityType: 'pos_record', entityId: orderId })
      if (prior) { authorizeCustomerOrder(prior.payload, claims.customerId); await publishCustomerOrder(operations, prior); return send(response, 200, { order: prior.payload }) }
      const saved = await businessSettings.findOne({ businessId: claims.businessId })
      const profile = normalizeShopProfile(saved?.settings?.shopProfile)
      if (!profile.fastFood && !profile.restaurant) return send(response, 403, { error: 'Online ordering is available for food and restaurant workspaces.' })
      const menuId = profile.restaurant ? 'restaurant-menu' : 'counter-menu'
      const menu = await entityHeads.findOne({ businessId: claims.businessId, entityType: 'pos_record', entityId: menuId })
      if (!menu?.payload || input.menuUpdatedAt !== menu.payload.updatedAt) return send(response, 409, { error: 'The menu changed. Refresh it and review your basket.' })
      const customerHead = claims.guest ? { payload: { name: claims.name } } : await entityHeads.findOne({ businessId: claims.businessId, entityType: 'customer', entityId: claims.customerId })
      if (!customerHead) return send(response, 403, { error: 'Customer account is no longer available.' })
      let lines
      try { lines = await customerOrderLines(menu.payload, input.lines, Boolean(profile.restaurant), async id => (await entityHeads.findOne({ businessId: claims.businessId, entityType: 'product', entityId: id }))?.payload) } catch (error) { return send(response, 400, { error: error.message }) }
      const requestedPayment = ['wallet', 'bank-transfer', 'cash'].includes(input.paymentMethod) ? input.paymentMethod : 'cash'
      if (requestedPayment === 'wallet' && (claims.guest || saved?.settings?.paymentPolicy?.allowWallet !== true)) return send(response, 400, { error: 'Wallet payment requires an enabled customer wallet account.' })
      const bankReference = String(input.paymentReference || '').trim().slice(0, 120)
      const bankProvider = String(input.paymentProvider || '').trim().slice(0, 100)
      if (requestedPayment === 'bank-transfer' && (!bankProvider || !bankReference)) return send(response, 400, { error: 'Enter the bank and transfer reference after making the transfer.' })
      let handoff
      try { handoff = customerHandoff(saved.settings?.paymentPolicy?.customerOrdering, input, Boolean(profile.restaurant)) } catch (error) { return send(response, 400, { error: error.message }) }
      if (handoff.delivery?.fee > 0) lines.push({ id: 'delivery-fee', menuItemId: 'delivery-fee', name: 'Delivery charge', type: 'prepared', station: 'kitchen', productId: '', quantity: 1, price: handoff.delivery.fee, options: [], recipe: [] })
      const id = orderId, now = new Date().toISOString(), tillId = 'customer-portal'
      const settingsRecord = await entityHeads.findOne({ businessId: claims.businessId, entityType: 'pos_record', entityId: 'pos-settings' })
      const tax = posSettings(settingsRecord?.payload?.value)
      const customer = customerHead.payload
      const pos = { tillId, customerId: claims.guest ? '' : claims.customerId, customerName: customer.name, discountType: 'amount', discountValue: 0, loyaltyRedeemed: 0, tax, note: String(input.note || '').trim().slice(0, 300) }
      pos.pricing = priceOrder(counterItems({ lines }), pos)
      if (input.expectedTotal !== undefined && Math.round(Number(input.expectedTotal) * 100) !== Math.round(pos.pricing.total * 100)) return send(response, 409, { error: 'The total changed. Refresh the menu and review tax and prices before submitting.' })
      const paymentNote = requestedPayment === 'bank-transfer' ? `Bank transfer claimed: ${bankProvider} / ${bankReference}. Verify before handing over.` : ''
      const customerNote = String(input.note || '').trim().slice(0, 200)
      const record = { id, kind: 'counter-order', source: 'customer-portal', customerPortalId: claims.customerId, acceptedTillId: '', restaurantOrder: Boolean(profile.restaurant), customerPaymentMethod: requestedPayment, ...(requestedPayment === 'bank-transfer' ? { customerPaymentProvider: bankProvider, customerPaymentReference: bankReference } : {}), branchId: 'main', status: 'queued', tillId, currency: saved.settings.currency || 'USD', businessName: saved.settings.appName || 'Business', createdAt: now, updatedAt: now, expectedUpdatedAt: '', customerName: customer.name, note: [handoff.delivery ? `Deliver to ${handoff.delivery.address} / ${handoff.delivery.phone}` : '', customerNote, paymentNote].filter(Boolean).join(' · ').slice(0, 300), ...handoff, lines, pos, total: pos.pricing.total, events: [{ status: 'queued', action: 'create', reason: '', staffId: `customer:${claims.customerId}`, at: now }] }
      validateCounterRecord(record)
      let result, conflict = ''
      await serializeBusinessSync(claims.businessId, async () => {
        const filter = { businessId: claims.businessId, entityType: 'pos_record', entityId: id }
        let head = await entityHeads.findOne(filter)
        if (head) authorizeCustomerOrder(head.payload, claims.customerId)
        else {
          const currentMenu = await entityHeads.findOne({ businessId: claims.businessId, entityType: 'pos_record', entityId: menuId })
          if (currentMenu?.payload?.updatedAt !== input.menuUpdatedAt) { conflict = 'The menu changed. Refresh it and review your basket.'; return }
          head = { ...filter, operationId: `customer-order:${clientOrderId}`, updatedAt: now, payload: record, deviceId: tillId, receivedAt: new Date() }
          await entityHeads.insertOne(head)
        }
        await publishCustomerOrder(operations, head)
        result = head.payload
      })
      if (conflict) return send(response, 409, { error: conflict })
      return send(response, 201, { order: result })
    }
    if (request.method === 'GET' && request.url === '/v1/customer-portal/me') {
      const claims = verifyToken(request)
      if (claims?.kind !== 'customer') return send(response, 401, { error: 'Customer sign-in required.' })
      if (claims.guest) {
        const heads = await entityHeads.find({ businessId: claims.businessId, entityType: 'pos_record', 'payload.kind': 'counter-order', 'payload.customerPortalId': claims.customerId }).sort({ updatedAt: -1 }).limit(100).toArray()
        const orders = await Promise.all(heads.map(async head => { const payment = await operations.findOne({ businessId: claims.businessId, entityType: 'sale', entityId: counterSaleId(head.entityId) }); return { id: head.entityId, total: head.payload.total, currency: head.payload.currency, createdAt: head.payload.createdAt, updatedAt: head.payload.updatedAt, paymentReference: payment?.payload?.paymentReference || head.payload.customerPaymentReference || '', status: !head.payload.acceptedTillId && head.payload.status === 'queued' ? 'pending' : head.payload.status, paymentMethod: payment?.payload?.paymentMethod || head.payload.customerPaymentMethod, paymentPending: !payment, lines: head.payload.lines.map(line => ({ name: line.name, quantity: line.quantity, options: line.options.map(option => option.name) })) } }))
        return send(response, 200, { guest: true, customer: { id: claims.customerId, name: claims.name, phone: '', balance: 0 }, transactions: [], orders })
      }
      if (!ObjectId.isValid(claims.sub)) return send(response, 401, { error: 'Customer sign-in required.' })
      const account = await customerPortalAccounts.findOne({ _id: new ObjectId(claims.sub), businessId: claims.businessId, customerId: claims.customerId, active: true })
      const customer = await entityHeads.findOne({ businessId: claims.businessId, entityType: 'customer', entityId: claims.customerId })
      if (!account || !customer || claims.authVersion !== new Date(account.updatedAt || account.createdAt).getTime()) return send(response, 401, { error: 'Customer account is no longer available.' })
      const events = await operations.find({ businessId: claims.businessId, entityType: 'wallet', entityId: claims.customerId }).sort({ createdAt: -1 }).toArray()
      const allTransactions = events.map(row => ({ id: row.operationId, amount: Number(row.payload?.amount || 0), reason: String(row.payload?.reason || 'Wallet activity'), createdAt: row.payload?.createdAt || row.createdAt }))
      const walletSales = await operations.find({ businessId: claims.businessId, entityType: 'sale', $or: [{ 'payload.paymentDetails.customerId': claims.customerId }, { 'payload.paymentDetails.pos.customerId': claims.customerId }] }).toArray()
      for (const row of walletSales) if (row.payload.paymentMethod === 'wallet') allTransactions.push({ id: row.operationId, amount: -Number(row.payload.total || 0), reason: `Purchase ${row.payload.id || row.entityId}`, createdAt: row.payload.createdAt || row.createdAt })
      const returns = await entityHeads.find({ businessId: claims.businessId, entityType: 'pos_record', 'payload.kind': 'return', 'payload.walletCustomerId': claims.customerId }).toArray()
      for (const row of returns) allTransactions.push({ id: row.entityId, amount: Number(row.payload.total || 0), reason: `Return ${row.payload.saleId}: ${row.payload.reason || ''}`, createdAt: row.payload.updatedAt || row.updatedAt })
      allTransactions.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      const orderHeads = await entityHeads.find({ businessId: claims.businessId, entityType: 'pos_record', 'payload.kind': 'counter-order', 'payload.pos.customerId': claims.customerId }).sort({ updatedAt: -1 }).limit(100).toArray()
      const orders = await Promise.all(orderHeads.map(async head => {
        const payment = await operations.findOne({ businessId: claims.businessId, entityType: 'sale', entityId: counterSaleId(head.entityId) })
        return { id: head.entityId, status: head.payload.source === 'customer-portal' && !head.payload.acceptedTillId && head.payload.status === 'queued' ? 'pending' : head.payload.status, total: head.payload.total, currency: head.payload.currency, createdAt: head.payload.createdAt, updatedAt: head.payload.updatedAt, lines: head.payload.lines.map(line => ({ name: line.name, quantity: line.quantity, options: line.options.map(option => option.name) })), paymentMethod: payment?.payload?.paymentMethod || head.payload.customerPaymentMethod || '', paymentReference: payment?.payload?.paymentReference || head.payload.customerPaymentReference || '', paymentPending: Boolean(['bank-transfer', 'wallet'].includes(head.payload.customerPaymentMethod) && !payment) }
      }))
      return send(response, 200, { customer: { id: claims.customerId, name: customer.payload.name, phone: customer.payload.phone || '', balance: allTransactions.reduce((sum, row) => sum + row.amount, 0) }, transactions: allTransactions.slice(0, 50), orders, businessId: claims.businessId })
    }
    if (request.method === 'POST' && request.url === '/v1/customer-portal/accounts') {
      const claims = verifyToken(request)
      if (!isAccess(claims) || !['owner', 'admin'].includes(claims.role)) return send(response, 403, { error: 'Owner or admin access required.' })
      const manager = await accounts.findOne({ businessId: claims.businessId, _id: new ObjectId(claims.sub), role: { $in: ['owner', 'admin'] }, removedAt: { $exists: false } })
      if (!manager) return send(response, 403, { error: 'Owner or admin access required.' })
      const input = await readJson(request)
      const customerId = String(input.customerId || '').trim()
      const login = username(input.username)
      const password = String(input.password || '')
      if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(login) || password.length < 10 || password.length > 256) return send(response, 400, { error: 'Username must be 3–32 characters and password at least 10 characters.' })
      const customer = await entityHeads.findOne({ businessId: claims.businessId, entityType: 'customer', entityId: customerId })
      if (!customer) return send(response, 409, { error: 'Sync this customer record before creating their sign-in.' })
      const existingLogin = await customerPortalAccounts.findOne({ businessId: claims.businessId, username: login, customerId: { $ne: customerId } })
      if (existingLogin) return send(response, 409, { error: 'That username is already used by another customer.' })
      await customerPortalAccounts.updateOne({ businessId: claims.businessId, customerId }, { $set: { username: login, passwordHash: hashPassword(password), active: true, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true })
      return send(response, 200, { customerId, username: login })
    }
    if (await preparationPrint.handle(request, response)) return
    if (await tillRecovery.handle(request, response)) return
    if (await productFormReader(request, response)) return
    if (await notifications.handle(request, response)) return
    if (await visitorAccounts(request, response, verifyToken, readJson)) return
    if (await referralWallet.handle(request, response)) return
    if (await googlePlayBilling.handle(request, response)) return
    if (request.method === 'POST' && request.url === '/v1/public/registration-keys') {
      response.setHeader('Cache-Control', 'no-store')
      try {
        const input = await readJson(request, 8192)
        const address = String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || '').split(',')[0].trim()
        return send(response, 201, await registration.issuePublic(input, address))
      } catch (error) { return send(response, error.statusCode || 400, { error: error.message }) }
    }
    if (request.method === 'POST' && request.url === '/v1/registration-keys') {
      const claims = verifyToken(request)
      if (!await canIssueRegistrationKey(claims, process.env.DEVELOPER_EMAIL, accounts)) return send(response, 403, { error: 'Developer account required.' })
      response.setHeader('Cache-Control', 'no-store')
      try { return send(response, 201, await registration.issue(await readJson(request, 8192))) } catch (error) { return send(response, 400, { error: error.message }) }
    }
    if (request.method === 'POST' && request.url === '/v1/business-registration') {
      response.setHeader('Cache-Control', 'no-store')
      try { return send(response, 201, await registration.redeem(await readJson(request, 8192))) } catch (error) { return send(response, error.code === 11000 ? 409 : 400, { error: error.code === 11000 ? 'This business or owner email is already registered. Sign in with your existing account.' : error.message }) }
    }
    if (await subscriptionHandler(request, response)) return
    if (request.method === 'POST' && request.url === '/v1/auth/register') {
      const input = await readJson(request)
      const businessId = String(input.businessId || '').trim()
      const ownerName = String(input.ownerName || '').trim()
      const email = String(input.email || '').trim().toLowerCase()
      const password = String(input.password || '')
      const enrollment = verifyToken(request)
      if (enrollment?.kind !== 'device' || enrollment.businessId !== businessId || !await devices.findOne({ businessId, deviceId: enrollment.deviceId, revokedAt: null })) return send(response, 403, { error: 'Use a business registration key or an installer-enrolled device to register.' })
      if (!/^[a-z0-9][a-z0-9-]{2,80}$/i.test(businessId) || !ownerName || !/^\S+@\S+\.\S+$/.test(email) || password.length < 10) return send(response, 400, { error: 'Provide a valid business ID, owner name, email, and password of at least 10 characters.' })
      const account = { businessId, ownerName, name: ownerName, email, role: 'owner', passwordHash: hashPassword(password), createdAt: new Date() }
      try { const created = await accounts.insertOne(account); account._id = created.insertedId } catch (error) { if (error?.code === 11000) return send(response, 409, { error: 'That business ID or email already exists.' }); throw error }
      return send(response, 201, await cloudSession(account))
    }
    if (request.method === 'POST' && request.url === '/v1/auth/login') {
      const input = await readJson(request)
      const email = String(input.email || '').trim().toLowerCase()
      const staffUsername = username(input.username)
      const businessId = String(input.businessId || '').trim()
      if ((email && staffUsername) || (!email && !staffUsername)) return send(response, 400, { error: 'Use an owner email or staff username.' })
      // Owner email is globally unique. Staff usernames are unique only
      // within a business, so staff clients must supply the business ID from
      // their business-specific sign-in URL or existing enrollment.
      if (staffUsername && !businessId) return send(response, 400, { error: 'Open your business sign-in link before signing in with a staff username.' })
      const account = email
        ? await accounts.findOne({ email, role: 'owner' })
        : await accounts.findOne({ businessId, username: staffUsername, role: { $in: ['admin', 'cashier'] } })
      if (!account || account.removedAt || !matchesPassword(String(input.password || ''), account.passwordHash)) return send(response, 401, { error: 'Username or password is incorrect.' })
      if (await businessExitPayments.findOne({ _id: account.businessId, closedAt: { $exists: true } })) return send(response, 403, { error: 'This business has completed its Stockroom exit.' })
      return send(response, 200, await cloudSession(account))
    }
    if (request.method === 'POST' && request.url === '/v1/auth/refresh') {
      const input = await readJson(request)
      const tokenHash = refreshTokenHash(String(input.refreshToken || ''))
      // Keep this session credential valid until its original expiry or explicit
      // revocation. A lost response must not consume the client's only way to
      // recover; concurrent tabs must also be able to renew the same session.
      const saved = await refreshTokens.findOne({ tokenHash, expiresAt: { $gt: new Date() } })
      if (!saved) return send(response, 401, { error: 'Cloud session renewal expired. Sign in again.' })
      const account = await accounts.findOne({ _id: saved.accountId })
      if (!account || account.removedAt) return send(response, 401, { error: 'Cloud account is no longer available.' })
      if (await businessExitPayments.findOne({ _id: account.businessId, closedAt: { $exists: true } })) return send(response, 403, { error: 'This business has completed its Stockroom exit.' })
      return send(response, 200, { account: publicAccount(account), accessToken: accessToken(account), refreshToken: String(input.refreshToken) })
    }
    if (request.method === 'GET' && request.url === '/v1/auth/me') {
      const claims = verifyToken(request)
      if (!isAccess(claims)) return send(response, 401, { error: 'Owner or staff access token required.' })
      const account = claims.role === 'owner'
        ? await accounts.findOne({ businessId: claims.businessId, email: claims.email, role: 'owner' })
        : await accounts.findOne({ businessId: claims.businessId, username: claims.username, role: { $in: ['admin', 'cashier'] } })
      if (!account || account.removedAt) return send(response, 401, { error: 'Account not found.' })
      return send(response, 200, { account: publicAccount(account) })
    }
    if (request.method === 'POST' && request.url === '/v1/auth/password-reset/request') {
      const input = await readJson(request)
      const renderRequestId = String(request.headers['rndr-id'] || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)
      const requestTag = renderRequestId ? ` requestId=${renderRequestId}` : ''
      const account = await accounts.findOne({ email: String(input.email || '').trim().toLowerCase() })
      // Always return the same response so email addresses cannot be discovered.
      // Staff accounts deliberately cannot recover access from their own email.
      // Only the business owner's recovery address is an account-control channel.
      if (!account || account.role !== 'owner') {
        console.info(`Password reset request skipped: no eligible owner account matched.${requestTag}`)
        return send(response, 202, { ok: true, delivered: false })
      }
      const rawToken = randomBytes(32).toString('base64url')
      await passwordResets.insertOne({ accountId: account._id, tokenHash: createHmac('sha256', jwtSecret).update(rawToken).digest('hex'), expiresAt: new Date(Date.now() + 30 * 60_000), usedAt: null })
      // Configure an email provider webhook outside this code. In non-production
      // development only, return the token to permit end-to-end testing.
      let delivered = false
      if (!mailConfigured()) {
        console.error(`Password reset email was not sent: mail configuration is incomplete or invalid.${requestTag}`, JSON.stringify(mailDiagnostics()))
      } else {
        try {
          delivered = await sendPasswordReset({ to: account.email, token: rawToken })
          if (delivered) console.info(`Password reset email delivered.${requestTag}`)
          else console.error(`Password reset email was not delivered.${requestTag}`)
        } catch (error) {
          const detail = error instanceof Error ? error.message : 'Unknown mail transport error.'
          const sensitiveValues = [account.email, rawToken, process.env.GMAIL_USER, process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET, process.env.GMAIL_REFRESH_TOKEN].filter(Boolean)
          const safeDetail = sensitiveValues.reduce((message, value) => message.replaceAll(value, '[redacted]'), detail)
          console.error(`Password reset email delivery failed.${requestTag}`, JSON.stringify({ message: safeDetail, code: error?.code || '', command: error?.command || '', responseCode: error?.responseCode || '' }))
        }
      }
      const responseBody = { ok: true, delivered, ...(process.env.NODE_ENV !== 'production' ? { resetToken: rawToken } : {}) }
      return send(response, 202, responseBody)
    }
    if (request.method === 'POST' && request.url === '/v1/auth/password-reset/confirm') {
      const input = await readJson(request)
      try {
        const result = await completeOwnerPasswordReset({ token: input.token, password: input.password, jwtSecret, passwordResets, accounts, refreshTokens, hashPassword, createAccessToken: accessToken })
        return send(response, 200, { account: publicAccount(result.account), accessToken: result.accessToken, message: 'Password updated. Existing devices remain connected.' })
      } catch (error) {
        return send(response, 400, { error: error instanceof Error ? error.message : 'Unable to reset owner password.' })
      }
    }
    if (request.method === 'POST' && request.url === '/v1/admin/devices') {
      if (request.headers['x-admin-key'] !== adminApiKey) return send(response, 401, { error: 'Unauthorized.' })
      const input = await readJson(request)
      const businessId = String(input.businessId || '')
      const deviceId = String(input.deviceId || '')
      if (!businessId || !deviceId) return send(response, 400, { error: 'businessId and deviceId are required.' })
      if (await devices.findOne({ businessId, deviceId, recoveryRetiredAt: { $exists: true } })) return send(response, 409, { error: 'This enrollment was permanently retired by till recovery. Use a new device ID.' })
      const expiresInDays = Math.min(Math.max(Number(input.expiresInDays) || 365, 1), 730)
      await devices.updateOne({ businessId, deviceId }, { $set: { businessId, deviceId, label: String(input.label || deviceId), enrolledAt: new Date(), revokedAt: null } }, { upsert: true })
      const token = deviceToken(businessId, deviceId)
      return send(response, 201, { businessId, deviceId, deviceToken: token, expiresInDays })
    }
    const claims = verifyToken(request)
    if (!claims) return send(response, 401, { error: 'Unauthorized.' })
    const device = isDevice(claims) ? await devices.findOne({ businessId: claims.businessId, deviceId: claims.deviceId }) : null
    if (isDevice(claims) && (!device || device.revokedAt || device.recoveryRetiredAt)) return send(response, 401, { error: 'This device has been revoked.' })
    if (request.method === 'GET' && request.url?.startsWith('/v1/business/settings')) {
      if (!isDevice(claims)) return send(response, 403, { error: 'Device token required.' })
      const query = new URL(request.url, `http://${request.headers.host}`).searchParams
      const businessId = query.get('businessId') || ''
      if (!businessId || claims.businessId !== businessId) return send(response, 403, { error: 'Token does not authorize this business.' })
      const current = await businessSettings.findOne({ businessId })
      if (current?.settings) return send(response, 200, { settings: current.settings })
      const latest = await operations.find({ businessId, entityType: 'settings', action: 'upsert' }).sort({ createdAt: -1, _id: -1 }).limit(1).next()
      return send(response, 200, { settings: latest?.payload || null })
    }
    if (request.method === 'POST' && request.url === '/v1/devices/enroll') {
      if (!isAccess(claims)) return send(response, 403, { error: 'Sign-in required.' })
      const input = await readJson(request)
      const deviceId = String(input.deviceId || '').trim()
      if (!/^[a-z0-9][a-z0-9-]{2,100}$/i.test(deviceId)) return send(response, 400, { error: 'A valid device ID is required.' })
      if (await devices.findOne({ businessId: claims.businessId, deviceId, recoveryRetiredAt: { $exists: true } })) return send(response, 409, { error: 'This enrollment was permanently retired by till recovery. Use a new device ID.' })
      await devices.updateOne({ businessId: claims.businessId, deviceId }, { $set: { businessId: claims.businessId, deviceId, label: String(input.label || deviceId), enrolledAt: new Date(), revokedAt: null, revokeReason: null } }, { upsert: true })
      return send(response, 201, { businessId: claims.businessId, deviceId, deviceToken: deviceToken(claims.businessId, deviceId) })
    }
    if (request.method === 'POST' && request.url === '/v1/staff') {
      if (!isAccess(claims) || claims.role !== 'owner') return send(response, 403, { error: 'Owner access token required.' })
      const input = await readJson(request)
      if (!await ownerPasswordIsValid(claims, input.ownerPassword)) return send(response, 401, { error: 'Owner password confirmation is required to create a staff account.' })
      const name = String(input.name || '').trim(); const email = String(input.email || '').trim().toLowerCase(); const staffUsername = username(input.username); const password = String(input.password || ''); const role = String(input.role || '')
      if (!name || (email && !/^\S+@\S+\.\S+$/.test(email)) || !validUsername(staffUsername) || password.length < 10 || !['admin', 'cashier'].includes(role)) return send(response, 400, { error: 'Provide valid staff details, a 3ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“32 character username, and a 10-character password.' })
      const staff = { businessId: claims.businessId, name, ...(email ? { email } : {}), username: staffUsername, role, passwordHash: hashPassword(password), createdAt: new Date() }
      try { const created = await accounts.insertOne(staff); staff._id = created.insertedId } catch (error) {
        if (error?.code === 11000) {
          const duplicate = error.keyPattern?.username ? 'username' : error.keyPattern?.email ? 'contact email' : 'staff account'
          return send(response, 409, { error: `That ${duplicate} is already in use.` })
        }
        throw error
      }
      // Credentials are deliberately never emailed. The owner gives the staff
      // member their username and temporary password through a private channel.
      return send(response, 201, { account: publicAccount(staff), invitationDelivered: false })
    }
    if (request.method === 'GET' && request.url === '/v1/staff') {
      if (!isAccess(claims) || claims.role !== 'owner') return send(response, 403, { error: 'Owner access token required.' })
      const staff = await Promise.all((await accounts.find({ businessId: claims.businessId }).sort({ createdAt: 1 }).toArray()).map(assignLegacyStaffUsername))
      return send(response, 200, { users: staff.map((account) => ({ ...publicAccount(account), createdAt: account.createdAt, removedAt: account.removedAt || null })) })
    }
    const accessMatch = request.url?.match(/^\/v1\/staff\/([^/]+)\/operational-access$/)
    if (request.method === 'PUT' && accessMatch) {
      if (!isAccess(claims) || claims.role !== 'owner') return send(response, 403, { error: 'Owner access token required.' })
      if (!ObjectId.isValid(accessMatch[1])) return send(response, 400, { error: 'Invalid staff account.' })
      const input = await readJson(request)
      if (!await ownerPasswordIsValid(claims, input.ownerPassword)) return send(response, 401, { error: 'Owner password confirmation is required to change cashier access.' })
      const updated = await accounts.findOneAndUpdate({ _id: new ObjectId(accessMatch[1]), businessId: claims.businessId, role: 'cashier', removedAt: { $exists: false } }, { $set: { operationalAccess: input.enabled === true } }, { returnDocument: 'after' })
      if (!updated) return send(response, 404, { error: 'Cashier account not found.' })
      return send(response, 200, { account: publicAccount(updated) })
    }
    const roleMatch = request.url?.match(/^\/v1\/staff\/([^/]+)\/role$/)
    if (request.method === 'PUT' && roleMatch) {
      if (!isAccess(claims) || claims.role !== 'owner') return send(response, 403, { error: 'Owner access token required.' })
      if (!ObjectId.isValid(roleMatch[1])) return send(response, 400, { error: 'Invalid staff account.' })
      const input = await readJson(request)
      if (!await ownerPasswordIsValid(claims, input.ownerPassword)) return send(response, 401, { error: 'Owner password confirmation is required to change a staff role.' })
      const role = String(input.role || '').trim().toLowerCase()
      if (!['admin', 'cashier'].includes(role)) return send(response, 400, { error: 'Role must be admin or cashier.' })
      const operationalAccess = role === 'admin' ? true : input.operationalAccess === true
      const updated = await accounts.findOneAndUpdate({ _id: new ObjectId(roleMatch[1]), businessId: claims.businessId, role: { $in: ['admin', 'cashier'] }, removedAt: { $exists: false } }, { $set: { role, operationalAccess } }, { returnDocument: 'after' })
      if (!updated) return send(response, 404, { error: 'Staff account not found.' })
      return send(response, 200, { account: publicAccount(updated) })
    }
    const passwordMatch = request.url?.match(/^\/v1\/staff\/([^/]+)\/password$/)
    if (request.method === 'PUT' && passwordMatch) {
      if (!isAccess(claims) || claims.role !== 'owner') return send(response, 403, { error: 'Owner access token required.' })
      if (!ObjectId.isValid(passwordMatch[1])) return send(response, 400, { error: 'Invalid staff account.' })
      const input = await readJson(request)
      const password = String(input.password || '')
      if (password.length < 10) return send(response, 400, { error: 'Password must be at least 10 characters.' })
      const updated = await accounts.findOneAndUpdate({ _id: new ObjectId(passwordMatch[1]), businessId: claims.businessId, role: { $in: ['admin', 'cashier'] }, removedAt: { $exists: false } }, { $set: { passwordHash: hashPassword(password), passwordChangedAt: new Date() } }, { returnDocument: 'after' })
      if (!updated) return send(response, 404, { error: 'Staff account not found.' })
      await refreshTokens.deleteMany({ accountId: updated._id })
      return send(response, 200, { account: publicAccount(updated) })
    }
    if (request.method === 'GET' && request.url === '/v1/devices') {
      if (!isAccess(claims)) return send(response, 403, { error: 'Owner access token required.' })
      const listed = await devices.find({ businessId: claims.businessId }).sort({ enrolledAt: -1 }).toArray()
      return send(response, 200, { devices: listed.map(({ _id, businessId, deviceId, label, enrolledAt, revokedAt, revokeReason }) => ({ id: _id, businessId, deviceId, label, enrolledAt, revokedAt, revokeReason })) })
    }
    const revokeMatch = request.url?.match(/^\/v1\/devices\/([^/]+)\/revoke$/)
    if (request.method === 'POST' && revokeMatch) {
      if (!isAccess(claims)) return send(response, 403, { error: 'Owner access token required.' })
      await devices.updateOne({ businessId: claims.businessId, deviceId: decodeURIComponent(revokeMatch[1]) }, { $set: { revokedAt: new Date(), revokeReason: 'Revoked by owner' } })
      return send(response, 200, { ok: true })
    }
    if (!isDevice(claims)) return send(response, 403, { error: 'Device token required.' })
    if (request.url?.startsWith('/v1/pos-paystack/')) {
      try { return send(response, 200, await posPaystack({ businessId: claims.businessId, path: request.url, method: request.method, input: request.method === 'POST' ? await readJson(request) : {} })) }
      catch (error) { return send(response, 400, { error: error.message }) }
    }
    if (request.method === 'POST' && request.url === '/v1/receipts/send') {
      const input = await readJson(request)
      let sale = await operations.findOne({ businessId: claims.businessId, entityType: 'sale', entityId: String(input.saleId || '') })
      if(!sale){const job=await entityHeads.findOne({businessId:claims.businessId,entityType:'pos_record','payload.kind':'service-job','payload.payments.sale.id':String(input.saleId||'')});const receipt=job?.payload.payments.find(entry=>entry.sale.id===String(input.saleId||'')).sale;if(receipt)sale={payload:receipt}}
      if (!sale) return send(response, 409, { error: 'Synchronize this receipt before sending it.' })
      try { await sendPosReceipt({ to: input.to, sale: sale.payload }); return send(response, 200, { sent: true }) }
      catch { return send(response, 400, { error: 'Receipt email could not be sent. Check the address and Gmail configuration.' }) }
    }
    if (request.method === 'GET' && request.url === '/v1/sync/capabilities') {
      if (claims.kind !== 'device' || !claims.businessId || !claims.deviceId) return send(response, 403, { error: 'An enrolled device is required.' })
      return send(response, 200, { capabilities: ['counter-v3', 'restaurant-v2', 'service-jobs-v1', 'customer-orders-v1'] })
    }
    if (request.method === 'POST' && request.url === '/v1/sync/push') {
      const input = await readJson(request)
      const businessId = String(input.businessId || '')
      const deviceId = String(input.deviceId || '')
      const incoming = Array.isArray(input.operations) ? input.operations.slice(0, 500) : []
      if (!businessId || !deviceId || !incoming.length || claims.businessId !== businessId || claims.deviceId !== deviceId) return send(response, 403, { error: 'Token does not authorize this business/device.' })
      if (await businessExitPayments.findOne({ _id: businessId, closedAt: { $exists: true } })) return send(response, 403, { error: 'This business has completed its Stockroom exit.' })
      return await serializeBusinessSync(businessId,async()=>{
      const containsNewSale = await Promise.all(incoming.filter(operation => (operation.entityType === 'sale' && operation.action === 'create') || (operation.entityType==='pos_record' && operation.payload?.kind==='restaurant-ledger')).map(operation => operations.findOne({ businessId, operationId: String(operation.operationId) }, { projection: { _id: 1 } }).then(existing => !existing)))
      for(const operation of incoming.filter(operation=>operation.entityType==='pos_record' && operation.payload?.kind==='service-job')) {
        const existing=await operations.findOne({businessId,operationId:String(operation.operationId)})
        const head=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:String(operation.entityId)})
        if(!existing && (operation.payload.payments?.length||0)>(head?.payload.payments?.length||0)) containsNewSale.push(true)
      }
      if (containsNewSale.some(Boolean)) {
        const access = await subscriptionHandler.access(businessId)
        if (access.blocked) return send(response, 402, { error: access.reason, status: access.status })
      }
      if (incoming.some(operation => operation.entityType === 'staff_removal')) return send(response, 403, { error: 'Staff removal requires owner authentication.' })
      const documents = incoming.map((operation) => ({ businessId, deviceId, operationId: String(operation.operationId), entityType: String(operation.entityType), entityId: String(operation.entityId), action: String(operation.action), payload: operation.payload || {}, createdAt: operation.createdAt || new Date().toISOString(), receivedAt: new Date() }))
      const acceptedOperationIds = []
      const conflicts = []
      for (const document of documents) {
        // Retries are normal after an interrupted response. They are successful
        // no-ops, never conflicts and never duplicate financial events.
        const previouslyStored=await operations.findOne({businessId,operationId:document.operationId})
        if (previouslyStored) {
          for(const reason of previouslyStored.coordinationWarnings||[])conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason})
          acceptedOperationIds.push(document.operationId)
          continue
        }
        if(document.entityType==='sale' && document.payload.paymentDetails?.serviceJob) {
          conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:'Synchronize invoice payments through their job record.'});continue
        }
        if(document.entityType==='sale' && document.payload.paymentDetails?.restaurantBill) {
          try {
            if(document.action!=='create' || document.entityId!==document.payload.id) throw new Error('Invalid bill payment operation.')
            const ledger=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:restaurantLedgerId(document.payload.paymentDetails.restaurantBill.sessionId)})
            const entry=ledger?.payload.payments.find(entry=>entry.id===document.entityId)
            if(!entry || entry.receiptHash!==await restaurantReceiptHash(document.payload)) throw new Error('Synchronize the accepted bill payment allocation before its receipt.')
            recordPayment(document.payload)
            const previous=await operations.findOne({businessId,entityType:'sale',entityId:document.entityId})
            if(previous) { if(await restaurantReceiptHash(previous.payload)!==entry.receiptHash) throw new Error('A different payment already uses this receipt ID.'); acceptedOperationIds.push(document.operationId);continue }
          }catch(error){conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:error.message});continue}
        }
        if (document.entityType === 'sale' && document.payload.paymentDetails?.counterOrder) {
          try {
            if (document.action !== 'create' || document.entityId !== document.payload.id) throw new Error('Invalid counter payment operation.')
            const order = await entityHeads.findOne({ businessId, entityType: 'pos_record', entityId: document.payload.paymentDetails.counterOrder.id })
            validateCounterPayment(document.payload, order?.payload)
            if(order?.payload.tableService) {
              const ledgers=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'restaurant-ledger','payload.branchId':order.payload.branchId}).toArray()
              if(ledgers.some(ledger=>ledger.payload.payments.some(payment=>payment.selections.some(part=>part.orderId===order.entityId)))) throw new Error('Use bill splitting to settle this partially paid order.')
            }
            const previous = await operations.findOne({ businessId, entityType: 'sale', entityId: document.entityId })
            if (previous) { validateCounterRetry(document.payload, previous.payload); acceptedOperationIds.push(document.operationId); continue }
          } catch (error) { conflicts.push({ operationId: document.operationId, entityType: document.entityType, entityId: document.entityId, reason: error.message }); continue }
        }
        if (document.entityType === 'retail_record') {
          try {
            if (document.action !== 'create' || document.entityId !== document.payload.id) throw new Error('Invalid purchasing operation.')
            validateRetailRecord(document.payload)
          } catch (error) { conflicts.push({ operationId: document.operationId, entityType: document.entityType, entityId: document.entityId, reason: error.message }); continue }
          const previous = await operations.findOne({ businessId, entityType: 'retail_record', entityId: document.entityId })
          if (previous) {
            if (JSON.stringify(previous.payload) !== JSON.stringify(document.payload)) conflicts.push({ operationId: document.operationId, entityType: document.entityType, entityId: document.entityId, reason: 'Purchasing record ID already exists with different details.' })
            else acceptedOperationIds.push(document.operationId)
            continue
          }
        }
        if(document.entityType==='retail_record' && document.payload.kind==='pricing'){
          const filter={businessId,entityType:'product',entityId:document.payload.productId}
          const product=await entityHeads.findOne(filter)
          if(product && product.operationId!==document.operationId && product.payload.updated!==document.payload.before.updatedAt){conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:'The product changed on another till. Refresh and review the price change.'});continue}
          if(product && product.operationId!==document.operationId){const changed=await entityHeads.updateOne({...filter,operationId:product.operationId},{$set:{payload:{...product.payload,price:document.payload.price,cost:document.payload.cost,barcode:document.payload.barcode,updated:document.payload.createdAt},operationId:document.operationId,updatedAt:document.payload.createdAt}});if(!changed.matchedCount){conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:'A concurrent price change won. Refresh pricing.'});continue}}
        }
        if (mutableEntities.has(document.entityType)) {
          if (document.entityType === 'settings') {
            if (document.payload?.shopProfile != null && document.payload.shopProfile !== 'null') {
              try {
                const profile = typeof document.payload.shopProfile === 'string' ? JSON.parse(document.payload.shopProfile) : document.payload.shopProfile
                const previous = await businessSettings.findOne({ businessId })
                if ((normalizeShopProfile(previous?.settings?.shopProfile).fastFood && profile.fastFood === undefined) || (normalizeShopProfile(previous?.settings?.shopProfile).restaurant && profile.restaurant === undefined)) throw new Error('Update this device before changing Fast food workspace settings.')
                document.payload.shopProfile = validateShopProfile(profile)
              }
              catch { conflicts.push({ operationId: document.operationId, entityType: document.entityType, entityId: document.entityId, reason: 'Invalid shop setup. Save a valid setup and sync again.' }); continue }
            } else {
              const previous = await businessSettings.findOne({ businessId })
              if (previous?.settings?.shopProfile) document.payload.shopProfile = normalizeShopProfile(previous.settings.shopProfile)
            }
          }
          const filter = { businessId, entityType: document.entityType, entityId: document.entityId }
          const current = await entityHeads.findOne(filter)
          if(document.entityType==='pos_record' && (document.payload.kind?.startsWith('restaurant-') || document.payload.kind==='service-job') && current?.operationId===document.operationId) {
            if(JSON.stringify(current.payload)!==JSON.stringify(document.payload)){conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:'This operation ID already has different details.'});continue}
            // Recover a response/database interruption between storing the
            // accepted head and appending its downloadable operation.
            try{await operations.insertOne(document)}catch(error){if(error.code!==11000)throw error}
            acceptedOperationIds.push(document.operationId);continue
          }
          if(document.entityType==='pos_record' && document.payload.kind==='service-job') {
            try { if(document.entityId!==document.payload.id || document.action!=='upsert')throw new Error('Invalid service job operation.');const refunds=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'return','payload.saleId':{$in:(current?.payload?.payments||[]).map(entry=>entry.sale.id)}}).toArray();validateServiceJob(document.payload,current?.payload,false,refunds.map(row=>row.payload));for(const entry of document.payload.payments){recordPayment(entry.sale);if(await entityHeads.findOne({businessId,entityType:'pos_record',entityId:{$ne:document.entityId},'payload.kind':'service-job','payload.payments.sale.id':entry.sale.id}))throw new Error('This payment ID is already used by another job.')} }
            catch(error){conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:error.message,localPayload:document.payload,remotePayload:current?.payload||{}});continue}
          }
          const restaurantFloor=document.entityType==='pos_record' && (document.payload.kind?.startsWith('restaurant-')||document.payload.tableService) ? await entityHeads.findOne({businessId,entityType:'pos_record',entityId:floorId(document.payload.branchId)}) : null
          if(document.entityType==='pos_record' && document.payload.kind==='restaurant-floor') {
            try {
              if(document.action!=='upsert'||document.entityId!==document.payload.id)throw new Error('Invalid table arrangement operation.')
              const tabs=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'restaurant-tab','payload.branchId':document.payload.branchId}).toArray()
              const layout=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:`restaurant-layout:${document.payload.branchId}`})
              const sales=await operations.find({businessId,entityType:'sale'}).toArray()
              const ledgers=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'restaurant-ledger','payload.branchId':document.payload.branchId}).toArray()
              validateRestaurantFloor(document.payload,current?.payload,tabs.map(row=>row.payload),layout?.payload||{tables:[]},[...sales.map(row=>row.payload),...ledgers.map(row=>row.payload.latestSale)])
            }catch(error){conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:error.message,localPayload:document.payload,remotePayload:current?.payload||{}});continue}
          }
          if(document.entityType==='pos_record' && document.payload.kind==='restaurant-ledger') {
            try {
              if(document.action!=='upsert' || document.entityId!==document.payload.id) throw new Error('Invalid bill payment allocation.')
              const tab=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:document.payload.tabId})
              const orders=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'counter-order','payload.branchId':document.payload.branchId}).toArray()
              const legacy=await operations.find({businessId,entityType:'sale',entityId:{$in:orders.map(row=>`counter-payment:${row.entityId}`)}}).toArray()
              recordPayment(document.payload.latestSale)
              const effective=tab&&restaurantTabs([tab.payload],restaurantFloor?.payload)[0]
              await validateRestaurantLedger(document.payload,current?.payload,effective,orders.map(row=>row.payload).filter(order=>effective&&billContains(effective,order)),legacy.map(row=>row.payload))
            }catch(error){conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:error.message,localPayload:document.payload,remotePayload:current?.payload||{}});continue}
          }
          if (document.entityType === 'pos_record' && ['restaurant-layout','restaurant-tab'].includes(document.payload.kind)) {
            try {
              if(document.entityId !== document.payload.id || document.action !== 'upsert') throw new Error('Invalid restaurant operation.')
              validateRestaurantRecord(document.payload,current?.payload)
              if(document.payload.kind==='restaurant-tab' && document.payload.status==='open' && (!current || current.payload.sessionId!==document.payload.sessionId)){const duplicate=await entityHeads.findOne({businessId,entityType:'pos_record','payload.kind':'restaurant-tab',$or:[{'payload.sessionId':document.payload.sessionId},{'payload.history.sessionId':document.payload.sessionId}]});if(duplicate)throw new Error('Use a new unique bill session.')}

              if(document.payload.kind === 'restaurant-layout') {
                const activeRecords=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'restaurant-tab','payload.branchId':document.payload.branchId,'payload.status':'open'}).toArray()
                const active=restaurantTabs(activeRecords.map(row=>row.payload),restaurantFloor?.payload).filter(tab=>!tab.mergedInto)
                for(const tab of active.filter(tab=>tab.displayTableId)) {
                  const before=current?.payload.tables.find(table=>table.id===tab.displayTableId), after=document.payload.tables.find(table=>table.id===tab.displayTableId)
                  if(!before || JSON.stringify(before)!==JSON.stringify(after)) throw new Error('Close the table bill before changing its setup.')
                }
              } else if(document.payload.status === 'open' && document.payload.tableId) {
                const layout=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:`restaurant-layout:${document.payload.branchId}`})
                const table=layout?.payload.tables.find(table=>table.id===document.payload.tableId)
                const bills=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'restaurant-tab','payload.branchId':document.payload.branchId,'payload.status':'open'}).toArray()
                if(!current || current.payload.sessionId!==document.payload.sessionId) if(restaurantTabs(bills.map(row=>row.payload),restaurantFloor?.payload).some(tab=>!tab.mergedInto&&tab.displayTableId===document.payload.tableId))throw new Error('This table already has an open bill.')
                if(!table || document.payload.guests>table.seats) throw new Error('Synchronize table setup before opening its bill.')
              } else if(document.payload.status === 'closed') {
                const orders=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'counter-order','payload.branchId':document.payload.branchId}).toArray()
                const paid=await operations.find({businessId,entityType:'sale',entityId:{$in:orders.map(row=>`counter-payment:${row.entityId}`)}}).toArray()
                const ledger=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:restaurantLedgerId(document.payload.sessionId)})
                const billPayments=(ledger?.payload.payments||[]).map(entry=>({id:entry.id,paymentDetails:{restaurantBill:{selections:entry.selections}}}))
                validateRestaurantClose(restaurantTabs([document.payload],restaurantFloor?.payload)[0],orders.map(row=>row.payload),[...paid.map(row=>row.payload),...billPayments])
              }
            } catch(error) { conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:error.message,localPayload:document.payload,remotePayload:current?.payload||{}});continue }
          }
          if (document.entityType === 'pos_record' && document.payload.kind === 'counter-consumption') {
            try {
              if (document.entityId !== document.payload.id || document.action !== 'upsert') throw new Error('Invalid recipe consumption operation.')
              const order = await entityHeads.findOne({ businessId, entityType: 'pos_record', entityId: document.payload.orderId })
              if (!order?.payload || order.payload.kind !== 'counter-order') throw new Error('Synchronize the saved order before its ingredient consumption.')
              validateConsumption(document.payload, order.payload, current?.payload)
            } catch (error) { conflicts.push({ operationId: document.operationId, entityType: document.entityType, entityId: document.entityId, reason: error.message, localPayload: document.payload, remotePayload: current?.payload || {} }); continue }
          }
          if (document.entityType === 'pos_record' && ['counter-menu', 'counter-order'].includes(document.payload.kind)) {
            try {
              if (document.entityId !== document.payload.id || document.action !== 'upsert') throw new Error('Invalid counter-service operation.')
              if (!current && (document.payload.source === 'customer-portal' || document.payload.acceptedTillId || document.payload.customerPortalId)) throw new Error('Online orders must be submitted through the customer portal.')
              if (current?.payload?.source === 'customer-portal' && document.payload.status !== 'cancelled' && !current.payload.acceptedTillId) throw new Error('Accept this online order on a till before processing it.')
              validateCounterRecord(document.payload, current?.payload)
              if(document.payload.tableService && (!current || document.payload.action === 'edit' || document.payload.status === 'cancelled')) {
                const tabHead=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:document.payload.tableService.tabId})
                let tab=tabHead?{payload:restaurantTabs([tabHead.payload],restaurantFloor?.payload)[0]}:null
                if(tab?.payload.mergedInto && document.payload.status==='cancelled'){const parent=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:tab.payload.mergedInto.tabId});tab=parent?{payload:restaurantTabs([parent.payload],restaurantFloor?.payload)[0]}:null}
                if(!tab?.payload || tab.payload.mergedInto || tab.payload.status!=='open' || !billContains(tab.payload,document.payload) || tab.payload.branchId!==document.payload.branchId || tab.payload.tillId!==document.payload.tillId || tab.payload.currency!==document.payload.currency || tab.payload.businessName!==document.payload.businessName || document.payload.tableService.seat>tab.payload.guests) throw new Error('Synchronize the open table bill before adding its orders.')
              }
              if (document.payload.kind === 'counter-order' && ['preparing','ready','collected'].includes(document.payload.status) && recipeRequirements(document.payload).length && !await entityHeads.findOne({ businessId, entityType: 'pos_record', entityId: consumptionId(document.entityId) })) throw new Error('Synchronize ingredient consumption before preparation progress.')
              if (document.payload.kind === 'counter-order' && (document.payload.action === 'edit' || current)) {
                const legacy=await operations.findOne({businessId,entityType:'sale',entityId:`counter-payment:${document.entityId}`})
                const ledgers=document.payload.tableService?await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'restaurant-ledger','payload.branchId':document.payload.branchId}).toArray():[]
                const linked=ledgers.flatMap(row=>row.payload.payments).filter(payment=>payment.selections.some(part=>part.orderId===document.entityId)).map(entry=>({id:entry.id,paymentDetails:{restaurantBill:{selections:entry.selections}}}))
                const payments=[...(legacy?[legacy.payload]:[]),...linked],state=restaurantOrderPayment(document.payload,payments)
                if(state.paymentStarted && document.payload.action==='edit') throw new Error('A paid order cannot be corrected. Refund it and create a new order.')
                if(state.paymentStarted && document.payload.action!=='edit') {
                  const refunds=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'return','payload.saleId':{$in:payments.map(sale=>sale.id)}}).toArray()
                  const refunded=Math.round(refunds.reduce((sum,row)=>{
                    const sale=payments.find(sale=>sale.id===row.payload.saleId)
                    if(sale?.paymentDetails?.counterOrder)return sum+Number(row.payload.total||0)
                    return sum+row.payload.items.filter(item=>sale?.paymentDetails.restaurantBill.selections[item.lineIndex]?.orderId===document.entityId).reduce((n,item)=>n+Number(item.amount),0)
                  },0)*100)
                  if(document.payload.status!=='cancelled' && refunded>=Math.round(document.payload.total*100))throw new Error('Cancel a fully refunded order instead of preparing or serving it.')
                  if(document.payload.status==='cancelled' && refunded<Math.round(state.paidAmount*100))throw new Error('Synchronize the full paid portion refund before cancelling this order.')
                }
              }
              if (document.payload.kind === 'counter-order' && document.payload.status === 'collected' && !document.payload.tableService && !await operations.findOne({ businessId, entityType: 'sale', entityId: `counter-payment:${document.entityId}` })) throw new Error('Synchronize the order payment before handover.')
            } catch (error) { conflicts.push({ operationId: document.operationId, entityType: document.entityType, entityId: document.entityId, reason: error.message, localPayload: document.payload, remotePayload: current?.payload || {} }); continue }
          }
          if (document.entityType === 'product') {
            try { document.payload.customValues = { ...readCustomValues(current?.payload?.customValues), ...readCustomValues(document.payload.customValues) } }
            catch { conflicts.push({ operationId: document.operationId, entityType: document.entityType, entityId: document.entityId, reason: 'Invalid custom product details.' }); continue }
          }
          if(document.entityType==='pos_record' && document.payload.expectedUpdatedAt!==undefined && document.payload.expectedUpdatedAt!==(current?.payload?.updatedAt||'')){
            conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:'This record was changed on another till. Refresh and review the other version.',localPayload:document.payload,remotePayload:current?.payload||{}});continue
          }
          if (!isNewerMutableOperation(document, current)) {
            conflicts.push({ operationId: document.operationId, entityType: document.entityType, entityId: document.entityId, reason: 'A newer version of this record was saved on another device.', localPayload: document.payload, remotePayload: current.payload })
            continue
          }
          try {
            const guarded=document.entityType==='pos_record' && document.payload.expectedUpdatedAt!==undefined
            const result=await entityHeads.updateOne(guarded && current?{...filter,operationId:current.operationId}:filter,{ $set: { updatedAt: operationUpdatedAt(document), payload: document.payload, operationId: document.operationId, deviceId, receivedAt: new Date() } },{upsert:guarded?!current:true})
            if(guarded && current && !result.matchedCount){conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:'A concurrent till edit won. Refresh this record.'});continue}
          }catch(error){if(error.code!==11000)throw error;conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:'A concurrent till created this record. Refresh before editing.'});continue}

        }
        const coordinationWarnings=await coordinateSupermarket(document)
        document.coordinationWarnings=coordinationWarnings
        for(const reason of coordinationWarnings)conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason,localPayload:document.payload})
        try { await operations.insertOne(document) }
        catch (error) {
          if (error?.code === 11000) {
            if (document.entityType === 'retail_record') {
              const previous = await operations.findOne({ businessId, entityType: 'retail_record', entityId: document.entityId })
              if(!previous && document.payload.kind==='supplier-opening'){conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:'This supplier already has an opening balance from another till. Review the existing entry.'});continue}
              if (previous && JSON.stringify(previous.payload) !== JSON.stringify(document.payload)) { conflicts.push({ operationId: document.operationId, entityType: document.entityType, entityId: document.entityId, reason: 'Purchasing record ID already exists with different details.' }); continue }
            }
            acceptedOperationIds.push(document.operationId); continue
          }
          throw error
        }
        try { await processInventoryNotification(document) } catch (error) { console.error('Inventory notification processing failed.', error instanceof Error ? error.message : 'Unknown error.') }
        if (document.entityType === 'settings' && document.action === 'upsert' && document.payload?.appName && document.payload?.currency) {
          await businessSettings.updateOne({ businessId }, { $set: { businessId, settings: document.payload, updatedAt: operationUpdatedAt(document), receivedAt: new Date() } }, { upsert: true })
        }
        acceptedOperationIds.push(document.operationId)
      }
      return send(response, 200, { acceptedOperationIds, conflicts })
      })
    }
    if (request.method === 'GET' && request.url?.startsWith('/v1/sync/pull')) {
      const query = new URL(request.url, `http://${request.headers.host}`).searchParams
      const businessId = query.get('businessId') || ''
      const deviceId = query.get('deviceId') || ''
      const cursor = query.get('cursor') || ''
      if (!businessId || !deviceId || claims.businessId !== businessId || claims.deviceId !== deviceId) return send(response, 403, { error: 'Token does not authorize this business/device.' })
      if (await businessExitPayments.findOne({ _id: businessId, closedAt: { $exists: true } })) return send(response, 403, { error: 'This business has completed its Stockroom exit.' })
      // Newer clients request their own history during recovery. Older clients
      // retain the original behaviour until upgraded, preventing a deployment
      // from changing their replay semantics unexpectedly.
      const includeOwn = query.get('includeOwn') === '1'
      const filter = { businessId, ...(!includeOwn ? { deviceId: { $ne: deviceId } } : {}), ...(ObjectId.isValid(cursor) ? { _id: { $gt: new ObjectId(cursor) } } : {}) }
      const rows = await operations.find(filter).sort({ _id: 1 }).limit(500).toArray()
      if (query.get('customerOrderCapability') !== 'customer-orders-v1' && rows.some(row => row.payload?.source === 'customer-portal')) return send(response, 426, { error: 'Update this device to safely accept and process online customer orders.' })
      if (query.get('staffCapability') !== 'staff-removal-v1' && rows.some(row => row.entityType === 'staff_removal')) return send(response, 426, { error: 'Update this device to apply staff access removals.' })
      if(query.get('serviceJobCapability')!=='service-jobs-v1' && rows.some(requiresServiceJobSync)) return send(response,426,{error:'Update this device to synchronize service jobs and invoice payments.'})
      if (query.get('restaurantCapability') !== 'restaurant-v2' && rows.some(row=>['restaurant-layout','restaurant-tab','restaurant-ledger','restaurant-floor'].includes(row.payload?.kind) || row.payload?.restaurantOrder || row.payload?.paymentDetails?.restaurantBill || row.payload?.id === 'restaurant-menu' || row.payload?.tableService || row.payload?.paymentDetails?.counterOrder?.tableService || row.payload?.shopProfile?.restaurant || row.payload?.shopProfile?.workflows === 'restaurant')) return send(response,426,{error:'Update this device to synchronize Restaurant & bar tables, bills and orders.'})
      if (query.get('capabilities') !== 'counter-v3' && rows.some(row => ['counter-menu', 'counter-order', 'counter-consumption'].includes(row.payload?.kind) || row.payload?.paymentDetails?.counterOrder || row.payload?.shopProfile?.fastFood || row.payload?.shopProfile?.workflows === 'fast-food')) return send(response, 426, { error: 'Update this device to synchronize Fast food orders and payments.' })
      if (!['retail-v3', 'business-v4'].includes(query.get('protocol')) && rows.some(row => row.entityType === 'retail_record' || row.payload?.stockEvent || row.payload?.counts?.some(count=>count.stockEvent) || row.payload?.batchAllocations || row.payload?.items?.some(item=>item.batchAllocations))) return send(response, 426, { error: 'Update this device to synchronize supermarket stock and financial records.' })
      return send(response, 200, { operations: rows.map(({ _id, ...operation }) => ({ ...operation, operationId: operation.operationId })), cursor: rows.length ? rows.at(-1)._id.toString() : cursor })
    }
    return send(response, 404, { error: 'Not found.' })
  } catch (error) {
    console.error(error)
    return send(response, error.statusCode || 500, { error: error.statusCode ? error.message : 'Sync service error.' })
  }
})

server.listen(port, () => {
  console.log(`Sync API listening on ${port}`)
  console.info('Mail transport configuration:', JSON.stringify(mailDiagnostics()))
})
