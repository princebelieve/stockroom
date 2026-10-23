import { birthdayValue, birthdayCustomers } from '../server/customer-birthdays.mjs'
import { businessDate } from '../server/report-timezone.mjs'
import { retailCatalogue } from '../server/retail-catalogue.mjs'
import { parsePermissions, hasPermission, operationPermission } from '../server/staff-permissions.mjs'
import { defaultCashierPermissions } from '../server/workspace-capabilities.mjs'
import { normalizeShopProfile, validateShopProfile } from '../server/shop-profile.mjs'
import { oilPricing } from '../server/oil-pricing.mjs'
import { validateChurchRecord, requiresChurchSync } from '../server/church-ledger.mjs'
import { reservationBookId, reservationChange, validateReservationBook, validateReservationArchive, checkReservationOpening, requiresReservationSync } from '../server/restaurant-reservations.mjs'
import { isStockWork, validateStockWork } from '../server/stock-work.mjs'
import { createPreparationPrint } from './preparation-print.mjs'
import { customerOrderSettings, customerHandoff } from '../server/customer-order-settings.mjs'
import { createTillRecovery } from './till-recovery.mjs'
import { authorizeCustomerOrder, customerOrderLines, publishCustomerOrder as publishOrder, acceptCustomerOrder } from './customer-orders.mjs'
import { createStaffRemoval } from './staff-removal.mjs'
import { validateServiceJob, validateHospitalityInvoice, serviceJobBalance, requiresServiceJobSync } from '../server/service-jobs.mjs'
import { validateHospitalityRecord, requiresHospitalitySync, hotelRoomBlockActive, hotelRoomOutOfOrder, hotelRoomRestrictionsAllow, hotelRateBreakdown, hotelNightlyRates, hotelDepositRequirement } from '../server/hospitality-operations.mjs'
import { buildHotelNightAudit, validateHotelDayClose, validateHotelJournal } from '../server/hotel-accounting.mjs'
import { hotelCalendarIcs } from '../server/hotel-calendar.mjs'
import { fetchHotelCalendar, validateHotelCalendarUrl } from '../server/hotel-calendar-import.mjs'
import { floorId,restaurantTabs,billContains,validateRestaurantFloor } from '../server/restaurant-floor.mjs'
import { validateRestaurantLedger, restaurantLedgerId, restaurantReceiptHash, restaurantOrderPayment } from '../server/restaurant-payments.mjs'
import { recordPayment } from '../server/payment.mjs'
import { validateRestaurantRecord, validateRestaurantClose } from '../server/restaurant-service.mjs'
import { restaurantPortion } from '../server/restaurant-payments.mjs'
import { validateConsumption, recipeRequirements, consumptionId } from '../server/counter-recipes.mjs'
import { createSupermarketCoordinator } from './supermarket-coordination.mjs'
import { validateRetailRecord } from '../server/retail.mjs'
import { validateCounterRecord, validateCounterPayment, validateCounterRetry, counterItems, counterSaleId } from '../server/counter-service.mjs'
import { createPosPaystack } from './pos-paystack.mjs'
import { createTenantIntegrations } from './tenant-integrations.mjs'
import { createHospitalityPayments } from './hospitality-payments.mjs'
import { createCustomerPaystackPayments, PAYSTACK_MINIMUM_SUBUNITS } from './customer-paystack-payments.mjs'
import { createChannexBookingSync } from './channex-booking-sync.mjs'
import { createServer } from 'node:http'
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { MongoClient, ObjectId } from 'mongodb'
import { identicalSettings, isNewerMutableOperation, mutableEntities, operationUpdatedAt } from './conflict-policy.mjs'
import { checkMailAuthorization, mailConfigured, mailDiagnostics, hospitalityMailConfigured, hospitalityMailProvider, sendPosReceipt, sendBusinessRegistrationKey, sendPasswordReset, sendSupportRequest, sendHospitalityBookingNotice } from './mailer.mjs'
import { submitSupportRequest } from './support-requests.mjs'
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
import { readCustomValues } from '../server/shop-fields.mjs'
import { posSettings, priceOrder } from '../server/pos-pricing.mjs'
import { receiptSettings } from '../server/receipts.mjs'
import { lookupOpenFoodFacts, searchProductNames } from '../server/open-food-facts.mjs'
import { findSharedProduct, queueSharedProductContribution, processSharedProductContributionQueue, catalogueContributionMode, canonicalProductBarcode, equivalentProductBarcodes } from './shared-product-catalogue.mjs'

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
const hotelCalendarSources = database.collection('hotel_calendar_sources')
const hospitalityEmailLog = database.collection('hospitality_email_log')
const tenantIntegrations = createTenantIntegrations({ database })
const sharedProductCatalogue = database.collection('shared_product_catalogue_contributions')
const sharedProductCatalogueQueue = database.collection('shared_product_catalogue_queue')
const inventoryAlertState = database.collection('inventory_alert_state')
async function publishedRetail(businessId,settings){
 const config=customerOrderSettings(settings?.paymentPolicy?.customerOrdering)
 if(!config.retailEnabled)throw new Error('Online retail ordering is not enabled.')
 const rows=await entityHeads.find({businessId,entityType:'product',entityId:{$in:config.retailProductIds}}).toArray()
 const taxHead=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:'pos-settings'})
 return retailCatalogue(rows.map(row=>row.payload),config,taxHead?.updatedAt||'')
}
const accounts = database.collection('accounts')
const supportRequests = database.collection('support_requests')
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
await entityHeads.createIndex({ businessId: 1, entityType: 1, 'payload.channelPropertyId': 1, 'payload.channelBookingId': 1, 'payload.channelBookingRoomId': 1 }, { unique: true, name: 'unique_channel_stay_room', partialFilterExpression: { entityType: 'pos_record', 'payload.kind': 'hotel-stay', 'payload.source': 'channex' } })
await entityHeads.createIndex({ businessId: 1, entityType: 1, 'payload.kind': 1, 'payload.source': 1, 'payload.channelPropertyId': 1, 'payload.channelBookingId': 1 }, { name: 'hotel_channel_booking_lookup', partialFilterExpression: { entityType: 'pos_record', 'payload.kind': 'hotel-stay', 'payload.source': 'channex' } })
await entityHeads.createIndex({ businessId: 1, entityType: 1, 'payload.barcode': 1 }, { name: 'business_product_barcode', partialFilterExpression: { entityType: 'product', 'payload.barcode': { $type: 'string' } } })
await businessSettings.createIndex({ businessId: 1 }, { unique: true })
await sharedProductCatalogue.createIndex({ barcode: 1, lastContributedAt: -1 })
await sharedProductCatalogueQueue.createIndex({ businessId: 1, state: 1, createdAt: 1 })
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
await entityHeads.createIndex({ 'payload.calendarFeedToken': 1 }, { sparse: true })
await hotelCalendarSources.createIndex({ businessId: 1, roomId: 1, sourceId: 1 }, { unique: true })
await database.collection('business_integrations').createIndex({ 'properties.propertyId': 1 }, { unique: true, partialFilterExpression: { provider: 'channex' } })
await database.collection('channex_ari_queue').createIndex({ businessId: 1, branchId: 1, roomTypeKey: 1 }, { unique: true, name: 'unique_channex_ari_dirty_room_type' })
await database.collection('channex_ari_expiries').createIndex({ businessId: 1, branchId: 1, blockId: 1 }, { unique: true, name: 'unique_channex_ari_hold_expiry' })
await hospitalityEmailLog.createIndex({ businessId: 1, bookingId: 1, messageType: 1 }, { unique: true })
await hospitalityEmailLog.createIndex({ businessId: 1, createdAt: -1 })

async function refreshHotelCalendarSource(source) {
  try {
    const blocks = await fetchHotelCalendar(source.url)
    await hotelCalendarSources.updateOne({ _id: source._id }, { $set: { blocks, lastSyncedAt: new Date(), nextSyncAt: new Date(Date.now() + 15 * 60_000), syncError: '' } })
    if (JSON.stringify(blocks) !== JSON.stringify(source.blocks || [])) await queueCalendarSourceAri(source, [...(source.blocks || []), ...blocks])
    return { ...source, blocks, lastSyncedAt: new Date(), syncError: '' }
  } catch (error) {
    await hotelCalendarSources.updateOne({ _id: source._id }, { $set: { nextSyncAt: new Date(Date.now() + 5 * 60_000), syncError: String(error?.message || 'Calendar sync failed.').slice(0, 240) } })
    throw error
  }
}
async function queueCalendarSourceAri(source, blocks) {
  const room = await entityHeads.findOne({ businessId: source.businessId, entityType: 'pos_record', entityId: source.roomId, 'payload.kind': 'hotel-room' })
  if (!room) return
  const timezone = normalizeShopProfile((await businessSettings.findOne({ businessId: source.businessId }))?.settings?.shopProfile).reportingTimeZone || 'UTC'
  const start = businessDate(new Date(), timezone), end = new Date(Date.parse(`${start}T00:00:00Z`) + 500 * 86400000).toISOString().slice(0, 10), dates = new Set()
  for (const block of blocks) for (let stamp = Date.parse(`${block.checkIn}T00:00:00Z`); stamp < Date.parse(`${block.checkOut}T00:00:00Z`); stamp += 86400000) {
    const date = new Date(stamp).toISOString().slice(0, 10)
    if (date >= start && date < end) dates.add(date)
  }
  await channexBookingSync.enqueueAriDates(source.businessId, source.branchId || room.payload.branchId, room.payload.roomType || 'Standard', [...dates])
}
async function hotelCalendarBlocks(businessId, roomId, knownHeads) {
  const sources = await hotelCalendarSources.find({ businessId, roomId }).toArray()
  const imported=sources.flatMap(source => Array.isArray(source.blocks) ? source.blocks.map(block => ({ ...block, id: `${source.sourceId}:${block.id}`, sourceName: source.name })) : [])
  const room=knownHeads?.find(row=>row.entityId===roomId&&row.payload?.kind==='hotel-room')||await entityHeads.findOne({businessId,entityType:'pos_record',entityId:roomId})
  const outages=(room?.payload?.outOfOrderPeriods||[]).filter(period=>period.status==='scheduled').map(period=>({id:period.id,checkIn:period.startDate,checkOut:period.endDate}))
  const holds=knownHeads?knownHeads.filter(row=>row.payload.kind==='hotel-room-block'&&row.payload.status==='held'):await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'hotel-room-block','payload.status':'held'}).toArray()
  return [...imported,...outages,...holds.map(row=>row.payload||row).filter(block=>hotelRoomBlockActive(block)&&block.rooms.some(room=>room.roomId===roomId)).map(block=>({id:`${block.id}:${roomId}`,checkIn:block.checkIn,checkOut:block.checkOut}))]
}
function hotelRoomTypeOfferId(branchId,roomType){return `roomtype:${Buffer.from(`${branchId}:${String(roomType||'Standard').trim().toLocaleLowerCase()}`).toString('base64url')}`}
async function hotelRoomTypeOffers(businessId,heads,checkIn,checkOut,datesProvided,datesValid,guestCount=1){
  const groups=new Map(),activeRooms=heads.filter(row=>row.payload.kind==='hotel-room'&&row.payload.status==='active'&&Number(row.payload.maxGuests||2)>=guestCount)
  for(const row of activeRooms){const room=row.payload,type=String(room.roomType||'Standard').trim()||'Standard',key=`${room.branchId}:${type.toLocaleLowerCase()}`;groups.set(key,[...(groups.get(key)||[]),row])}
  const result=[]
  for(const [key,rows] of groups){const candidates=[];for(const row of rows){const room=row.payload,blocked=datesProvided&&datesValid&&(heads.some(stay=>stay.payload.kind==='hotel-stay'&&stay.payload.branchId===room.branchId&&stay.payload.roomId===row.entityId&&['booked','checked-in'].includes(stay.payload.status)&&checkIn<stay.payload.checkOut&&checkOut>stay.payload.checkIn)||(await hotelCalendarBlocks(businessId,row.entityId,heads)).some(block=>checkIn<block.checkOut&&checkOut>block.checkIn));if(!datesProvided||datesValid&&!blocked){const nightlyRates=datesValid?hotelNightlyRates(room,checkIn,checkOut):[{date:'',nightlyRate:Number(room.nightlyRate)}],quoteTotal=Math.round(nightlyRates.reduce((sum,night)=>sum+Number(night.nightlyRate||0),0)*100)/100;candidates.push({row,room,nightlyRates,quoteTotal,nightlyRate:datesValid?quoteTotal/nightlyRates.length:Number(room.nightlyRate)})}}
    const cheapest=candidates.slice().sort((a,b)=>a.quoteTotal-b.quoteTotal||a.room.roomName.localeCompare(b.room.roomName))[0],representative=cheapest||{room:rows[0].payload,nightlyRate:Number(rows[0].payload.nightlyRate)},amenities=(representative.room.amenities||[]).filter(value=>rows.every(row=>(row.payload.amenities||[]).includes(value))),beds=new Set(rows.map(row=>row.payload.bedConfiguration||'')),maxGuests=Math.max(...rows.map(row=>Number(row.payload.maxGuests||2))),availableUnits=datesProvided?(datesValid?candidates.length:0):rows.length
    result.push({id:hotelRoomTypeOfferId(rows[0].payload.branchId,rows[0].payload.roomType||'Standard'),branchId:rows[0].payload.branchId,name:rows[0].payload.roomType||'Standard',roomType:rows[0].payload.roomType||'Standard',bedConfiguration:beds.size===1?rows[0].payload.bedConfiguration||'':'',maxGuests,amenities,nightlyRate:representative.nightlyRate,quoteTotal:datesValid?cheapest?.quoteTotal:undefined,available:availableUnits>0,availableUnits,totalUnits:rows.length,inventoryPool:true,cancellationHours:Number(representative.room.cancellationHours||0),cancellationPolicy:representative.room.cancellationPolicy||'',noShowPolicy:representative.room.noShowPolicy||''})
  }
  return result.sort((a,b)=>a.branchId.localeCompare(b.branchId)||a.roomType.localeCompare(b.roomType))
}
setInterval(async () => {
  const due = await hotelCalendarSources.find({ nextSyncAt: { $lte: new Date() } }).limit(30).toArray().catch(() => [])
  for (const source of due) await refreshHotelCalendarSource(source).catch(() => {})
}, 60_000).unref()

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
function publicAccount(account) { return { id: account._id?.toString(), businessId: account.businessId, name: account.name || account.ownerName, email: account.email, username: account.username || '', role: account.role || 'owner', permissions:parsePermissions(account.permissions), operationalAccess: Boolean(account.operationalAccess) } }
function accessToken(account) { return signToken({ kind: 'access', sub: account._id?.toString() || '', businessId: account.businessId, email: account.email || '', username: account.username || '', role: account.role || 'owner', permissions:parsePermissions(account.permissions), operationalAccess: Boolean(account.operationalAccess), exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8 }) }
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
function readRawBody(request, maxBytes = 65536) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, settled = false
    request.on('data', chunk => {
      if (settled) return
      size += chunk.length
      if (size > maxBytes) { settled = true; reject(Object.assign(new Error('Request too large.'), { statusCode: 413 })); return }
      chunks.push(chunk)
    })
    request.on('end', () => { if (!settled) { settled = true; resolve(Buffer.concat(chunks)) } })
    request.on('error', error => { if (!settled) { settled = true; reject(error) } })
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

async function notifyCustomerTeam(businessId,message,capability='customers'){
 const team=await accounts.find({businessId,removedAt:{$exists:false}}).toArray()
 await Promise.all(team.filter(account=>hasPermission(account,capability)).map(account=>notifications.notifyAccount(account._id.toString(),message)))
}
async function publishCustomerOrder(operations,head){
 await publishOrder(operations,head)
 if(head.payload.source==='customer-portal')await notifyCustomerTeam(head.businessId,{title:'New customer order',body:`${head.payload.customerName} placed an order. Accept it on a till before processing.`,type:'customer-order',url:'/?screen='+ (head.payload.retailOrder?'retail-orders':head.payload.restaurantOrder?'restaurant':'counter'),dedupeKey:'order:'+head.entityId},head.payload.retailOrder?(head.payload.pos?.workspace==='oil'?'oilSales':'productSales'):head.payload.restaurantOrder?'restaurant':'counter')
}
let birthdaysRunning=false
async function notifyBirthdays(){
 if(birthdaysRunning)return
 birthdaysRunning=true
 try{
 const businesses=await businessSettings.find({}).toArray()
 for(const business of businesses){
  const heads=await entityHeads.find({businessId:business.businessId,entityType:'customer','payload.birthdayReminders':{$in:[true,1]}}).toArray()
  const timeZone=normalizeShopProfile(business.settings?.shopProfile).reportingTimeZone||'UTC'
  for(const customer of birthdayCustomers(heads.map(head=>head.payload),new Date(),timeZone))await notifyCustomerTeam(business.businessId,{title:'Customer birthday',body:`${customer.name} has a birthday today. Open Customer accounts to review their contact details.`,type:'customer-birthday',url:'/?screen=customers',dedupeKey:'birthday:'+customer.id+':'+businessDate(new Date(),timeZone)})
 }
 }finally{birthdaysRunning=false}
}
const birthdayTimer=setInterval(()=>{void notifyBirthdays().catch(error=>console.error('Birthday reminders failed.',error.message))},60*60*1000);birthdayTimer.unref()
void notifyBirthdays().catch(error=>console.error('Birthday reminders failed.',error.message))

let hospitalityMailRunning=false
async function dispatchHospitalityEmails(){
 if(hospitalityMailRunning||!hospitalityMailConfigured())return
 hospitalityMailRunning=true
 try{
  const now=Date.now(),businesses=await businessSettings.find({}).toArray()
  for(const business of businesses){
   const businessId=business.businessId,heads=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':{$in:['hotel-stay','nightclub-entry','nightclub-event','restaurant-reservations']}}).toArray(),businessName=business.settings?.appName||'Stockroom business',currency=business.settings?.currency||'USD',emailSettings=await tenantIntegrations.emailSettings(businessId)
   const sendOnce=async(booking,messageType,email)=>{
    if(!email||!/^\S+@\S+\.\S+$/.test(email))return
    const filter={businessId,bookingId:booking.id,messageType},old=await hospitalityEmailLog.findOne(filter)
    if(['accepted','sent','delivered','uncertain'].includes(old?.status))return
    if(old?.status==='sending'){
     if(now-Date.parse(old.startedAt)<10*60_000)return
     await hospitalityEmailLog.updateOne({_id:old._id,status:'sending'},{$set:{status:'uncertain',lastError:'The sender stopped before recording a result. Check with Stockroom support before sending again.'}})
     return
    }
    if(old){const claimed=await hospitalityEmailLog.updateOne({_id:old._id,status:old.status},{$set:{status:'sending',startedAt:new Date(now),lastError:''}});if(!claimed.modifiedCount)return}
    else {try{await hospitalityEmailLog.insertOne({...filter,status:'sending',to:email,createdAt:new Date(now),provider:hospitalityMailProvider()})}catch(error){if(error?.code===11000)return;throw error}}
    try{const sent=await sendHospitalityBookingNotice({to:email,businessName,booking:{...booking,currency},noticeType:messageType,emailSettings});await hospitalityEmailLog.updateOne(filter,{$set:{status:'accepted',acceptedAt:new Date(),provider:sent.provider,providerMessageId:sent.messageId||'',to:email,subject:sent.subject||'',body:sent.text||'',replyTo:emailSettings.replyToEmail||'',lastError:''}})}
    catch(error){const uncertain=error?.mailUncertain===true;await hospitalityEmailLog.updateOne(filter,{$set:{status:uncertain?'uncertain':'failed',lastError:uncertain?'Gmail may have accepted this message, but Stockroom did not receive a confirmation. Check with Stockroom support before sending again.':String(error?.message||error).slice(0,240),to:email,provider:hospitalityMailProvider()}});console.error('Hospitality guest email failed.',businessId,booking.id,error?.message)}
   }
   for(const head of heads){
    if(head.payload.kind==='restaurant-reservations'){
     for(const entry of head.payload.entries||[]){if(!entry.nightlifeEventId)continue;const event=heads.find(row=>row.payload.kind==='nightclub-event'&&row.entityId===entry.nightlifeEventId);const booking={...entry,id:entry.id,kind:'nightlife-table',eventName:entry.nightlifeEventName||event?.payload.name||'Nightlife event',startsAt:event?.payload.startsAt||entry.startAt,tablePackageName:entry.tablePackageName,minimumSpend:entry.minimumSpend,cancellationPolicy:event?.payload.cancellationPolicy||'',noShowPolicy:event?.payload.noShowPolicy||''};const guestEmail=entry.guestEmail||'';if(entry.status==='cancelled'){await sendOnce(booking,'cancelled',guestEmail);continue}if(entry.status==='no-show'){await sendOnce(booking,'no-show',guestEmail);continue}if(!['confirmed','arrived','seated'].includes(entry.status))continue;await sendOnce(booking,'confirmation',guestEmail);const start=Date.parse(booking.startsAt);if(start>now&&start-now<=24*60*60_000)await sendOnce(booking,'reminder',guestEmail)}
     continue
    }
    const booking=head.payload;let guestEmail=booking.guestEmail||''
    if(!guestEmail&&booking.customerId){const customer=await entityHeads.findOne({businessId,entityType:'customer',entityId:booking.customerId});guestEmail=String(customer?.payload?.email||'').trim()}
    const event=booking.eventId?heads.find(row=>row.entityId===booking.eventId&&row.payload.kind==='nightclub-event')?.payload:null
    const startsAt=booking.kind==='hotel-stay'?`${booking.checkIn}T12:00:00.000Z`:booking.startsAt||event?.startsAt||''
    const notice={...booking,startsAt}
    if(booking.source==='channex')continue
    if(booking.status==='cancelled'){await sendOnce(notice,'cancelled',guestEmail);continue}
    if(booking.status==='no-show'){await sendOnce(notice,'no-show',guestEmail);continue}
    if(booking.kind==='nightclub-entry'&&booking.guestNotice==='waitlist-promoted'){await sendOnce(notice,'waitlist-offer',guestEmail);continue}
    if(!['booked','expected'].includes(booking.status))continue
    await sendOnce(notice,'confirmation',guestEmail)
    const start=Date.parse(startsAt);if(start>now&&start-now<=24*60*60_000)await sendOnce(notice,'reminder',guestEmail)
   }
  }
 }finally{hospitalityMailRunning=false}
}
const hospitalityMailTimer=setInterval(()=>{void dispatchHospitalityEmails().catch(error=>console.error('Hospitality guest communication dispatch failed.',error.message))},5*60_000);hospitalityMailTimer.unref()
void dispatchHospitalityEmails().catch(error=>console.error('Hospitality guest communication dispatch failed.',error.message))

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
const posPaystack = await createPosPaystack({ database, configFor: tenantIntegrations.paystackConfig })
// Keep dependent floor, payment-allocation and bill-close operations in order
// across simultaneous pushes to this existing sync server.
const businessSyncJobs=new Map()
async function serializeBusinessSync(businessId,job) {
  const previous=businessSyncJobs.get(businessId)||Promise.resolve()
  const next=previous.catch(()=>{}).then(job)
  businessSyncJobs.set(businessId,next)
  try{return await next}finally{if(businessSyncJobs.get(businessId)===next)businessSyncJobs.delete(businessId)}
}
const customerPaystackPayments=createCustomerPaystackPayments({database,entityHeads,operations,businessSettings,customerPortalAccounts,verifyToken,readJson,send,serialize:serializeBusinessSync,configFor:tenantIntegrations.paystackConfig,ObjectId})
await customerPaystackPayments.ensure()
const hospitalityPayments=createHospitalityPayments({database,entityHeads,operations,businessSettings,accounts,customerPortalAccounts,verifyToken,readJson,send,serialize:serializeBusinessSync,configFor:tenantIntegrations.paystackConfig,fallbackWebhook:customerPaystackPayments.handleWebhookPayload,ObjectId})
await hospitalityPayments.ensure()
const channexBookingSync=createChannexBookingSync({database,entityHeads,operations,tenantIntegrations,serialize:serializeBusinessSync,calendarBlocks:hotelCalendarBlocks})
const channexBookingSyncTimer=setInterval(()=>{void channexBookingSync.run().catch(error=>console.error('Hotel channel reservation sync failed.',String(error?.message||error).slice(0,240)))},30_000);channexBookingSyncTimer.unref()
void channexBookingSync.run().catch(error=>console.error('Hotel channel reservation sync failed.',String(error?.message||error).slice(0,240)))
async function queueProductCatalogueContribution(businessId, document) {
  if (document?.entityType !== 'product' || document.action !== 'upsert') return
  const preferences = await businessSettings.findOne({ businessId }, { projection: { catalogueContributionMode: 1, catalogueContributionOptIn: 1, 'settings.catalogueContributionMode': 1, 'settings.shopProfile': 1 } })
  const mode = catalogueContributionMode(preferences)
  if (mode !== 'auto' && !(mode === 'ask' && document.payload?.catalogueContributionDecision === true)) return
  let savedProfile = preferences?.settings?.shopProfile
  if (typeof savedProfile === 'string') { try { savedProfile = JSON.parse(savedProfile) } catch { savedProfile = null } }
  await queueSharedProductContribution(sharedProductCatalogueQueue, businessId, document.operationId, document.payload, normalizeShopProfile(savedProfile))
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
  if (request.url?.startsWith('/v1/visitors/') || request.url?.startsWith('/v1/public/hotel-calendar/') || request.method === 'GET' && request.url === '/v1/public/landing') {
    corsHeaders['Access-Control-Allow-Origin'] = '*'
    corsHeaders['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
  }
  for (const [name, value] of Object.entries(corsHeaders)) response.setHeader(name, value)
  if (request.method === 'OPTIONS') { response.writeHead(204, corsHeaders); return response.end() }
  if (request.method === 'GET' && request.url === '/health') return send(response, 200, { ok: true })
  const requestUrl = new URL(request.url || '/', 'http://localhost')
  if (request.method === 'POST' && requestUrl.pathname === '/v1/webhooks/channex') {
    const configuredSecret = String(process.env.CHANNEX_WEBHOOK_SECRET || '')
    if (configuredSecret.length < 32) return send(response, 503, { error: 'Channex webhook authentication is not configured.' })
    let raw
    try { raw = await readRawBody(request) } catch (error) { return send(response, error.statusCode || 400, { error: error.message || 'Invalid webhook body.' }) }
    const supplied = String(request.headers['x-stockroom-channex-secret'] || ''), expected = Buffer.from(configuredSecret), received = Buffer.from(supplied)
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return send(response, 401, { error: 'Invalid Channex webhook credential.' })
    let event
    try { event = JSON.parse(raw.toString('utf8')) } catch { return send(response, 400, { error: 'Invalid Channex webhook payload.' }) }
    if (event?.event !== 'booking') return send(response, 200, { ignored: true })
    const topLevelPropertyId = String(event.property_id || ''), payloadPropertyId = String(event.payload?.property_id || '')
    if (topLevelPropertyId && payloadPropertyId && topLevelPropertyId !== payloadPropertyId) return send(response, 400, { error: 'Channex booking notification contains conflicting property IDs.' })
    const propertyId = topLevelPropertyId || payloadPropertyId, revisionId = String(event.payload?.revision_id || event.payload?.booking_revision_id || '')
    if (!/^[0-9a-f-]{36}$/i.test(propertyId) || !/^[0-9a-f-]{36}$/i.test(revisionId)) return send(response, 400, { error: 'Channex booking notification is missing a valid property or revision ID.' })
    try { await channexBookingSync.receiveBookingWebhook(propertyId, revisionId); return send(response, 200, { received: true }) }
    catch (error) { return send(response, 503, { error: String(error?.message || 'Could not process the Channex booking revision.').slice(0, 300) }) }
  }
  const hotelCalendarMatch = requestUrl.pathname.match(/^\/v1\/public\/hotel-calendar\/([A-Za-z0-9_-]{40,80})\.ics$/)
  if (request.method === 'GET' && hotelCalendarMatch) {
    const roomHead = await entityHeads.findOne({ entityType: 'pos_record', 'payload.kind': 'hotel-room', 'payload.calendarFeedToken': hotelCalendarMatch[1] })
    const room = roomHead?.payload
    if (!room) { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); return response.end('Calendar feed not found.') }
    const settings = await businessSettings.findOne({ businessId: roomHead.businessId })
    const profile = normalizeShopProfile(settings?.settings?.shopProfile)
    if (!profile.features?.hotelOperations || await database.collection('account_deletion_requests').findOne({ type: 'business', businessId: roomHead.businessId, status: { $in: ['pending', 'processing'] } })) { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); return response.end('Calendar feed not found.') }
    const today = businessDate(new Date(), profile.reportingTimeZone || 'UTC')
    const stays = await entityHeads.find({ businessId: roomHead.businessId, entityType: 'pos_record', 'payload.kind': 'hotel-stay', 'payload.branchId': room.branchId, 'payload.status': { $in: ['booked', 'checked-in'] }, 'payload.checkOut': { $gte: today } }).toArray()
    const roomStays = stays.map(row => row.payload).filter(stay => stay.roomId === roomHead.entityId || !stay.roomId && stay.roomName === room.roomName)
    const importedStays = await hotelCalendarBlocks(roomHead.businessId, roomHead.entityId)
    response.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' })
    return response.end(hotelCalendarIcs(room, [...roomStays, ...importedStays]))
  }
  if (request.method === 'GET' && requestUrl.pathname === '/v1/public/product-lookup') {
    const query = String(requestUrl.searchParams.get('query') || '').trim()
    if (query) {
      const result = await searchProductNames(query, String(requestUrl.searchParams.get('industry') || 'general'))
      response.setHeader('Cache-Control', 'no-store')
      return send(response, result.status, result.body)
    }
    const barcode = String(requestUrl.searchParams.get('barcode') || '').trim()
    const source = String(requestUrl.searchParams.get('source') || '')
    const shared = source && source !== 'Stockroom Global Catalogue' ? null : await findSharedProduct(sharedProductCatalogue, barcode)
    if (requestUrl.searchParams.get('catalogueOnly') === 'true') {
      response.setHeader('Cache-Control', 'no-store')
      return send(response, shared?.status === 200 ? shared.status : 404, shared?.status === 200 ? shared.body : { status: 0, error: 'Barcode is not in the Stockroom Global Catalogue.' })
    }
    const result = shared || await lookupOpenFoodFacts(barcode, String(requestUrl.searchParams.get('industry') || 'general'), source, String(requestUrl.searchParams.get('context') || ''))
    response.setHeader('Cache-Control', 'no-store')
    return send(response, result.status, result.body)
  }
  try {
    if(await customerPaystackPayments.handle(request,response,requestUrl)||response.writableEnded)return
    if(await hospitalityPayments.handle(request,response,requestUrl)||response.writableEnded)return
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
      const hospitalityMode=query.get('mode')==='hotel'||query.get('mode')==='nightlife'?query.get('mode'):''
      if(hospitalityMode){
        const enabled=hospitalityMode==='hotel'?profile.features?.hotelOperations:profile.features?.nightlifeOperations
        if(!enabled)return send(response,403,{error:`${hospitalityMode==='hotel'?'Hotel':'Nightlife'} customer booking is not enabled for this business.`})
        let onlinePaymentEnabled=false;try{onlinePaymentEnabled=Boolean(await tenantIntegrations.paystackConfig(businessId))&&Object.hasOwn(PAYSTACK_MINIMUM_SUBUNITS,String(settings.currency||'USD').toUpperCase())}catch{}
        const heads=await entityHeads.find({businessId,entityType:'pos_record'}).toArray(),now=new Date().toISOString()
        if(hospitalityMode==='hotel'){
          const checkIn=String(query.get('checkIn')||''),checkOut=String(query.get('checkOut')||''),validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(`${value}T00:00:00.000Z`).toISOString().slice(0,10)===value
          const datesProvided=Boolean(checkIn||checkOut),datesValid=validDate(checkIn)&&validDate(checkOut)&&checkOut>checkIn
          const rooms=await hotelRoomTypeOffers(businessId,heads,checkIn,checkOut,datesProvided,datesValid,Math.max(1,Math.min(100,Number(query.get('guestCount')||1))))
          return send(response,200,{businessId,businessName:settings.appName||'Business',logoData:/^data:image\/(png|jpeg|webp);base64,/.test(settings.logoData||'')?settings.logoData:'',brandColor:profile.brandColor||'',currency:settings.currency||'USD',mode:'hotel',onlinePaymentEnabled,onlinePaymentMinimum:onlinePaymentEnabled?PAYSTACK_MINIMUM_SUBUNITS[String(settings.currency||'USD').toUpperCase()]/100:undefined,walletAllowed:settings.paymentPolicy?.allowWallet===true,guestMessagingEnabled:hospitalityMailConfigured(),menu:null,rooms})
        }
        const events=heads.filter(row=>row.payload.kind==='nightclub-event'&&row.payload.status==='scheduled'&&row.payload.startsAt>now).map(row=>{const entries=heads.filter(entry=>entry.payload.kind==='nightclub-entry'&&entry.payload.eventId===row.entityId&&['expected','checked-in'].includes(entry.payload.status)),reservedGuests=heads.filter(book=>book.payload.kind==='restaurant-reservations').flatMap(book=>book.payload.entries||[]).filter(entry=>entry.nightlifeEventId===row.entityId&&!['cancelled','no-show'].includes(entry.status)).reduce((sum,entry)=>sum+entry.guests,0),layout=heads.find(item=>item.payload.kind==='restaurant-layout'&&item.payload.branchId===row.payload.branchId),ticketTypes=row.payload.ticketTypes||[{id:'general',name:'General',price:Number(row.payload.admissionPrice||0),capacity:0}],reservations=heads.filter(book=>book.payload.kind==='restaurant-reservations').flatMap(book=>book.payload.entries||[]);return {id:row.entityId,branchId:row.payload.branchId,name:row.payload.name,description:row.payload.description||'',startsAt:row.payload.startsAt,endsAt:row.payload.endsAt||null,venueSpaceName:row.payload.venueSpaceName||'',capacity:row.payload.capacity,admissionPrice:row.payload.admissionPrice||0,spotsRemaining:row.payload.capacity?Math.max(0,row.payload.capacity-entries.length-reservedGuests):null,ticketTypes:ticketTypes.map(ticket=>({id:ticket.id,name:ticket.name,price:ticket.price,spotsRemaining:ticket.capacity?Math.max(0,ticket.capacity-entries.filter(entry=>entry.payload.ticketTypeId===ticket.id).length):null})),ticketPromotions:row.payload.ticketPromotions||[],attendeeFields:row.payload.attendeeFields||[],tablePackages:(row.payload.tablePackages||[]).map(item=>({...item,spotsRemaining:item.limit?Math.max(0,item.limit-reservations.filter(entry=>entry.nightlifeEventId===row.entityId&&entry.tablePackageId===item.id&&!['cancelled','no-show'].includes(entry.status)).length):null})),cancellationHours:Number(row.payload.cancellationHours||0),cancellationPolicy:row.payload.cancellationPolicy||'',noShowPolicy:row.payload.noShowPolicy||'',tables:profile.restaurant?(layout?.payload?.tables||[]).map(table=>({id:table.id,name:table.name,seats:table.seats})):[]}})
        const branchHeads=await entityHeads.find({businessId,entityType:'branch'}).toArray(),activeBranches=branchHeads.filter(row=>row.payload?.isActive!==false),branches=activeBranches.length?activeBranches.map(row=>({id:row.entityId,name:String(row.payload?.name||row.entityId)})):[{id:'main',name:'Main branch'}]
        return send(response,200,{businessId,businessName:settings.appName||'Business',logoData:/^data:image\/(png|jpeg|webp);base64,/.test(settings.logoData||'')?settings.logoData:'',brandColor:profile.brandColor||'',currency:settings.currency||'USD',mode:'nightlife',onlinePaymentEnabled,onlinePaymentMinimum:onlinePaymentEnabled?PAYSTACK_MINIMUM_SUBUNITS[String(settings.currency||'USD').toUpperCase()]/100:undefined,walletAllowed:settings.paymentPolicy?.allowWallet===true,guestMessagingEnabled:hospitalityMailConfigured(),tableReservationsEnabled:profile.restaurant===true,inquiriesEnabled:true,branches,menu:null,events})
      }
      const retail=customerOrderSettings(settings.paymentPolicy?.customerOrdering).retailEnabled && (query.get('mode')==='retail' || (!profile.fastFood&&!profile.restaurant))
      const menuId = retail ? 'retail-catalogue' : profile.restaurant ? 'restaurant-menu' : profile.fastFood ? 'counter-menu' : ''
      if (!menuId) return send(response, 200, { businessId, businessName: settings.appName || 'Business', logoData: /^data:image\/(png|jpeg|webp);base64,/.test(settings.logoData||'') ? settings.logoData : '', brandColor: profile.brandColor || '', currency: settings.currency || 'USD', mode: 'account', menu: null })
      const head = await entityHeads.findOne({ businessId, entityType: 'pos_record', entityId: menuId })
      const taxHead = await entityHeads.findOne({ businessId, entityType: 'pos_record', entityId: 'pos-settings' })
      const pricing = posSettings(taxHead?.payload?.value)
      const publicTax = { taxEnabled: pricing.taxEnabled, taxRate: pricing.taxRate, taxLabel: pricing.taxLabel, taxIncluded: pricing.taxIncluded, taxRates: {} }
      const menu = retail ? await publishedRetail(businessId,settings) : head?.payload?.kind === 'counter-menu' ? head.payload : null
      publicTax.taxRates = Object.fromEntries((menu?.items || []).filter(item => item.available && item.type === 'stock' && (retail || !profile.restaurant)).map(item => [item.id, pricing.taxRates[item.productId] ?? pricing.taxRate]))
      let onlinePaymentEnabled = false; try { onlinePaymentEnabled = Boolean(await tenantIntegrations.paystackConfig(businessId)) && Object.hasOwn(PAYSTACK_MINIMUM_SUBUNITS,String(settings.currency||'USD').toUpperCase()) } catch {}
      return send(response, 200, { businessId, businessName: settings.appName || 'Business', logoData: /^data:image\/(png|jpeg|webp);base64,/.test(settings.logoData||'') ? settings.logoData : '', brandColor: profile.brandColor || '', currency: settings.currency || 'USD', mode: retail ? 'retail' : profile.restaurant ? 'restaurant' : 'fast-food', tax: publicTax, walletAllowed: settings.paymentPolicy?.allowWallet === true, onlinePaymentEnabled, onlinePaymentMinimum: onlinePaymentEnabled ? PAYSTACK_MINIMUM_SUBUNITS[String(settings.currency||'USD').toUpperCase()]/100 : undefined, customerOrdering: customerOrderSettings(settings.paymentPolicy?.customerOrdering), menu: menu ? { id: menu.id, updatedAt: menu.updatedAt, items: menu.items.filter(item => item.available).map(item => ({ id: item.id, name: item.name, description: item.description || '', price: item.price, options: item.options.filter(option => option.available !== false).map(option => ({ id: option.id, name: option.name, price: option.price })) })) } : { id: menuId, updatedAt: '', items: [] } })
    }
    if (request.method === 'POST' && request.url === '/v1/customer-portal/guest') {
      const input = await readJson(request, 4096)
      const businessId = String(input.businessId || '').trim()
      const name = String(input.name || '').trim().slice(0, 100)
      if (!name) return send(response, 400, { error: 'Enter your name for pickup.' })
      const closing = await database.collection('account_deletion_requests').findOne({ type: 'business', businessId, status: { $in: ['pending', 'processing'] } })
      const saved = await businessSettings.findOne({ businessId })
      const profile = normalizeShopProfile(saved?.settings?.shopProfile)
      const hospitalityMode=input.mode==='hotel'||input.mode==='nightlife'?input.mode:''
      const hospitalityEnabled=hospitalityMode==='hotel'?profile.features?.hotelOperations:hospitalityMode==='nightlife'?profile.features?.nightlifeOperations:false
      if (closing || !saved || (!hospitalityEnabled&&!profile.fastFood&&!profile.restaurant&&!customerOrderSettings(saved?.settings?.paymentPolicy?.customerOrdering).retailEnabled)) return send(response, 403, { error: 'Customer booking is not available for this business.' })
      const rateKey = `guest-entry:${String(request.socket.remoteAddress || '')}:${businessId}`
      const rateNow = Date.now(), rate = customerPortalLoginLimits.get(rateKey)
      const window = rate?.until > rateNow ? rate : { count: 0, until: rateNow + 15 * 60 * 1000 }
      if (window.count >= 60) return send(response, 429, { error: 'Too many ordering requests. Wait fifteen minutes before trying again.' })
      customerPortalLoginLimits.set(rateKey, { ...window, count: window.count + 1 })
      const customerId = `guest-${randomBytes(24).toString('hex')}`
      return send(response, 201, { accessToken: signToken({ kind: 'customer', guest: true, customerId, name, businessId, ...(hospitalityMode?{hospitalityMode}:{}), exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 }) })
    }
    if(request.method==='GET'&&request.url==='/v1/customer-portal/hospitality/bookings'){
      const claims=verifyToken(request);if(claims?.kind!=='customer')return send(response,401,{error:'Customer sign-in required.'})
      if(!claims.guest){const account=ObjectId.isValid(claims.sub)&&await customerPortalAccounts.findOne({_id:new ObjectId(claims.sub),businessId:claims.businessId,customerId:claims.customerId,active:true});if(!account||claims.authVersion!==new Date(account.updatedAt||account.createdAt).getTime())return send(response,401,{error:'Customer account is no longer available. Sign in again.'})}
      const rows=await entityHeads.find({businessId:claims.businessId,entityType:'pos_record',$or:[{'payload.customerPortalId':claims.customerId},{'payload.customerId':claims.customerId},{'payload.entries.customerPortalId':claims.customerId}]}).toArray()
      const hospitality=await Promise.all(rows.filter(row=>['hotel-stay','nightclub-entry','nightclub-inquiry'].includes(row.payload.kind)).map(async row=>{const {staffNotes,...customerPayload}=row.payload,jobs=await entityHeads.find({businessId:claims.businessId,entityType:'pos_record','payload.kind':'service-job','payload.hospitality.recordId':row.entityId}).toArray(),saleIds=jobs.flatMap(job=>(job.payload.payments||[]).map(entry=>entry.sale.id)),refunds=saleIds.length?await entityHeads.find({businessId:claims.businessId,entityType:'pos_record','payload.kind':'return','payload.saleId':{$in:saleIds}}).toArray():[];return {...customerPayload,invoices:jobs.map(job=>({id:job.entityId,title:job.payload.title,status:job.payload.status,total:job.payload.pricing.total,onlinePayable:(job.payload.customerId===claims.customerId||job.payload.customerPortalId===claims.customerId)&&job.payload.status!=='estimate',...serviceJobBalance(job.payload,refunds.map(refund=>refund.payload))}))}}))
      const tableReservations=rows.filter(row=>row.payload.kind==='restaurant-reservations').flatMap(row=>(row.payload.entries||[]).filter(entry=>entry.customerPortalId===claims.customerId&&entry.nightlifeEventId).map(entry=>({...entry,id:entry.id,kind:'nightlife-table',recordId:row.entityId,eventName:entry.nightlifeEventName,tableName:entry.tableName,updatedAt:row.payload.updatedAt,invoices:[]})))
      const bookings=[...hospitality,...tableReservations]
      return send(response,200,{bookings:bookings.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))})
    }
    if(request.method==='POST'&&request.url==='/v1/customer-portal/hospitality/inquiries'){
      const claims=verifyToken(request);if(claims?.kind!=='customer')return send(response,401,{error:'Customer sign-in required.'})
      if(claims.guest&&claims.hospitalityMode!=='nightlife')return send(response,403,{error:'Open the nightlife customer portal to request a private event.'})
      if(!claims.guest){const account=ObjectId.isValid(claims.sub)&&await customerPortalAccounts.findOne({_id:new ObjectId(claims.sub),businessId:claims.businessId,customerId:claims.customerId,active:true});if(!account||claims.authVersion!==new Date(account.updatedAt||account.createdAt).getTime())return send(response,401,{error:'Customer account is no longer available. Sign in again.'})}
      const input=await readJson(request,8192),requestId=String(input.requestId||''),branchId=String(input.branchId||''),eventType=String(input.eventType||'').trim().slice(0,80),preferredDate=String(input.preferredDate||''),guestCount=Number(input.guestCount),guestEmail=String(input.email||'').trim().toLowerCase(),guestPhone=String(input.phone||'').trim().slice(0,80),notes=String(input.notes||'').trim().slice(0,2000)
      if(!/^[a-zA-Z0-9_-]{12,100}$/.test(requestId)||!branchId||!eventType||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)||guestEmail.length>254||guestPhone.length<6||!Number.isInteger(guestCount)||guestCount<1||guestCount>10000||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(preferredDate))return send(response,400,{error:'Enter a branch, event type, preferred date, guest count, email and reachable phone.'})
      if(await database.collection('account_deletion_requests').findOne({type:'business',businessId:claims.businessId,status:{$in:['pending','processing']}}))return send(response,403,{error:'This business is currently closed for customer bookings.'})
      const rateKey=`hospitality-inquiry:${String(request.socket.remoteAddress||'')}:${claims.businessId}:${claims.customerId}`,rateNow=Date.now(),priorRate=customerPortalLoginLimits.get(rateKey),rateWindow=priorRate?.until>rateNow?priorRate:{count:0,until:rateNow+15*60*1000};if(customerPortalLoginLimits.size>10000)for(const [key,value] of customerPortalLoginLimits)if(value.until<=rateNow)customerPortalLoginLimits.delete(key);if(rateWindow.count>=30)return send(response,429,{error:'Too many event requests. Wait fifteen minutes before trying again.'});customerPortalLoginLimits.set(rateKey,{...rateWindow,count:rateWindow.count+1})
      const recordId=`nightclub-inquiry:portal-${requestId}`
      try{const inquiry=await serializeBusinessSync(claims.businessId,async()=>{
        const prior=await entityHeads.findOne({businessId:claims.businessId,entityType:'pos_record',entityId:recordId});if(prior){if(prior.payload.customerPortalId!==claims.customerId)throw Object.assign(new Error('This request ID is already in use.'),{statusCode:409});return prior.payload}
        const saved=await businessSettings.findOne({businessId:claims.businessId}),profile=normalizeShopProfile(saved?.settings?.shopProfile);if(!saved||!profile.features?.nightlifeOperations)throw Object.assign(new Error('Private event requests are unavailable for this business.'),{statusCode:403})
        const today=new Intl.DateTimeFormat('en-CA',{timeZone:profile.reportingTimeZone||'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),dateCheck=new Date(`${preferredDate}T00:00:00.000Z`);if(!Number.isFinite(dateCheck.getTime())||dateCheck.toISOString().slice(0,10)!==preferredDate||preferredDate<today)throw new Error('Choose a valid date today or later.')
        const branchHeads=await entityHeads.find({businessId:claims.businessId,entityType:'branch'}).toArray(),activeBranches=branchHeads.filter(row=>row.payload?.isActive!==false),allowedBranches=new Set(activeBranches.length?activeBranches.map(row=>row.entityId):['main']);if(!allowedBranches.has(branchId))throw new Error('Choose an active venue branch.')
        const customer=claims.guest?null:await entityHeads.findOne({businessId:claims.businessId,entityType:'customer',entityId:claims.customerId}),guestName=claims.guest?String(claims.name||'').trim().slice(0,100):String(customer?.payload?.name||'').trim().slice(0,100);if(!guestName)throw new Error('Your customer profile needs a name before you can send an inquiry.')
        const now=new Date().toISOString(),record={id:recordId,kind:'nightclub-inquiry',branchId,guestName,guestEmail,guestPhone,eventType,preferredDate,guestCount,notes,status:'new',proposal:'',quotedTotal:0,staffNotes:'',createdAt:now,updatedAt:now,source:'customer-portal',customerPortalId:claims.customerId,...(!claims.guest?{customerId:claims.customerId}:{}),staffId:`customer:${claims.customerId}`}
        validateHospitalityRecord(record);const operationId=`customer-hospitality:${recordId}`,head={businessId:claims.businessId,entityType:'pos_record',entityId:recordId,operationId,deviceId:'customer-portal',payload:record,updatedAt:now},inserted=await entityHeads.updateOne({businessId:claims.businessId,entityType:'pos_record',entityId:recordId},{$setOnInsert:head},{upsert:true});if(!inserted.upsertedCount){const existing=await entityHeads.findOne({businessId:claims.businessId,entityType:'pos_record',entityId:recordId});if(existing?.payload.customerPortalId!==claims.customerId)throw Object.assign(new Error('This request ID is already in use.'),{statusCode:409});return existing.payload}await operations.updateOne({businessId:claims.businessId,operationId},{$setOnInsert:{...head,action:'upsert',createdAt:now,receivedAt:new Date()}},{upsert:true});return record
      });return send(response,201,{inquiry})}catch(error){return send(response,error.statusCode||400,{error:error.message||'Could not submit this event request.'})}
    }
    if(request.method==='POST'&&request.url==='/v1/customer-portal/hospitality/bookings'){
      const claims=verifyToken(request);if(claims?.kind!=='customer')return send(response,401,{error:'Customer sign-in required.'})
      if(!claims.guest){const account=ObjectId.isValid(claims.sub)&&await customerPortalAccounts.findOne({_id:new ObjectId(claims.sub),businessId:claims.businessId,customerId:claims.customerId,active:true});if(!account||claims.authVersion!==new Date(account.updatedAt||account.createdAt).getTime())return send(response,401,{error:'Customer account is no longer available. Sign in again.'})}
      if(await database.collection('account_deletion_requests').findOne({type:'business',businessId:claims.businessId,status:{$in:['pending','processing']}}))return send(response,403,{error:'This business is currently closed for customer bookings.'})
      const input=await readJson(request,8192),requestId=String(input.requestId||''),type=String(input.type||''),guestEmail=String(input.email||'').trim().slice(0,254)
      if(!/^[a-zA-Z0-9_-]{12,100}$/.test(requestId)||!['hotel','nightlife'].includes(type)||!/^\S+@\S+\.\S+$/.test(guestEmail))return send(response,400,{error:'Enter a valid email address for your confirmation and reminder.'})
      const rateKey=`hospitality-booking:${String(request.socket.remoteAddress||'')}:${claims.businessId}:${claims.customerId}`,rateNow=Date.now(),rate=customerPortalLoginLimits.get(rateKey),window=rate?.until>rateNow?rate:{count:0,until:rateNow+15*60*1000};if(window.count>=60)return send(response,429,{error:'Too many booking requests. Wait fifteen minutes before trying again.'});customerPortalLoginLimits.set(rateKey,{...window,count:window.count+1})
      const recordId=`${type==='hotel'?'hotel-stay':'nightclub-entry'}:portal-${requestId}`
      try{
        const payload=await serializeBusinessSync(claims.businessId,async()=>{
          const prior=await entityHeads.findOne({businessId:claims.businessId,entityType:'pos_record',entityId:recordId});if(prior){if(prior.payload.customerPortalId!==claims.customerId)return null;const invoice=prior.payload.kind==='nightclub-entry'?await entityHeads.findOne({businessId:claims.businessId,entityType:'pos_record','payload.kind':'service-job','payload.hospitality.recordId':recordId,'payload.status':{$ne:'cancelled'}}):null;return {...prior.payload,...(invoice?{ticketInvoiceId:invoice.entityId}:{})}}
          const saved=await businessSettings.findOne({businessId:claims.businessId}),profile=normalizeShopProfile(saved?.settings?.shopProfile),enabled=type==='hotel'?profile.features?.hotelOperations:profile.features?.nightlifeOperations
          if(!saved||!enabled)throw Object.assign(new Error('This booking type is no longer available.'),{statusCode:403})
          const now=new Date().toISOString(),all=await entityHeads.find({businessId:claims.businessId,entityType:'pos_record'}).toArray(),name=claims.guest?claims.name:String((await entityHeads.findOne({businessId:claims.businessId,entityType:'customer',entityId:claims.customerId}))?.payload?.name||'').trim(),phone=String(input.phone||'').trim().slice(0,80)
          if(!name||!phone)throw new Error('Enter the guest name and a reachable phone number.')
          let record
          if(type==='hotel'){
            const checkIn=String(input.checkIn||''),checkOut=String(input.checkOut||'')
            const validStayDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(`${value}T00:00:00.000Z`).toISOString().slice(0,10)===value
            const todayInBusinessTimeZone=new Intl.DateTimeFormat('en-CA',{timeZone:profile.reportingTimeZone||'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
            if(!validStayDate(checkIn)||!validStayDate(checkOut)||checkIn<todayInBusinessTimeZone)throw new Error('Choose valid future stay dates.')
            if(!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)||!/^\d{4}-\d{2}-\d{2}$/.test(checkOut)||checkOut<=checkIn||Date.parse(checkOut)-Date.parse(checkIn)>31*86400000)throw new Error('Choose valid dates within the next 31 nights.')
            const guestCount=Number(input.guestCount||1)
            if(!Number.isInteger(guestCount)||guestCount<1||guestCount>100)throw new Error('Enter a valid guest count.')
            const poolRequest=Boolean(input.inventoryPool),requestedBranch=String(input.branchId||''),requestedType=String(input.roomType||'').trim().toLocaleLowerCase()
            let candidates=all.filter(row=>row.payload.kind==='hotel-room'&&row.payload.status==='active'&&Number(row.payload.maxGuests||2)>=guestCount&&hotelRoomRestrictionsAllow(row.payload,checkIn,checkOut)&&!hotelRoomOutOfOrder(row.payload,checkIn,checkOut))
            if(poolRequest)candidates=candidates.filter(row=>row.payload.branchId===requestedBranch&&String(row.payload.roomType||'Standard').trim().toLocaleLowerCase()===requestedType)
            else candidates=candidates.filter(row=>row.entityId===String(input.roomId||''))
            const available=[]
            for(const candidate of candidates){const occupied=all.some(row=>row.payload.kind==='hotel-stay'&&row.payload.branchId===candidate.payload.branchId&&row.payload.roomId===candidate.entityId&&['booked','checked-in'].includes(row.payload.status)&&checkIn<row.payload.checkOut&&checkOut>row.payload.checkIn),blocked=(await hotelCalendarBlocks(claims.businessId,candidate.entityId,all)).some(block=>checkIn<block.checkOut&&checkOut>block.checkIn);if(!occupied&&!blocked){const rates=hotelNightlyRates(candidate.payload,checkIn,checkOut);available.push({row:candidate,total:rates.reduce((sum,night)=>sum+Number(night.nightlyRate||0),0)})}}
            available.sort((a,b)=>a.total-b.total||String(a.row.payload.roomName||'').localeCompare(String(b.row.payload.roomName||'')))
            const room=available[0]?.row
            if(!room)throw Object.assign(new Error(poolRequest?'No room of this type is available for those dates and guest count. Choose another type or dates.':'Those dates are no longer available for this room. Choose another room or dates.'),{statusCode:409})
            record={id:recordId,kind:'hotel-stay',branchId:room.payload.branchId,roomId:room.entityId,roomName:room.payload.roomName,guestName:name,guestPhone:phone,guestEmail,guestCount,checkIn,checkOut,nightlyRate:Number(room.payload.nightlyRate),rateBreakdown:hotelRateBreakdown(room.payload,checkIn,checkOut),nightlyRates:hotelNightlyRates(room.payload,checkIn,checkOut),depositRequired:hotelDepositRequirement(room.payload,checkIn,checkOut),cancellationHours:Number(room.payload.cancellationHours||0),cancellationPolicy:room.payload.cancellationPolicy||'',noShowPolicy:room.payload.noShowPolicy||'',status:'booked',checkInToken:randomBytes(24).toString('base64url'),createdAt:now,updatedAt:now,source:'customer-portal',customerPortalId:claims.customerId,...(!claims.guest?{customerId:claims.customerId}:{}),staffId:`customer:${claims.customerId}`}
          }else{
            const event=all.find(row=>row.entityId===String(input.eventId||'')&&row.payload.kind==='nightclub-event'&&row.payload.status==='scheduled'&&row.payload.startsAt>now)
            if(!event)throw new Error('Choose an upcoming event that is still open for bookings.')
            const entries=all.filter(row=>row.payload.kind==='nightclub-entry'&&row.payload.eventId===event.entityId&&['expected','checked-in'].includes(row.payload.status)),reservedGuests=all.filter(row=>row.payload.kind==='restaurant-reservations').flatMap(row=>row.payload.entries||[]).filter(entry=>entry.nightlifeEventId===event.entityId&&!['cancelled','no-show'].includes(entry.status)).reduce((sum,entry)=>sum+entry.guests,0),waitlisted=Boolean(event.payload.capacity&&entries.length+reservedGuests>=event.payload.capacity)
            const ticket=(event.payload.ticketTypes||[{id:'general',name:'General',price:Number(event.payload.admissionPrice||0),capacity:0}]).find(row=>row.id===String(input.ticketTypeId||'general'));if(!ticket)throw new Error('Choose a ticket type offered for this event.');const promoCode=String(input.promoCode||'').trim().toUpperCase(),promo=promoCode?(event.payload.ticketPromotions||[]).find(item=>item.code===promoCode&&(!item.ticketTypeId||item.ticketTypeId===ticket.id)):null;if(promoCode&&!promo)throw new Error('That promotion code is not valid for this ticket.');const promoUses=promo?all.filter(row=>row.payload.kind==='nightclub-entry'&&row.payload.eventId===event.entityId&&row.payload.promoCode===promo.code&&['expected','checked-in','waitlisted'].includes(row.payload.status)).length:0;if(promo?.limit&&promoUses>=promo.limit)throw new Error('That promotion has reached its use limit.');const attendeeAnswers=input.attendeeAnswers&&typeof input.attendeeAnswers==='object'&&!Array.isArray(input.attendeeAnswers)?input.attendeeAnswers:{},fields=event.payload.attendeeFields||[],answers={};for(const field of fields){const value=String(attendeeAnswers[field.id]||'').trim().slice(0,500);if(field.required&&!value)throw new Error(`Complete ${field.label}.`);if(value&&field.type==='email'&&!/^\S+@\S+\.\S+$/.test(value))throw new Error(`Enter a valid ${field.label}.`);if(value&&field.type==='number'&&!Number.isFinite(Number(value)))throw new Error(`Enter a number for ${field.label}.`);if(value)answers[field.id]=value}const extra=Object.keys(attendeeAnswers).some(key=>!fields.some(field=>field.id===key));if(extra)throw new Error('Refresh the event form and re-enter the attendee details.');const listPrice=Math.round(Number(ticket.price)*100)/100,admissionPrice=promo?Math.round(listPrice*(100-promo.percentOff))/100:listPrice,tierSales=all.filter(row=>row.payload.kind==='nightclub-entry'&&row.payload.eventId===event.entityId&&row.payload.ticketTypeId===ticket.id&&['expected','checked-in'].includes(row.payload.status)).length,tierFull=Boolean(ticket.capacity&&tierSales>=ticket.capacity);record={id:recordId,kind:'nightclub-entry',branchId:event.payload.branchId,eventId:event.entityId,eventName:event.payload.name,ticketTypeId:ticket.id,ticketTypeName:ticket.name,guestName:name,guestPhone:phone,guestEmail,listPrice,admissionPrice,...(promo?{promoCode:promo.code}:{}),...(Object.keys(answers).length?{attendeeAnswers:answers}:{}),cancellationHours:Number(event.payload.cancellationHours||0),cancellationPolicy:event.payload.cancellationPolicy||'',noShowPolicy:event.payload.noShowPolicy||'',status:waitlisted||tierFull?'waitlisted':'expected',...(waitlisted||tierFull?{}:{checkInToken:randomBytes(24).toString('base64url')}),createdAt:now,updatedAt:now,source:'customer-portal',customerPortalId:claims.customerId,...(!claims.guest?{customerId:claims.customerId}:{}),staffId:`customer:${claims.customerId}`}
          }
          validateHospitalityRecord(record)
          const operationId=`customer-hospitality:${recordId}`,head={businessId:claims.businessId,entityType:'pos_record',entityId:recordId,operationId,deviceId:'customer-portal',payload:record,updatedAt:now}
          const inserted=await entityHeads.updateOne({businessId:claims.businessId,entityType:'pos_record',entityId:recordId},{$setOnInsert:head},{upsert:true});if(!inserted.upsertedCount){const existing=await entityHeads.findOne({businessId:claims.businessId,entityType:'pos_record',entityId:recordId});if(existing?.payload.customerPortalId!==claims.customerId)throw Object.assign(new Error('This booking request ID is already used.'),{statusCode:409});if(existing.payload.kind==='hotel-stay')await channexBookingSync.enqueueAriChange(claims.businessId,existing.payload.branchId,null,existing.payload);return existing.payload}
          await operations.updateOne({businessId:claims.businessId,operationId},{$setOnInsert:{...head,action:'upsert',createdAt:now,receivedAt:new Date()}},{upsert:true})
          if(record.kind==='hotel-stay')await channexBookingSync.enqueueAriChange(claims.businessId,record.branchId,null,record)
          let ticketInvoiceId=''
          if(record.kind==='nightclub-entry'&&record.status==='expected'&&record.admissionPrice>0){
            const receiptHead=all.find(row=>row.entityId==='receipt-settings'&&row.payload.kind==='receipt-settings'),profileSettings=receiptSettings(receiptHead?.payload?.value||{}),invoiceId=`service-job:ticket-${recordId.slice('nightclub-entry:'.length)}`,lines=[{id:record.id,description:`Admission: ${record.eventName}`.slice(0,150),quantity:1,price:record.admissionPrice}],pricing=priceOrder(lines.map(line=>({productId:`service:${line.id}`,quantity:line.quantity,price:line.price})),{tax:profileSettings}),invoiceNow=new Date().toISOString(),job={id:invoiceId,kind:'service-job',branchId:record.branchId,tillId:'customer-portal',status:'new',createdAt:invoiceNow,updatedAt:invoiceNow,expectedUpdatedAt:'',lastCommandId:`ticket-invoice:${record.id}`,lastRequest:JSON.stringify({recordId:record.id}),staffId:`customer:${claims.customerId}`,staffName:'Customer portal',businessName:profileSettings.businessName||saved.settings.appName||'Business',currency:saved.settings.currency||'USD',customerName:name,customerPhone:phone,title:`Nightclub admission - ${record.eventName}`.slice(0,200),note:`Admission ticket for ${record.eventName}.`,dueDate:'',lines,profile:profileSettings,pricing,payments:[],hospitality:{recordId:record.id,recordKind:'nightclub-entry'},customerPortalId:claims.customerId,...(!claims.guest?{customerId:claims.customerId}:{})}
            validateServiceJob(job,undefined,false);validateHospitalityInvoice(job,record)
            const invoiceOperationId=`customer-hospitality-ticket-invoice:${record.id}`,invoiceHead={businessId:claims.businessId,entityType:'pos_record',entityId:invoiceId,operationId:invoiceOperationId,deviceId:'customer-portal',payload:job,updatedAt:invoiceNow},invoiceInsert=await entityHeads.updateOne({businessId:claims.businessId,entityType:'pos_record',entityId:invoiceId},{$setOnInsert:invoiceHead},{upsert:true});if(invoiceInsert.upsertedCount){await operations.updateOne({businessId:claims.businessId,operationId:invoiceOperationId},{$setOnInsert:{...invoiceHead,action:'upsert',createdAt:invoiceNow,receivedAt:new Date()}},{upsert:true})}ticketInvoiceId=invoiceId
          }
          return {...record,...(ticketInvoiceId?{ticketInvoiceId}:{})}
        })
        if(!payload)return send(response,403,{error:'This booking belongs to another customer.'})
        return send(response,201,{booking:payload})
      }catch(error){return send(response,error.statusCode||400,{error:error.message||'Could not save this booking.'})}
    }
    if(request.method==='POST'&&request.url==='/v1/customer-portal/hospitality/table-reservations'){
      const claims=verifyToken(request);if(claims?.kind!=='customer')return send(response,401,{error:'Customer sign-in required.'})
      if(!claims.guest){const account=ObjectId.isValid(claims.sub)&&await customerPortalAccounts.findOne({_id:new ObjectId(claims.sub),businessId:claims.businessId,customerId:claims.customerId,active:true});if(!account||claims.authVersion!==new Date(account.updatedAt||account.createdAt).getTime())return send(response,401,{error:'Customer account is no longer available. Sign in again.'})}
      if(await database.collection('account_deletion_requests').findOne({type:'business',businessId:claims.businessId,status:{$in:['pending','processing']}}))return send(response,403,{error:'This business is currently closed for customer bookings.'})
      const input=await readJson(request,8192),requestId=String(input.requestId||''),eventId=String(input.eventId||''),tableId=String(input.tableId||''),tablePackageId=String(input.tablePackageId||''),guests=Number(input.guests),phone=String(input.phone||'').trim().slice(0,80),guestEmail=String(input.email||'').trim().slice(0,254)
      if(!/^[a-zA-Z0-9_-]{12,100}$/.test(requestId)||!eventId||!tableId||!Number.isInteger(guests)||guests<1||guests>100||!phone||!/^\S+@\S+\.\S+$/.test(guestEmail))return send(response,400,{error:'Enter valid table, guest and email details.'})
      const tableRateKey=`hospitality-table:${String(request.socket.remoteAddress||'')}:${claims.businessId}:${claims.customerId}`,tableRateNow=Date.now(),tableRate=customerPortalLoginLimits.get(tableRateKey),tableWindow=tableRate?.until>tableRateNow?tableRate:{count:0,until:tableRateNow+15*60*1000};if(tableWindow.count>=30)return send(response,429,{error:'Too many table reservation requests. Wait fifteen minutes before trying again.'});customerPortalLoginLimits.set(tableRateKey,{...tableWindow,count:tableWindow.count+1})
      try{const result=await serializeBusinessSync(claims.businessId,async()=>{
        const saved=await businessSettings.findOne({businessId:claims.businessId}),profile=normalizeShopProfile(saved?.settings?.shopProfile);if(!profile.restaurant)return {error:'Enable Tables & tabs to offer event table reservations.',statusCode:403}
        const all=await entityHeads.find({businessId:claims.businessId,entityType:'pos_record'}).toArray(),eventHead=all.find(row=>row.entityId===eventId&&row.payload.kind==='nightclub-event'&&row.payload.status==='scheduled'),layoutHead=all.find(row=>row.payload.kind==='restaurant-layout'&&row.payload.branchId===eventHead?.payload.branchId)
        if(!eventHead||eventHead.payload.startsAt<=new Date().toISOString())throw new Error('Choose an upcoming nightlife event.')
        const bookId=reservationBookId(eventHead.payload.branchId),previous=all.find(row=>row.entityId===bookId&&row.payload.kind==='restaurant-reservations'),reservationId=`reservation:portal-${requestId}`
        if(previous?.payload.entries?.some(row=>row.id===reservationId)){const existing=previous.payload.entries.find(row=>row.id===reservationId);if(existing.customerPortalId!==claims.customerId)return {error:'This request ID is already used.',statusCode:409};return {booking:existing}}
        const table=(layoutHead?.payload?.tables||[]).find(row=>row.id===tableId);if(!table)throw new Error('Choose a table that is still available for this venue.')
        const sold=all.filter(row=>row.payload.kind==='nightclub-entry'&&row.payload.eventId===eventId&&['expected','checked-in'].includes(row.payload.status)).length,reserved=all.filter(row=>row.payload.kind==='restaurant-reservations').flatMap(row=>row.payload.entries||[]).filter(row=>row.nightlifeEventId===eventId&&!['cancelled','no-show'].includes(row.status)).reduce((sum,row)=>sum+row.guests,0);if(eventHead.payload.capacity&&sold+reserved+guests>eventHead.payload.capacity)throw Object.assign(new Error('This event does not have enough capacity for that table booking.'),{statusCode:409})
        const guestName=claims.guest?claims.name:String((await entityHeads.findOne({businessId:claims.businessId,entityType:'customer',entityId:claims.customerId}))?.payload?.name||'').trim()
        if(!guestName)throw new Error('Customer profile is unavailable.')
        const timeZone=profile.reportingTimeZone||'UTC',local=(instant)=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant)).map(part=>[part.type,part.value]));return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`},startAt=eventHead.payload.startsAt,endAt=new Date(Date.parse(startAt)+2*60*60*1000).toISOString(),now=new Date().toISOString(),user={id:`customer:${claims.customerId}`,name:guestName}
        const reservationInput={action:'create',id:reservationId,commandId:`portal-${requestId}`,expectedUpdatedAt:previous?.payload.updatedAt||'',name:guestName,phone,guestEmail,guests,tableId,startLocal:local(startAt),endLocal:local(endAt),timeZone,occurrence:'earlier',endOccurrence:'earlier',note:'',nightlifeEventId:eventId,...(tablePackageId?{tablePackageId}:{}),customerPortalId:claims.customerId}
        const tabs=all.filter(row=>row.payload.kind==='restaurant-tab'&&row.payload.branchId===eventHead.payload.branchId).map(row=>row.payload),nightlifeEvents=all.filter(row=>row.payload.kind==='nightclub-event'&&row.payload.branchId===eventHead.payload.branchId).map(row=>row.payload)
        const record=reservationChange(previous?.payload,reservationInput,{branchId:eventHead.payload.branchId,user,updatedAt:now,timeZone,layout:layoutHead?.payload||{tables:[]},tabs,nightlifeEvents}),operationId=`customer-hospitality-table:${requestId}`,filter={businessId:claims.businessId,entityType:'pos_record',entityId:bookId}
        const update=await entityHeads.updateOne(previous?{...filter,operationId:previous.operationId}:filter,previous?{$set:{payload:record,updatedAt:now,operationId,deviceId:'customer-portal'}}:{$setOnInsert:{businessId:claims.businessId,entityType:'pos_record',entityId:bookId,operationId,deviceId:'customer-portal',payload:record,updatedAt:now}},{upsert:!previous})
        if(previous?!update.modifiedCount:!update.upsertedCount)throw Object.assign(new Error('Venue reservations changed. Refresh and try again.'),{statusCode:409})
        const operation={businessId:claims.businessId,operationId,deviceId:'customer-portal',entityType:'pos_record',entityId:bookId,action:'upsert',payload:record,createdAt:now,receivedAt:new Date()};await operations.updateOne({businessId:claims.businessId,operationId},{$setOnInsert:operation},{upsert:true})
        return {booking:record.entries.find(row=>row.id===reservationId)}
      })
      if(result.error)return send(response,result.statusCode||400,{error:result.error})
      return send(response,201,result)
      }catch(error){return send(response,error.statusCode||400,{error:error.message||'Could not save this table booking.'})}
    }
    if(request.method==='POST'&&request.url==='/v1/customer-portal/hospitality/cancel'){
      const claims=verifyToken(request);if(claims?.kind!=='customer')return send(response,401,{error:'Customer sign-in required.'})
      if(!claims.guest){const account=ObjectId.isValid(claims.sub)&&await customerPortalAccounts.findOne({_id:new ObjectId(claims.sub),businessId:claims.businessId,customerId:claims.customerId,active:true});if(!account||claims.authVersion!==new Date(account.updatedAt||account.createdAt).getTime())return send(response,401,{error:'Customer account is no longer available. Sign in again.'})}
      const input=await readJson(request,4096),bookingId=String(input.bookingId||'')
      try{const booking=await serializeBusinessSync(claims.businessId,async()=>{
        const now=new Date().toISOString()
        if(bookingId.startsWith('reservation:')){
          const filter={businessId:claims.businessId,entityType:'pos_record','payload.kind':'restaurant-reservations','payload.entries.id':bookingId},head=await entityHeads.findOne(filter),saved=head?.payload.entries?.find(row=>row.id===bookingId)
          if(!head||saved?.customerPortalId!==claims.customerId)throw new Error('This booking cannot be cancelled from this account.')
          if(saved.status==='cancelled')return saved
          if(!['confirmed','arrived'].includes(saved.status))throw new Error('This table booking can no longer be cancelled from the customer app.')
          const all=await entityHeads.find({businessId:claims.businessId,entityType:'pos_record','payload.branchId':head.payload.branchId}).toArray(),settings=await businessSettings.findOne({businessId:claims.businessId}),profile=normalizeShopProfile(settings?.settings?.shopProfile),layout=all.find(row=>row.payload.kind==='restaurant-layout')?.payload||{tables:[]},tabs=all.filter(row=>row.payload.kind==='restaurant-tab').map(row=>row.payload),hotelStays=all.filter(row=>row.payload.kind==='hotel-stay').map(row=>row.payload),nightlifeEvents=all.filter(row=>row.payload.kind==='nightclub-event').map(row=>row.payload),user={id:`customer:${claims.customerId}`,name:saved.name}
          const linkedEvent=nightlifeEvents.find(event=>event.id===saved.nightlifeEventId),eventStart=linkedEvent?.startsAt,cutoffHours=Number(linkedEvent?.cancellationHours||0);if(eventStart&&Date.now()>=Date.parse(eventStart)-cutoffHours*3600000)throw new Error(`The venue cancellation cutoff is ${cutoffHours} hours before the event. Contact the venue to change this reservation.`)
          const record=reservationChange(head.payload,{action:'cancel',id:bookingId,commandId:`portal-cancel-${randomBytes(12).toString('hex')}`,expectedUpdatedAt:head.payload.updatedAt,reason:'Cancelled by customer'}, {branchId:head.payload.branchId,user,updatedAt:now,timeZone:profile.reportingTimeZone||saved.timeZone||'UTC',layout,tabs,hotelStays,nightlifeEvents})
          const operationId=`customer-hospitality-table-cancel:${bookingId}:${now}`,changed=await entityHeads.updateOne({...filter,operationId:head.operationId},{$set:{payload:record,updatedAt:now,operationId,deviceId:'customer-portal'}});if(!changed.modifiedCount)throw new Error('Venue reservations changed. Refresh and retry.')
          await operations.updateOne({businessId:claims.businessId,operationId},{$setOnInsert:{businessId:claims.businessId,operationId,deviceId:'customer-portal',entityType:'pos_record',entityId:head.entityId,action:'upsert',payload:record,createdAt:now,receivedAt:new Date()}},{upsert:true});return record.entries.find(row=>row.id===bookingId)
        }
        const filter={businessId:claims.businessId,entityType:'pos_record',entityId:bookingId},head=await entityHeads.findOne(filter);if(!head||!['hotel-stay','nightclub-entry','nightclub-inquiry'].includes(head.payload.kind)||head.payload.customerPortalId!==claims.customerId&&head.payload.customerId!==claims.customerId)throw new Error('This booking cannot be cancelled from this account.');if(head.payload.status==='cancelled')return head.payload;if(!['booked','expected','waitlisted','new','contacted','quoted'].includes(head.payload.status))throw new Error('This booking cannot be cancelled from this account.');if(['hotel-stay','nightclub-entry'].includes(head.payload.kind)){const startsAt=head.payload.kind==='hotel-stay'?`${head.payload.checkIn}T12:00:00.000Z`:head.payload.startsAt||String(head.payload.eventId?((await entityHeads.findOne({businessId:claims.businessId,entityType:'pos_record',entityId:head.payload.eventId}))?.payload?.startsAt||''):'');const cutoffHours=Number(head.payload.cancellationHours||0);if(startsAt&&Date.now()>=Date.parse(startsAt)-cutoffHours*3600000)throw new Error(`The cancellation cutoff is ${cutoffHours} hours before arrival. Contact the business to change this booking.`)}
        const jobs=await entityHeads.find({businessId:claims.businessId,entityType:'pos_record','payload.kind':'service-job','payload.hospitality.recordId':bookingId,'payload.status':{$ne:'cancelled'}}).toArray();if(jobs.length)throw new Error('Contact the business to cancel this booking because an invoice has already been issued. Any payment must be reviewed before cancellation.')
        const payload={...head.payload,status:'cancelled',updatedAt:now,expectedUpdatedAt:head.updatedAt,staffId:`customer:${claims.customerId}`};validateHospitalityRecord(payload,head.payload)
        const operationId=`customer-hospitality-cancel:${bookingId}:${now}`,changed=await entityHeads.updateOne({...filter,operationId:head.operationId},{$set:{payload,updatedAt:now,operationId,deviceId:'customer-portal'}});if(!changed.modifiedCount)throw new Error('This booking changed. Refresh and retry.')
        await channexBookingSync.enqueueAriChange(claims.businessId,payload.branchId,head.payload,payload)
        const operation={businessId:claims.businessId,operationId,deviceId:'customer-portal',entityType:'pos_record',entityId:bookingId,action:'upsert',payload,createdAt:now,receivedAt:new Date()};await operations.updateOne({businessId:claims.businessId,operationId},{$setOnInsert:operation},{upsert:true});return payload})
        return send(response,200,{booking})
      }catch(error){return send(response,error.statusCode||400,{error:error.message||'Could not cancel this booking.'})}
    }
    if (request.method === 'POST' && request.url === '/v1/customer-portal/accept') {
      const claims = verifyToken(request)
      if (!isAccess(claims) || !['owner', 'admin', 'cashier'].includes(claims.role) || !ObjectId.isValid(claims.sub)) return send(response, 403, { error: 'Staff sign-in required.' })
      const staff = await accounts.findOne({ _id: new ObjectId(claims.sub), businessId: claims.businessId, removedAt: { $exists: false } })
      if (!staff) return send(response, 403, { error: 'Staff access is no longer available.' })
      const input = await readJson(request, 4096)
      const pendingOrder=await entityHeads.findOne({businessId:claims.businessId,entityType:'pos_record',entityId:String(input.orderId||'')})
      if(staff.permissions&&!hasPermission(staff,pendingOrder?.payload.retailOrder?(pendingOrder.payload.pos?.workspace==='oil'?'oilSales':'productSales'):pendingOrder?.payload.restaurantOrder?'restaurant':'counter'))return send(response,403,{error:'The owner has not granted access to accept this order.'})
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
      const retail=input.catalogMode==='retail' || (!profile.fastFood&&!profile.restaurant)
      if (retail && !customerOrderSettings(saved?.settings?.paymentPolicy?.customerOrdering).retailEnabled || !retail && !profile.fastFood && !profile.restaurant) return send(response,403,{error:'This online catalogue is not enabled.'})
      const menuId = retail ? 'retail-catalogue' : profile.restaurant ? 'restaurant-menu' : 'counter-menu'
      const menu = retail ? {payload:await publishedRetail(claims.businessId,saved.settings)} : await entityHeads.findOne({ businessId: claims.businessId, entityType: 'pos_record', entityId: menuId })
      if (!menu?.payload || input.menuUpdatedAt !== menu.payload.updatedAt) return send(response, 409, { error: 'The menu changed. Refresh it and review your basket.' })
      const customerHead = claims.guest ? { payload: { name: claims.name } } : await entityHeads.findOne({ businessId: claims.businessId, entityType: 'customer', entityId: claims.customerId })
      if (!customerHead) return send(response, 403, { error: 'Customer account is no longer available.' })
      let lines
      try { lines = await customerOrderLines(menu.payload, input.lines, !retail && Boolean(profile.restaurant), async id => (await entityHeads.findOne({ businessId: claims.businessId, entityType: 'product', entityId: id }))?.payload, retail) } catch (error) { return send(response, 400, { error: error.message }) }
      const requestedPayment = ['wallet', 'bank-transfer', 'cash', 'paystack'].includes(input.paymentMethod) ? input.paymentMethod : 'cash'
      if (requestedPayment === 'paystack' && !await tenantIntegrations.paystackConfig(claims.businessId)) return send(response, 400, { error: 'Online Paystack checkout is not connected for this business.' })
      if (requestedPayment === 'wallet' && (claims.guest || saved?.settings?.paymentPolicy?.allowWallet !== true)) return send(response, 400, { error: 'Wallet payment requires an enabled customer wallet account.' })
      const bankReference = String(input.paymentReference || '').trim().slice(0, 120)
      const bankProvider = String(input.paymentProvider || '').trim().slice(0, 100)
      if (requestedPayment === 'bank-transfer' && (!bankProvider || !bankReference)) return send(response, 400, { error: 'Enter the bank and transfer reference after making the transfer.' })
      let handoff
      try { handoff = customerHandoff(saved.settings?.paymentPolicy?.customerOrdering, input, !retail && Boolean(profile.restaurant)) } catch (error) { return send(response, 400, { error: error.message }) }
      if (handoff.delivery?.fee > 0) lines.push({ id: 'delivery-fee', menuItemId: 'delivery-fee', name: 'Delivery charge', type: 'prepared', station: 'kitchen', productId: '', quantity: 1, price: handoff.delivery.fee, options: [], recipe: [] })
      const id = orderId, now = new Date().toISOString(), tillId = 'customer-portal'
      const settingsRecord = await entityHeads.findOne({ businessId: claims.businessId, entityType: 'pos_record', entityId: 'pos-settings' })
      const tax = posSettings(settingsRecord?.payload?.value)
      const customer = customerHead.payload
      const pos = { ...(retail&&profile.industry==='liquids'?{workspace:'oil'}:{}), tillId, customerId: claims.guest ? '' : claims.customerId, customerName: customer.name, discountType: 'amount', discountValue: 0, loyaltyRedeemed: 0, tax, note: String(input.note || '').trim().slice(0, 300) }
      pos.pricing = priceOrder(counterItems({ lines }), pos)
      if (input.expectedTotal !== undefined && Math.round(Number(input.expectedTotal) * 100) !== Math.round(pos.pricing.total * 100)) return send(response, 409, { error: 'The total changed. Refresh the menu and review tax and prices before submitting.' })
      if (requestedPayment === 'paystack') {
        const currency=String(saved.settings.currency||'USD').toUpperCase(),amount=Math.round(pos.pricing.total*100),minimum=PAYSTACK_MINIMUM_SUBUNITS[currency]
        if (!minimum) return send(response,400,{error:`Paystack checkout is not available for ${currency} business currency.`})
        if (currency==='XOF'&&!Number.isInteger(pos.pricing.total)) return send(response,400,{error:'Paystack requires XOF order totals to be whole francs.'})
        if (!Number.isSafeInteger(amount)||amount<minimum) return send(response,400,{error:`Paystack requires a minimum order payment of ${minimum/100} ${currency}.`})
      }
      const paymentNote = requestedPayment === 'bank-transfer' ? `Bank transfer claimed: ${bankProvider} / ${bankReference}. Verify before handing over.` : ''
      const customerNote = String(input.note || '').trim().slice(0, 200)
      const record = { id, kind: 'counter-order', source: 'customer-portal', customerPortalId: claims.customerId, acceptedTillId: '', ...(retail?{retailOrder:true}:{}), restaurantOrder: !retail && Boolean(profile.restaurant), customerPaymentMethod: requestedPayment, ...(requestedPayment === 'bank-transfer' ? { customerPaymentProvider: bankProvider, customerPaymentReference: bankReference } : {}), branchId: 'main', status: 'queued', tillId, currency: saved.settings.currency || 'USD', businessName: saved.settings.appName || 'Business', createdAt: now, updatedAt: now, expectedUpdatedAt: '', customerName: customer.name, note: [handoff.delivery ? `Deliver to ${handoff.delivery.address} / ${handoff.delivery.phone}` : '', customerNote, paymentNote].filter(Boolean).join(' · ').slice(0, 300), ...handoff, lines, pos, total: pos.pricing.total, events: [{ status: 'queued', action: 'create', reason: '', staffId: `customer:${claims.customerId}`, at: now }] }
      validateCounterRecord(record)
      let result, conflict = ''
      await serializeBusinessSync(claims.businessId, async () => {
        const filter = { businessId: claims.businessId, entityType: 'pos_record', entityId: id }
        let head = await entityHeads.findOne(filter)
        if (head) authorizeCustomerOrder(head.payload, claims.customerId)
        else {
          const currentMenu = retail ? {payload:await publishedRetail(claims.businessId,(await businessSettings.findOne({businessId:claims.businessId}))?.settings)} : await entityHeads.findOne({ businessId: claims.businessId, entityType: 'pos_record', entityId: menuId })
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
        const orders = await Promise.all(heads.map(async head => { const payment = await operations.findOne({ businessId: claims.businessId, entityType: 'sale', entityId: counterSaleId(head.entityId) }); return { id: head.entityId, total: head.payload.total, currency: head.payload.currency, createdAt: head.payload.createdAt, updatedAt: head.payload.updatedAt, paymentReference: payment?.payload?.paymentReference || head.payload.customerPaymentReference || '', status: !head.payload.acceptedTillId && head.payload.status === 'queued' ? 'pending' : head.payload.status, paymentMethod: payment?.payload?.paymentMethod || head.payload.customerPaymentMethod, paymentPending: !payment, paymentReady: Boolean(head.payload.acceptedTillId), lines: head.payload.lines.map(line => ({ name: line.name, quantity: line.quantity, options: line.options.map(option => option.name) })) } }))
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
      const invoiceWallets=await entityHeads.find({businessId:claims.businessId,entityType:'pos_record','payload.kind':'service-job','payload.payments.sale.paymentDetails.customerId':claims.customerId}).toArray()
      for(const row of invoiceWallets)for(const entry of row.payload.payments||[])if(entry.sale.paymentMethod==='wallet'&&entry.sale.paymentDetails?.customerId===claims.customerId)allTransactions.push({id:entry.sale.id,amount:-Number(entry.sale.total),reason:`Invoice ${row.payload.title}`,createdAt:entry.sale.createdAt})
      const returns = await entityHeads.find({ businessId: claims.businessId, entityType: 'pos_record', 'payload.kind': 'return', 'payload.walletCustomerId': claims.customerId }).toArray()
      for (const row of returns) allTransactions.push({ id: row.entityId, amount: Number(row.payload.total || 0), reason: `Return ${row.payload.saleId}: ${row.payload.reason || ''}`, createdAt: row.payload.updatedAt || row.updatedAt })
      allTransactions.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      const orderHeads = await entityHeads.find({ businessId: claims.businessId, entityType: 'pos_record', 'payload.kind': 'counter-order', 'payload.pos.customerId': claims.customerId }).sort({ updatedAt: -1 }).limit(100).toArray()
      const orders = await Promise.all(orderHeads.map(async head => {
        const payment = await operations.findOne({ businessId: claims.businessId, entityType: 'sale', entityId: counterSaleId(head.entityId) })
        return { id: head.entityId, delivery:Boolean(head.payload.delivery), deliveryStatus:head.payload.deliveryTracking?.status, status: head.payload.source === 'customer-portal' && !head.payload.acceptedTillId && head.payload.status === 'queued' ? 'pending' : head.payload.status, total: head.payload.total, currency: head.payload.currency, createdAt: head.payload.createdAt, updatedAt: head.payload.updatedAt, lines: head.payload.lines.map(line => ({ name: line.name, quantity: line.quantity, options: line.options.map(option => option.name) })), paymentMethod: payment?.payload?.paymentMethod || head.payload.customerPaymentMethod || '', paymentReference: payment?.payload?.paymentReference || head.payload.customerPaymentReference || '', paymentPending: Boolean(['bank-transfer', 'wallet', 'paystack'].includes(head.payload.customerPaymentMethod) && !payment), paymentReady: Boolean(head.payload.acceptedTillId) }
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
      if (!/^[a-z0-9][a-z0-9-]{2,80}$/i.test(businessId) || !ownerName || !/^\S+@\S+\.\S+$/.test(email) || password.length < 6 || password.length > 256) return send(response, 400, { error: 'Provide a valid business ID, owner name, email, and password of 6–256 characters.' })
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
    if(requestUrl.pathname.startsWith('/v1/business/integrations/')||requestUrl.pathname.startsWith('/v1/business/hospitality/email-activity')){
      if(!isAccess(claims)||!['owner','admin'].includes(claims.role)||!ObjectId.isValid(claims.sub))return send(response,403,{error:'Business owner or administrator sign-in required.'})
      const manager=await accounts.findOne({_id:new ObjectId(claims.sub),businessId:claims.businessId,role:{$in:['owner','admin']},removedAt:{$exists:false}})
      if(!manager)return send(response,403,{error:'Your active business account could not be confirmed.'})
      const ownerOnly=async()=>claims.role==='owner'&&manager.role==='owner'
      if(requestUrl.pathname==='/v1/business/integrations/paystack'&&request.method==='GET')return send(response,200,{...await tenantIntegrations.publicPaystack(claims.businessId),encryptionConfigured:tenantIntegrations.encryptionReady()})
      if(requestUrl.pathname==='/v1/business/integrations/paystack'&&['PUT','DELETE'].includes(request.method)){
        if(!await ownerOnly())return send(response,403,{error:'Only the business owner can connect or remove Paystack.'})
        const input=await readJson(request,8192);if(!await ownerPasswordIsValid(claims,input.ownerPassword))return send(response,401,{error:'Confirm the owner password to change Paystack connection.'})
        try{return send(response,200,request.method==='DELETE'?await tenantIntegrations.disconnectPaystack(claims.businessId):await tenantIntegrations.connectPaystack(claims.businessId,input))}catch(error){return send(response,400,{error:error.message||'Could not connect Paystack.'})}
      }
      if(requestUrl.pathname==='/v1/business/integrations/hospitality-email'&&request.method==='GET')return send(response,200,{settings:await tenantIntegrations.emailSettings(claims.businessId),provider:hospitalityMailProvider(),configured:hospitalityMailConfigured()})
      if(requestUrl.pathname==='/v1/business/integrations/hospitality-email'&&request.method==='PUT'){
        if(!await ownerOnly())return send(response,403,{error:'Only the business owner can change guest email settings.'})
        const input=await readJson(request,8192);if(!await ownerPasswordIsValid(claims,input.ownerPassword))return send(response,401,{error:'Confirm the owner password to change guest email settings.'})
        try{return send(response,200,{settings:await tenantIntegrations.saveEmailSettings(claims.businessId,input)})}catch(error){return send(response,400,{error:error.message||'Could not save guest email settings.'})}
      }
      if(requestUrl.pathname==='/v1/business/hospitality/email-activity'&&request.method==='GET'){
        const limit=Math.min(200,Math.max(1,Number(requestUrl.searchParams.get('limit'))||100)),rows=await hospitalityEmailLog.find({businessId:claims.businessId}).sort({createdAt:-1}).limit(limit).toArray()
        return send(response,200,{messages:rows.map(row=>({bookingId:row.bookingId,messageType:row.messageType,to:row.to||'',subject:row.subject||'',body:row.body||'',replyTo:row.replyTo||'',status:row.status,provider:row.provider||'',createdAt:row.createdAt||row.startedAt||null,acceptedAt:row.acceptedAt||null,deliveredAt:row.deliveredAt||null,openedAt:row.openedAt||null,bouncedAt:row.bouncedAt||null,lastError:row.deliveryError||row.lastError||''}))})
      }
      return send(response,404,{error:'Business integration route not found.'})
    }
    if (requestUrl.pathname === '/v1/hotel-calendar-sources' && ['GET', 'POST'].includes(request.method)) {
      if (!isDevice(claims) && !isAccess(claims)) return send(response, 401, { error: 'Sign in to the business or use an enrolled business device.' })
      if (isAccess(claims)) {
        if (!ObjectId.isValid(claims.sub)) return send(response, 403, { error: 'An active business account is required to manage booking-channel calendars.' })
        const account = await accounts.findOne({ _id: new ObjectId(claims.sub), businessId: claims.businessId, role: { $in: ['owner', 'admin', 'cashier'] }, removedAt: { $exists: false } })
        if (!account || !['owner', 'admin'].includes(account.role) && !hasPermission(account, 'hotelOperations')) return send(response, 403, { error: 'Hotel operations access is required to manage booking-channel calendars.' })
      }
      const profileSettings = await businessSettings.findOne({ businessId: claims.businessId })
      if (!normalizeShopProfile(profileSettings?.settings?.shopProfile).features?.hotelOperations) return send(response, 403, { error: 'Enable Hotel operations before connecting booking calendars.' })
      if (request.method === 'GET') {
        const roomId = String(requestUrl.searchParams.get('roomId') || '')
        const sources = await hotelCalendarSources.find({ businessId: claims.businessId, roomId }).toArray()
        return send(response, 200, { sources: sources.map(source => ({ id: source.sourceId, name: source.name, lastSyncedAt: source.lastSyncedAt || null, syncError: source.syncError || '', reservationCount: (source.blocks || []).length, blocks: (source.blocks || []).map(block => ({ id: block.id, checkIn: block.checkIn, checkOut: block.checkOut })) })) })
      }
      const input = await readJson(request, 8192)
      const roomId = String(input.roomId || '').trim()
      const roomHead = await entityHeads.findOne({ businessId: claims.businessId, entityType: 'pos_record', entityId: roomId, 'payload.kind': 'hotel-room' })
      if (!roomHead) return send(response, 404, { error: 'Choose a registered hotel room.' })
      const action = String(input.action || '')
      if (action === 'connect') {
        const name = String(input.name || '').trim().slice(0, 80)
        if (!name) return send(response, 400, { error: 'Enter a channel name such as Airbnb.' })
        let url
        try { url = validateHotelCalendarUrl(input.url) } catch (error) { return send(response, 400, { error: error.message }) }
        const sourceId = randomBytes(16).toString('hex')
        const source = { businessId: claims.businessId, roomId, branchId: roomHead.payload.branchId, sourceId, name, url, blocks: [], createdAt: new Date(), nextSyncAt: new Date() }
        await hotelCalendarSources.insertOne(source)
        try {
          const refreshed = await refreshHotelCalendarSource(source)
          return send(response, 201, { source: { id: sourceId, name, lastSyncedAt: refreshed.lastSyncedAt, reservationCount: refreshed.blocks.length, syncError: '' } })
        } catch (error) {
          const current = await hotelCalendarSources.findOne({ businessId: claims.businessId, roomId, sourceId })
          return send(response, 200, { source: { id: sourceId, name, lastSyncedAt: null, reservationCount: 0, syncError: String(error.message || 'Calendar sync failed.').slice(0, 240) } })
        }
      }
      const sourceId = String(input.sourceId || '')
      const source = await hotelCalendarSources.findOne({ businessId: claims.businessId, roomId, sourceId })
      if (!source) return send(response, 404, { error: 'That booking-channel calendar is not connected.' })
      if (action === 'remove') {
        await queueCalendarSourceAri(source, source.blocks || [])
        await hotelCalendarSources.deleteOne({ _id: source._id })
        return send(response, 200, { removed: true })
      }
      if (action === 'refresh') {
        try { const refreshed = await refreshHotelCalendarSource(source); return send(response, 200, { source: { id: sourceId, name: source.name, lastSyncedAt: refreshed.lastSyncedAt, reservationCount: refreshed.blocks.length, syncError: '' } }) }
        catch (error) { const current = await hotelCalendarSources.findOne({ _id: source._id }); return send(response, 502, { error: current?.syncError || error.message, source: { id: sourceId, name: source.name, lastSyncedAt: source.lastSyncedAt || null, reservationCount: (source.blocks || []).length, syncError: current?.syncError || error.message } }) }
      }
      return send(response, 400, { error: 'Choose connect, refresh, or remove.' })
    }
    if (requestUrl.pathname === '/v1/hotel-channel-manager' && ['GET', 'POST'].includes(request.method)) {
      if (!isAccess(claims) || !ObjectId.isValid(claims.sub)) return send(response, 403, { error: 'Sign in with a business staff account to manage channel connections.' })
      const account = await accounts.findOne({ _id: new ObjectId(claims.sub), businessId: claims.businessId, role: { $in: ['owner', 'admin', 'cashier'] }, removedAt: { $exists: false } })
      if (!account || !['owner', 'admin'].includes(account.role) && !hasPermission(account, 'hotelOperations')) return send(response, 403, { error: 'Hotel operations access is required to manage channel connections.' })
      const settings = await businessSettings.findOne({ businessId: claims.businessId })
      if (!normalizeShopProfile(settings?.settings?.shopProfile).features?.hotelOperations) return send(response, 403, { error: 'Enable Hotel operations before connecting a channel manager.' })
      if (request.method === 'GET') {
        const branchId = String(requestUrl.searchParams.get('branchId') || '').trim()
        if (!branchId) return send(response, 200, { ...await tenantIntegrations.publicChannex(claims.businessId), property: null, roomTypes: [], ratePlans: [] })
        const branch = await entityHeads.findOne({ businessId: claims.businessId, entityType: 'branch', entityId: branchId })
        if (branchId !== 'main' && (!branch || branch.payload?.isActive === false)) return send(response, 404, { error: 'Choose an active hotel branch.' })
        const rooms = await entityHeads.find({ businessId: claims.businessId, entityType: 'pos_record', 'payload.kind': 'hotel-room', 'payload.branchId': branchId }).toArray()
        const inventoryByType = new Map()
        for (const row of rooms) {
          const room = row.payload
          if (room.status !== 'active') continue
          const title = String(room.roomType || 'Standard').trim().slice(0, 255)
          const key = title.toLocaleLowerCase()
          const item = inventoryByType.get(key) || { title, count: 0, occupancy: 1 }
          item.count += 1
          item.occupancy = Math.max(item.occupancy, Number(room.maxGuests || 2))
          inventoryByType.set(key, item)
        }
        const businessName = String(settings?.settings?.appName || 'Hotel').trim().slice(0, 255)
        const businessCurrency = String(settings?.settings?.currency || 'USD').trim().toUpperCase()
        const businessTimeZone = normalizeShopProfile(settings?.settings?.shopProfile).reportingTimeZone || 'UTC'
        const connection = await tenantIntegrations.publicChannex(claims.businessId), availableProperties = connection.connected && connection.connectionMode !== 'stockroom-managed' ? await tenantIntegrations.discoverChannexProperties(claims.businessId).then(result => result.availableProperties).catch(() => []) : []
        const localRoomTypes = [...inventoryByType.values()]
        const propertySetup = { title: branch?.payload?.name || businessName, currency: businessCurrency, timezone: businessTimeZone }
        try { return send(response, 200, { ...connection, ...(await tenantIntegrations.channexProperty(claims.businessId, branchId)), availableProperties, localRoomTypes: localRoomTypes.map(row => row.title), localRoomInventory: localRoomTypes, propertySetup }) }
        catch (error) { if (/Connect a Channex|Connect a Channex property/.test(error.message)) return send(response, 200, { ...connection, property: null, roomTypes: [], ratePlans: [], availableProperties, localRoomTypes: localRoomTypes.map(row => row.title), localRoomInventory: localRoomTypes, propertySetup }); throw error }
      }
      const input = await readJson(request, 8192), action = String(input.action || ''), branchId = String(input.branchId || '').trim()
      const branch = await entityHeads.findOne({ businessId: claims.businessId, entityType: 'branch', entityId: branchId })
      if (!branchId || branchId !== 'main' && (!branch || branch.payload?.isActive === false)) return send(response, 404, { error: 'Choose an active hotel branch.' })
      if (action === 'discover-properties') {
        try { return send(response, 200, await tenantIntegrations.discoverChannexProperties(claims.businessId, String(input.apiKey || ''))) }
        catch (error) { return send(response, 400, { error: error.message || 'Could not load Channex properties.' }) }
      }
      if (action === 'connect') {
        try { const result = await tenantIntegrations.connectChannexProperty(claims.businessId, input); return send(response, 200, { ...result, ...(await tenantIntegrations.publicChannex(claims.businessId)) }) }
        catch (error) { return send(response, 400, { error: error.message || 'Could not connect the Channex property.' }) }
      }
      if (action === 'onboard-property') {
        try {
          const roomHeads = await entityHeads.find({ businessId: claims.businessId, entityType: 'pos_record', 'payload.kind': 'hotel-room', 'payload.branchId': branchId, 'payload.status': 'active' }).toArray()
          const roomTypesByName = new Map()
          for (const row of roomHeads) {
            const title = String(row.payload.roomType || 'Standard').trim().slice(0, 255), key = title.toLocaleLowerCase()
            const local = roomTypesByName.get(key) || { title, count: 0, occupancy: 1 }
            local.count += 1
            local.occupancy = Math.max(local.occupancy, Number(row.payload.maxGuests || 2))
            roomTypesByName.set(key, local)
          }
          const businessCurrency = String(settings?.settings?.currency || 'USD').trim().toUpperCase()
          return send(response, 200, { ...await tenantIntegrations.onboardChannexProperty(claims.businessId, { branchId, property: { ...(input.property || {}), currency: businessCurrency }, roomTypes: [...roomTypesByName.values()] }), ...(await tenantIntegrations.publicChannex(claims.businessId)) })
        } catch (error) { return send(response, 400, { error: error.message || 'Could not set up this hotel property in Channex.' }) }
      }
      if (action === 'create-channel-setup-session') {
        try { return send(response, 200, await tenantIntegrations.channexChannelSetupUrl(claims.businessId, branchId, account.name || account.displayName || account.email || account.username)) }
        catch (error) { return send(response, 400, { error: error.message || 'Could not open booking channel setup.' }) }
      }
      if (action === 'save-mappings') {
        try { return send(response, 200, await tenantIntegrations.channexProperty(claims.businessId, branchId, { mappings: Array.isArray(input.mappings) ? input.mappings : [] })) }
        catch (error) { return send(response, 400, { error: error.message || 'Could not save channel mappings.' }) }
      }
      if (action === 'disconnect') return send(response, 200, await tenantIntegrations.disconnectChannexProperty(claims.businessId, branchId))
      return send(response, 400, { error: 'Choose discover-properties, connect, save-mappings, or disconnect.' })
    }
    if (request.url === '/v1/business/catalogue-contribution' && request.method === 'GET') {
      const settings = await businessSettings.findOne({ businessId: claims.businessId })
      return send(response, 200, { mode: catalogueContributionMode(settings) })
    }
    if (request.url === '/v1/business/catalogue-contribution' && request.method === 'PUT') {
      if (!isAccess(claims) || claims.role !== 'owner') return send(response, 403, { error: 'Owner access token required.' })
      if (!ObjectId.isValid(claims.sub) || !await accounts.findOne({ _id: new ObjectId(claims.sub), businessId: claims.businessId, role: 'owner', removedAt: { $exists: false } })) return send(response, 403, { error: 'An active business owner must change catalogue sharing.' })
      const input = await readJson(request)
      if (!['auto', 'never', 'ask'].includes(input.mode)) return send(response, 400, { error: 'Choose automatic contribution, no contribution, or ask each time.' })
      await businessSettings.updateOne({ businessId: claims.businessId }, { $set: { businessId: claims.businessId, catalogueContributionMode: input.mode, 'settings.catalogueContributionMode': input.mode, updatedAt: new Date() }, $unset: { catalogueContributionOptIn: '' } }, { upsert: true })
      return send(response, 200, { mode: input.mode })
    }
    if (request.method === 'GET' && request.url?.startsWith('/v1/business/settings')) {
      if (!isDevice(claims)) return send(response, 403, { error: 'Device token required.' })
      const query = new URL(request.url, `http://${request.headers.host}`).searchParams
      const businessId = query.get('businessId') || ''
      if (!businessId || claims.businessId !== businessId) return send(response, 403, { error: 'Token does not authorize this business.' })
      const current = await businessSettings.findOne({ businessId })
      if (current?.settings) return send(response, 200, { settings: current.settings, hasHistory: true })
      const latest = await operations.find({ businessId, entityType: 'settings', action: 'upsert' }).sort({ createdAt: -1, _id: -1 }).limit(1).next()
      const hasHistory = Boolean(latest || await operations.findOne({ businessId }, { projection: { _id: 1 } }))
      return send(response, 200, { settings: latest?.payload || null, hasHistory })
    }
    if (request.url === '/v1/business/device-enrollment-policy' && ['GET', 'PUT'].includes(request.method || '')) {
      if (!isAccess(claims) || claims.role !== 'owner') return send(response, 403, { error: 'Owner access required to manage staff device enrollment.' })
      if (request.method === 'GET') {
        const saved = await businessSettings.findOne({ businessId: claims.businessId }, { projection: { allowStaffDeviceEnrollment: 1, 'settings.allowStaffDeviceEnrollment': 1 } })
        return send(response, 200, { allowStaffDeviceEnrollment: saved?.allowStaffDeviceEnrollment === true || saved?.settings?.allowStaffDeviceEnrollment === true })
      }
      const input = await readJson(request)
      if (typeof input.allowStaffDeviceEnrollment !== 'boolean') return send(response, 400, { error: 'Choose whether staff may enroll new devices.' })
      const updatedAt = new Date()
      await businessSettings.updateOne({ businessId: claims.businessId }, { $set: { businessId: claims.businessId, allowStaffDeviceEnrollment: input.allowStaffDeviceEnrollment, 'settings.allowStaffDeviceEnrollment': input.allowStaffDeviceEnrollment, updatedAt } }, { upsert: true })
      return send(response, 200, { allowStaffDeviceEnrollment: input.allowStaffDeviceEnrollment })
    }
    if (request.method === 'POST' && request.url === '/v1/devices/enroll') {
      if (!isAccess(claims)) return send(response, 403, { error: 'Sign-in required.' })
      if (claims.role !== 'owner') {
        const policy = await businessSettings.findOne({ businessId: claims.businessId }, { projection: { allowStaffDeviceEnrollment: 1, 'settings.allowStaffDeviceEnrollment': 1 } })
        if (policy?.allowStaffDeviceEnrollment !== true && policy?.settings?.allowStaffDeviceEnrollment !== true) return send(response, 403, { error: 'The owner has not allowed staff to enroll new devices. Ask them to enable staff device enrollment in Business settings.' })
      }
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
      const name = String(input.name || '').trim(); const email = String(input.email || '').trim().toLowerCase(); const staffUsername = username(input.username); const password = String(input.password || ''); const role = String(input.role || '')
      if (!name || (email && !/^\S+@\S+\.\S+$/.test(email)) || !validUsername(staffUsername) || password.length < 4 || password.length > 256 || !['admin', 'cashier'].includes(role)) return send(response, 400, { error: 'Provide valid staff details, a 3–32 character username, and a password of 4–256 characters.' })
      const savedSettings = await businessSettings.findOne({ businessId: claims.businessId }, { projection: { 'settings.shopProfile': 1 } })
      const permissions = role === 'cashier' ? defaultCashierPermissions(normalizeShopProfile(savedSettings?.settings?.shopProfile)) : {}
      const staff = { businessId: claims.businessId, name, ...(email ? { email } : {}), username: staffUsername, role, permissions, operationalAccess:Object.values(permissions).some(Boolean), passwordHash: hashPassword(password), createdAt: new Date() }
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
    const permissionMatch=request.url?.match(/^\/v1\/staff\/([^/]+)\/permissions$/)
    if(request.method==='PUT'&&permissionMatch){
      if(!isAccess(claims)||claims.role!=='owner')return send(response,403,{error:'Owner access token required.'})
      if(!ObjectId.isValid(permissionMatch[1]))return send(response,400,{error:'Invalid staff account.'})
      const input=await readJson(request);if(!await ownerPasswordIsValid(claims,input.ownerPassword))return send(response,401,{error:'Owner password confirmation required.'})
      const permissions=parsePermissions(input.permissions);if(!permissions)return send(response,400,{error:'Choose staff permissions.'})
      const updated=await accounts.findOneAndUpdate({_id:new ObjectId(permissionMatch[1]),businessId:claims.businessId,role:{$in:['admin','cashier']},removedAt:{$exists:false}},{$set:{permissions,operationalAccess:Object.values(permissions).some(Boolean)}},{returnDocument:'after'})
      if(!updated)return send(response,404,{error:'Staff account not found.'})
      await refreshTokens.deleteMany({accountId:updated._id});return send(response,200,{account:publicAccount(updated)})
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
      if (password.length < 4 || password.length > 256) return send(response, 400, { error: 'Staff passwords must be 4–256 characters.' })
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
    if (request.method === 'POST' && request.url === '/v1/support/requests') {
      try { return send(response, 200, await submitSupportRequest({ collection: supportRequests, identity: claims, input: await readJson(request), sendMail: sendSupportRequest })) }
      catch (error) { return send(response, 400, { error: error.message }) }
    }
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
      return send(response, 200, { capabilities: ['counter-v3', 'restaurant-v2','restaurant-hotel-folio-v1', 'service-jobs-v1','service-jobs-wallet-v1','staff-permissions-v1', 'customer-orders-v1', 'retail-orders-v1', 'stock-work-v1', 'restaurant-reservations-v1', 'church-collections-v1','hospitality-operations-v1','hotel-shift-handoff-v1','hotel-reservation-deposits-v1','hotel-group-reschedule-v1','hotel-group-master-folio-v1','hotel-folio-correction-v1'] })
    }
    if (request.method === 'POST' && request.url === '/v1/sync/push') {
      const input = await readJson(request)
      const businessId = String(input.businessId || '')
      const deviceId = String(input.deviceId || '')
      const incoming = Array.isArray(input.operations) ? input.operations.slice(0, 500) : []
      if (!businessId || !deviceId || !incoming.length || claims.businessId !== businessId || claims.deviceId !== deviceId) return send(response, 403, { error: 'Token does not authorize this business/device.' })
      if (await businessExitPayments.findOne({ _id: businessId, closedAt: { $exists: true } })) return send(response, 403, { error: 'This business has completed its Stockroom exit.' })
      return await serializeBusinessSync(businessId,async()=>{
      const businessProfile=await businessSettings.findOne({businessId},{projection:{'settings.shopProfile':1}}),hotelTimeZone=normalizeShopProfile(businessProfile?.settings?.shopProfile).reportingTimeZone||'UTC',hotelBusinessDate=new Intl.DateTimeFormat('en-CA',{timeZone:hotelTimeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
      const containsNewSale = await Promise.all(incoming.filter(operation => {
        if (operation.entityType === 'pos_record' && operation.payload?.kind === 'service-job') return false
        if (operation.entityType === 'sale' && (operation.payload?.paymentDetails?.servicePayment || operation.payload?.paymentDetails?.serviceJob)) return false
        return (operation.entityType === 'sale' && operation.action === 'create') || (operation.entityType === 'pos_record' && operation.payload?.kind === 'restaurant-ledger')
      }).map(operation => operations.findOne({ businessId, operationId: String(operation.operationId) }, { projection: { _id: 1 } }).then(existing => !existing)))
      if (containsNewSale.some(Boolean)) {
        const access = await subscriptionHandler.access(businessId)
        if (access.blocked) return send(response, 402, { error: access.reason, status: access.status })
      }
      if (incoming.some(operation => operation.entityType === 'staff_removal')) return send(response, 403, { error: 'Staff removal requires owner authentication.' })
      const restrictedStaff=await accounts.findOne({businessId,role:{$in:['admin','cashier']},permissions:{$exists:true},removedAt:{$exists:false}})
      if(restrictedStaff&&request.headers['x-stockroom-staff-permissions']!=='staff-permissions-v1')return send(response,426,{error:'Update this device before synchronizing individual staff permissions.'})
      const documents = incoming.map((operation) => ({ businessId, deviceId, operationId: String(operation.operationId), entityType: String(operation.entityType), entityId: String(operation.entityId), action: String(operation.action), payload: operation.payload || {}, createdAt: operation.createdAt || new Date().toISOString(), receivedAt: new Date() }))
      const acceptedOperationIds = []
      const conflicts = []
      const stagedHotelStays = new Map()
      for (const document of documents) {
        // Retries are normal after an interrupted response. They are successful
        // no-ops, never conflicts and never duplicate financial events.
        const previouslyStored=await operations.findOne({businessId,operationId:document.operationId})
        if (previouslyStored) {
          for(const reason of previouslyStored.coordinationWarnings||[])conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason})
          acceptedOperationIds.push(document.operationId)
          continue
        }
        const actorId=document.payload.staffId||document.payload.createdBy
        if(actorId&&ObjectId.isValid(actorId)){const actor=await accounts.findOne({_id:new ObjectId(actorId),businessId,removedAt:{$exists:false}});const permission=operationPermission(document);if(actor?.permissions&&permission&&!hasPermission(actor,permission)){conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:'The owner has not granted this staff operation.'});continue}}
        if(document.entityType==='sale' && document.payload.paymentDetails?.serviceJob) {
          conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:'Synchronize invoice payments through their job record.'});continue
        }
        if(document.entityType==='sale' && document.payload.paymentDetails?.restaurantBill) {
          try {
            if(document.action!=='create' || document.entityId!==document.payload.id) throw new Error('Invalid bill payment operation.')
            const ledger=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:restaurantLedgerId(document.payload.paymentDetails.restaurantBill.sessionId)})
            const entry=ledger?.payload.payments.find(entry=>entry.id===document.entityId)
            if(!entry || entry.receiptHash!==await restaurantReceiptHash(document.payload)) throw new Error('Synchronize the accepted bill payment allocation before its receipt.')
            recordPayment(document.payload,document.payload.paymentDetails?.policy)
            const previous=await operations.findOne({businessId,entityType:'sale',entityId:document.entityId})
            if(previous) { if(await restaurantReceiptHash(previous.payload)!==entry.receiptHash) throw new Error('A different payment already uses this receipt ID.'); acceptedOperationIds.push(document.operationId);continue }
          }catch(error){conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:error.message});continue}
        }
        if (document.entityType === 'sale' && document.payload.paymentDetails?.counterOrder) {
          try {
            if (document.action !== 'create' || document.entityId !== document.payload.id) throw new Error('Invalid counter payment operation.')
            const order = await entityHeads.findOne({ businessId, entityType: 'pos_record', entityId: document.payload.paymentDetails.counterOrder.id })
            if (document.payload.terminalProvider === 'Paystack Online' && !await customerPaystackPayments.verifiesOnlineOrderSale(businessId, document.payload)) throw new Error('This Paystack checkout could not be verified for the customer order.')
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
        if(document.entityType==='pos_record'&&['hotel-room','hotel-stay','hotel-room-block','hotel-shift','hotel-journal-entry','hotel-day-close','venue-space','nightclub-event','nightclub-entry','nightclub-inquiry'].includes(document.payload.kind)) {
          try {
            if(document.action!=='upsert'||document.entityId!==document.payload.id)throw new Error('Invalid hospitality operation.')
            const current=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:document.entityId})
            if(document.payload.source==='channex'&&current?.payload.source!=='channex')throw new Error('Channel reservations are managed by the connected provider and cannot be created by a Stockroom device.')
            if(current?.operationId!==document.operationId&&(document.payload.expectedUpdatedAt||'')!==(current?.payload.updatedAt||''))throw new Error('This record changed on another device. Refresh and review before continuing.')
            if(document.payload.kind==='hotel-journal-entry')validateHotelJournal(document.payload,current?.payload)
            else if(document.payload.kind==='hotel-day-close')validateHotelDayClose(document.payload,current?.payload)
            else validateHospitalityRecord(document.payload,current?.payload)
            if(document.payload.kind==='venue-space'){
              const otherSpaces=documents.filter(other=>other.entityType==='pos_record'&&other.payload.kind==='venue-space'&&other.entityId!==document.entityId&&other.payload.branchId===document.payload.branchId).map(other=>other.payload),storedSpaces=(await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'venue-space','payload.branchId':document.payload.branchId,entityId:{$ne:document.entityId}}).toArray()).map(row=>row.payload)
              if([...storedSpaces,...otherSpaces].some(space=>space.name.toLocaleLowerCase()===document.payload.name.toLocaleLowerCase()))throw new Error('A venue space with this name already exists in this branch.')
              if(current&&(current.payload.name!==document.payload.name||current.payload.capacity!==document.payload.capacity||current.payload.status!==document.payload.status)){const events=(await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'nightclub-event','payload.branchId':document.payload.branchId,'payload.status':'scheduled'}).toArray()).map(row=>row.payload),batch=documents.filter(other=>other.entityType==='pos_record'&&other.payload.kind==='nightclub-event'&&other.payload.venueSpaceId===document.entityId).map(other=>other.payload);if([...events,...batch].some(event=>event.venueSpaceId===document.entityId&&event.status==='scheduled'&&Date.parse(event.endsAt||new Date(Date.parse(event.startsAt)+14400000).toISOString())+Number(event.teardownMinutes||0)*60000>Date.now()))throw new Error('Do not rename, resize or deactivate a venue space while it has a scheduled event.')}
            }
            if(document.payload.kind==='nightclub-event'&&document.payload.venueSpaceId){const spaceDocument=documents.find(other=>other.entityType==='pos_record'&&other.entityId===document.payload.venueSpaceId&&other.payload.kind==='venue-space')?.payload,spaceHead=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:document.payload.venueSpaceId}),space=spaceDocument||spaceHead?.payload;if(!space||space.branchId!==document.payload.branchId||space.status!=='active'||space.name!==document.payload.venueSpaceName||!Number(document.payload.capacity)||Number(document.payload.capacity)>Number(space.capacity))throw new Error('Choose an active venue space in this branch and set event capacity within its limit.');const stored=(await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'nightclub-event','payload.branchId':document.payload.branchId,entityId:{$ne:document.entityId}}).toArray()).map(row=>row.payload),batch=documents.filter(other=>other.entityType==='pos_record'&&other.payload.kind==='nightclub-event'&&other.payload.branchId===document.payload.branchId&&other.entityId!==document.entityId).map(other=>other.payload),events=[...new Map([...stored,...batch].map(event=>[event.id,event])).values()];if(events.some(event=>event.status==='scheduled'&&event.venueSpaceId===document.payload.venueSpaceId&&Date.parse(document.payload.startsAt)-Number(document.payload.setupMinutes||0)*60000<Date.parse(event.endsAt||new Date(Date.parse(event.startsAt)+14400000).toISOString())+Number(event.teardownMinutes||0)*60000&&Date.parse(document.payload.endsAt)+Number(document.payload.teardownMinutes||0)*60000>Date.parse(event.startsAt)-Number(event.setupMinutes||0)*60000))throw new Error(`${space.name} already has a scheduled event during those times.`)}
            if(document.payload.kind==='hotel-stay'&&document.payload.groupChangeId){const updates=documents.filter(other=>other.entityType==='pos_record'&&other.payload.kind==='hotel-stay'&&other.payload.groupId===document.payload.groupId&&other.payload.groupChangeId===document.payload.groupChangeId),persisted=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'hotel-stay','payload.groupId':document.payload.groupId}).toArray(),roomIds=updates.map(row=>row.payload.roomId),allIds=persisted.map(row=>row.entityId);if(!current||current.payload.status!=='booked'||updates.length!==document.payload.groupSize||persisted.length!==document.payload.groupSize||new Set(updates.map(row=>row.payload.id)).size!==updates.length||new Set(roomIds).size!==updates.length||updates.some(row=>row.payload.status!=='booked'||row.payload.checkIn!==document.payload.checkIn||row.payload.checkOut!==document.payload.checkOut||row.payload.groupSize!==document.payload.groupSize)||persisted.some(row=>!updates.some(update=>update.entityId===row.entityId)))throw new Error('A group date change must synchronize the complete booked group together.');const jobs=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'service-job','payload.hospitality.recordId':{$in:allIds}}).toArray();if(jobs.some(job=>job.payload.status!=='cancelled'))throw new Error('Cancel every group folio before changing the group dates.');for(const update of updates){const stay=update.payload,room=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:stay.roomId});if(!room||room.payload.kind!=='hotel-room'||room.payload.status!=='active'||room.payload.branchId!==stay.branchId||room.payload.roomName!==stay.roomName||Number(stay.nightlyRate)!==Number(room.payload.nightlyRate)||JSON.stringify(stay.rateBreakdown)!==JSON.stringify(hotelRateBreakdown(room.payload,stay.checkIn,stay.checkOut))||JSON.stringify(stay.nightlyRates)!==JSON.stringify(hotelNightlyRates(room.payload,stay.checkIn,stay.checkOut))||Number(stay.depositRequired||0)!==hotelDepositRequirement(room.payload,stay.checkIn,stay.checkOut))throw new Error('The group date change has a room, rate or deposit that no longer matches current inventory. Refresh and try again.')}}
            if(document.payload.kind==='hotel-shift'&&document.payload.status==='open'){const active=await entityHeads.findOne({businessId,entityType:'pos_record','payload.kind':'hotel-shift','payload.branchId':document.payload.branchId,'payload.status':{$in:['open','handed-over']},entityId:{$ne:document.entityId}});if(active)throw new Error('Another front-desk shift is open or awaiting handoff acknowledgment for this branch.')}
            if(document.payload.kind==='hotel-shift'&&current&&document.payload.status!==current.payload.status){const actor=document.payload.staffId&&ObjectId.isValid(document.payload.staffId)?await accounts.findOne({_id:new ObjectId(document.payload.staffId),businessId,removedAt:{$exists:false}}):null;if(document.payload.status==='handed-over'){if(current.payload.openedBy!==document.payload.staffId&&!['owner','admin'].includes(actor?.role))throw new Error('Only the staff member who opened this shift or a manager can hand it over.');const incomingId=document.payload.incomingStaffId,incoming=incomingId&&ObjectId.isValid(incomingId)?await accounts.findOne({_id:new ObjectId(incomingId),businessId,removedAt:{$exists:false}}):null;if(!incoming||incoming.permissions&&!hasPermission(incoming,'hotelOperations'))throw new Error('The incoming staff member must have active Hotel operations access.');const branch=await entityHeads.findOne({businessId,entityType:'branch',entityId:document.payload.branchId}),assigned=branch?.payload?.assignedUserIds||[];if(assigned.length&&!assigned.includes(incomingId))throw new Error('The incoming staff member is not assigned to this branch.')}if(document.payload.status==='closed'&&current.payload.incomingStaffId!==document.payload.staffId&&!['owner','admin'].includes(actor?.role))throw new Error('Only the assigned incoming staff member or a manager can acknowledge this handoff.')}
            if(document.payload.kind==='hotel-room-block'&&hotelRoomBlockActive(document.payload)){if(document.payload.checkIn<hotelBusinessDate)throw new Error('A tentative hold cannot start before the current hotel business date.');const latestClose=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'hotel-day-close','payload.branchId':document.payload.branchId}).sort({'payload.businessDate':-1}).limit(1).toArray();if(latestClose.length&&document.payload.checkIn<=latestClose[0].payload.businessDate)throw new Error('A tentative hold cannot start on or before the latest closed hotel business date.')}
            if(document.payload.kind==='hotel-stay'&&document.payload.customerId){const guestProfile=await entityHeads.findOne({businessId,entityType:'customer',entityId:document.payload.customerId});if(!guestProfile)throw new Error('Synchronize the saved guest customer profile before this hotel stay.');if(document.payload.source!=='customer-portal'&&(guestProfile.payload.name!==document.payload.guestName||String(guestProfile.payload.phone||'')!==String(document.payload.guestPhone||'')))throw new Error('The hotel stay guest details must match its linked customer profile.');if(document.payload.source!=='customer-portal'&&document.payload.staffId&&ObjectId.isValid(document.payload.staffId)){const profileActor=await accounts.findOne({_id:new ObjectId(document.payload.staffId),businessId,removedAt:{$exists:false}});if(profileActor?.permissions&&!hasPermission(profileActor,'customers'))throw new Error('The staff member is not allowed to link customer profiles to hotel stays.')}}
            if(document.payload.kind==='hotel-room-block'&&hotelRoomBlockActive(document.payload))for(const heldRoom of document.payload.rooms){const room=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:heldRoom.roomId});if(!room||room.payload.kind!=='hotel-room'||room.payload.branchId!==document.payload.branchId||room.payload.roomName!==heldRoom.roomName||room.payload.status!=='active')throw new Error('A tentative hold must reference active rooms in this branch.');const stays=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'hotel-stay','payload.branchId':document.payload.branchId,'payload.status':{$in:['booked','checked-in']}}).toArray();if(stays.some(row=>row.payload.roomId===heldRoom.roomId&&document.payload.checkIn<row.payload.checkOut&&document.payload.checkOut>row.payload.checkIn)||documents.some(other=>other.entityType==='pos_record'&&other.payload.kind==='hotel-stay'&&other.payload.branchId===document.payload.branchId&&['booked','checked-in'].includes(other.payload.status)&&other.payload.roomId===heldRoom.roomId&&document.payload.checkIn<other.payload.checkOut&&document.payload.checkOut>other.payload.checkIn))throw new Error(`${heldRoom.roomName} has an overlapping guest booking.`);const blocks=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'hotel-room-block','payload.branchId':document.payload.branchId,'payload.status':'held',entityId:{$ne:document.entityId}}).toArray();if(blocks.some(row=>hotelRoomBlockActive(row.payload)&&row.payload.rooms.some(room=>room.roomId===heldRoom.roomId)&&document.payload.checkIn<row.payload.checkOut&&document.payload.checkOut>row.payload.checkIn)||documents.some(other=>other.entityType==='pos_record'&&other.payload.kind==='hotel-room-block'&&other.entityId!==document.entityId&&hotelRoomBlockActive(other.payload)&&other.payload.branchId===document.payload.branchId&&other.payload.rooms.some(room=>room.roomId===heldRoom.roomId)&&document.payload.checkIn<other.payload.checkOut&&document.payload.checkOut>other.payload.checkIn))throw new Error(`${heldRoom.roomName} already has an overlapping tentative hold.`);if((await hotelCalendarBlocks(businessId,heldRoom.roomId)).some(stay=>document.payload.checkIn<stay.checkOut&&document.payload.checkOut>stay.checkIn))throw new Error(`${heldRoom.roomName} conflicts with a connected booking calendar.`)}
            if(document.payload.kind==='hotel-room-block'&&document.payload.convertedGroupId){const groupStays=documents.filter(other=>other.entityType==='pos_record'&&other.payload.kind==='hotel-stay'&&other.payload.convertedFromBlockId===document.entityId&&other.payload.groupId===document.payload.convertedGroupId&&other.payload.branchId===document.payload.branchId&&other.payload.checkIn===document.payload.checkIn&&other.payload.checkOut===document.payload.checkOut&&['booked','checked-in'].includes(other.payload.status)).map(other=>other.payload),persisted=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'hotel-stay','payload.convertedFromBlockId':document.entityId,'payload.groupId':document.payload.convertedGroupId,'payload.branchId':document.payload.branchId,'payload.checkIn':document.payload.checkIn,'payload.checkOut':document.payload.checkOut,'payload.status':{$in:['booked','checked-in']}}).toArray(),allStays=[...new Map([...persisted.map(row=>row.payload),...groupStays].map(stay=>[stay.id,stay])).values()],heldIds=(document.payload.rooms||[]).map(room=>room.roomId).sort(),stayIds=allStays.map(stay=>stay.roomId).sort();if(document.payload.status!=='released'||allStays.length!==heldIds.length||heldIds.some((roomId,index)=>roomId!==stayIds[index])||allStays.some(stay=>stay.groupSize!==heldIds.length))throw new Error('A converted room hold must release together with a complete matching group reservation.')}
            if(document.payload.kind==='hotel-stay'&&document.payload.convertedFromBlockId){const blockDocuments=documents.filter(other=>other.entityType==='pos_record'&&other.entityId===document.payload.convertedFromBlockId&&other.payload.kind==='hotel-room-block'),blockDocument=blockDocuments.find(other=>other.payload.status==='released'&&other.payload.convertedGroupId===document.payload.groupId),persistedBlock=(await entityHeads.findOne({businessId,entityType:'pos_record',entityId:document.payload.convertedFromBlockId}))?.payload,blockHead=persistedBlock||blockDocuments.find(other=>other.payload.status==='held')?.payload;if(!blockHead||blockHead.status!=='held'||blockHead.branchId!==document.payload.branchId||blockHead.checkIn!==document.payload.checkIn||blockHead.checkOut!==document.payload.checkOut||blockHead.rooms?.length!==document.payload.groupSize||!blockHead.rooms.some(room=>room.roomId===document.payload.roomId)||!blockDocument)throw new Error('A stay converted from a tentative hold must sync with its matching complete hold release.')}
            if(document.payload.kind==='hotel-day-close'&&!current){
              const businessDate=document.payload.businessDate,latest=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'hotel-day-close','payload.branchId':document.payload.branchId}).sort({'payload.businessDate':-1}).limit(1).toArray()
              if(businessDate>hotelBusinessDate)throw new Error('A hotel business date cannot be closed before it occurs.')
              if(latest.length&&businessDate<=latest[0].payload.businessDate)throw new Error('Close hotel business dates in order; this date is already closed or earlier than the latest close.')
              const branchId=document.payload.branchId
              const branchRecords=async kind=>{
                const stored=(await entityHeads.find({businessId,entityType:'pos_record','payload.kind':kind,'payload.branchId':branchId}).toArray()).map(row=>row.payload)
                const pending=documents.filter(row=>row.entityType==='pos_record'&&row.payload.kind===kind&&row.payload.branchId===branchId).map(row=>row.payload)
                return [...new Map([...stored,...pending].map(row=>[row.id,row])).values()]
              }
              const [stays,rooms,shifts]=await Promise.all(['hotel-stay','hotel-room','hotel-shift'].map(branchRecords))
              const storedJobs=(await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'service-job','payload.branchId':branchId,'payload.hospitality.recordKind':'hotel-stay'}).toArray()).map(row=>row.payload)
              const pendingJobs=documents.filter(row=>row.entityType==='pos_record'&&row.payload.kind==='service-job'&&row.payload.branchId===branchId&&row.payload.hospitality?.recordKind==='hotel-stay').map(row=>row.payload)
              const jobs=[...new Map([...storedJobs,...pendingJobs].map(row=>[row.id,row])).values()]
              const audit=buildHotelNightAudit(businessDate,stays,rooms,shifts,jobs,latest[0]?.payload.businessDate||'')
              if(!audit.readyToClose)throw new Error(audit.blockers.join(' '))
              if(JSON.stringify(audit.summary)!==JSON.stringify(document.payload.summary))throw new Error('The hotel close report no longer matches current arrivals, departures, folios and shifts. Refresh the audit report and try again.')
            }
            if(document.payload.kind==='hotel-stay'&&document.payload.status==='no-show'&&(!current||current.payload.status!=='booked'||document.payload.checkIn>hotelBusinessDate))throw new Error('Mark a booked stay as no-show on or after its check-in date.')
            if(document.payload.kind==='nightclub-entry'&&document.payload.status==='no-show'){
              const event=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:document.payload.eventId})
              if(!current||current.payload.status!=='expected'||!event||Date.parse(event.payload.startsAt)>Date.now())throw new Error('Mark an expected guest as no-show after the event starts.')
            }
            if(document.payload.kind==='nightclub-inquiry'&&current){const activeQuotes=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'service-job','payload.hospitality.recordId':document.entityId,'payload.status':{$ne:'cancelled'}}).toArray();if(activeQuotes.length&&(document.payload.quotedTotal!==current.payload.quotedTotal||document.payload.proposal!==current.payload.proposal||['declined','cancelled'].includes(document.payload.status)))throw new Error('Cancel the linked estimate or invoice before changing this proposal or closing its inquiry.')}
            if(document.payload.kind==='hotel-room') {
              if(document.payload.housekeepingStatus==='ready'&&(document.payload.housekeepingChecklist||[]).some(task=>!task.completed))throw new Error('Complete every room checklist task before marking this room ready.')
              const rooms=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'hotel-room','payload.branchId':document.payload.branchId,entityId:{$ne:document.entityId}}).toArray()
              if(rooms.some(row=>row.payload.roomName.toLocaleLowerCase()===document.payload.roomName.toLocaleLowerCase()))throw new Error('A room with this name already exists in the register.')
              const activeStays=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'hotel-stay','payload.branchId':document.payload.branchId,'payload.roomId':document.entityId,'payload.status':{$in:['booked','checked-in']}}).toArray()
              if(activeStays.some(stay=>Number(stay.payload.guestCount||1)>Number(document.payload.maxGuests||2)))throw new Error('The room guest limit is below an active booking.')
              const newOutages=(document.payload.outOfOrderPeriods||[]).filter(period=>period.status==='scheduled'&&!(current?.payload?.outOfOrderPeriods||[]).some(old=>old.id===period.id)),activeBlocks=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'hotel-room-block','payload.branchId':document.payload.branchId,'payload.status':'held'}).toArray(),connectedCalendars=await hotelCalendarSources.find({businessId,roomId:document.entityId}).toArray()
              for(const period of newOutages){if(activeStays.some(stay=>period.startDate<stay.payload.checkOut&&period.endDate>stay.payload.checkIn)||documents.some(other=>other.entityType==='pos_record'&&other.payload.kind==='hotel-stay'&&other.payload.roomId===document.entityId&&['booked','checked-in'].includes(other.payload.status)&&period.startDate<other.payload.checkOut&&period.endDate>other.payload.checkIn))throw new Error('A guest booking overlaps the new out-of-order period. Resolve the booking before taking the room out of service.');if(activeBlocks.some(row=>hotelRoomBlockActive(row.payload)&&row.payload.rooms.some(room=>room.roomId===document.entityId)&&period.startDate<row.payload.checkOut&&period.endDate>row.payload.checkIn)||documents.some(other=>other.entityType==='pos_record'&&other.payload.kind==='hotel-room-block'&&hotelRoomBlockActive(other.payload)&&other.payload.rooms.some(room=>room.roomId===document.entityId)&&period.startDate<other.payload.checkOut&&period.endDate>other.payload.checkIn))throw new Error('A tentative room hold overlaps the new out-of-order period.');if(connectedCalendars.some(source=>(source.blocks||[]).some(block=>period.startDate<block.checkOut&&period.endDate>block.checkIn)))throw new Error('A connected booking calendar already blocks dates in this out-of-order period.')}
              if(document.payload.status!=='active') {
                const stays=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'hotel-stay','payload.branchId':document.payload.branchId,'payload.status':{$in:['booked','checked-in']}}).toArray()
                if(stays.some(row=>(row.payload.roomId?row.payload.roomId===document.entityId:row.payload.roomName.toLocaleLowerCase()===document.payload.roomName.toLocaleLowerCase())&&row.payload.checkOut>hotelBusinessDate))throw new Error('This room has an active or upcoming stay.')
                const holds=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'hotel-room-block','payload.branchId':document.payload.branchId,'payload.status':'held'}).toArray()
                if(holds.some(row=>hotelRoomBlockActive(row.payload)&&row.payload.rooms.some(room=>room.roomId===document.entityId)&&row.payload.checkOut>hotelBusinessDate))throw new Error('This room has an active tentative hold.')
              }
            }
            if(document.payload.kind==='hotel-stay'&&document.payload.roomId&&['booked','checked-in'].includes(document.payload.status)){const roomDocument=documents.find(other=>other.entityType==='pos_record'&&other.entityId===document.payload.roomId&&other.payload.kind==='hotel-room'),room=roomDocument?.payload|| (await entityHeads.findOne({businessId,entityType:'pos_record',entityId:document.payload.roomId}))?.payload;if(room&&hotelRoomOutOfOrder(room,document.payload.checkIn,document.payload.checkOut))throw new Error('The room has a scheduled out-of-order period during those dates.')}
            if(document.payload.kind==='hotel-stay'&&current&&(document.payload.roomId!==current.payload.roomId||document.payload.roomName!==current.payload.roomName)){
              const groupReschedule=Boolean(document.payload.groupChangeId&&current.payload.groupId===document.payload.groupId&&current.payload.status==='booked'&&document.payload.status==='booked'),target=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:document.payload.roomId})
              if(!target||target.payload.kind!=='hotel-room'||target.payload.branchId!==document.payload.branchId||target.payload.roomName!==document.payload.roomName||target.payload.status!=='active'||Number(document.payload.guestCount||1)>Number(target.payload.maxGuests||2)||!groupReschedule&&(document.payload.status!=='checked-in'||(target.payload.housekeepingStatus||'ready')!=='ready'))throw new Error('A room change requires an active destination room with enough guest capacity; ordinary transfers also require readiness.')
              const changingIds=groupReschedule?documents.filter(other=>other.entityType==='pos_record'&&other.payload.kind==='hotel-stay'&&other.payload.groupId===document.payload.groupId&&other.payload.groupChangeId===document.payload.groupChangeId).map(other=>other.entityId):[document.entityId],stays=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'hotel-stay','payload.branchId':document.payload.branchId,'payload.status':{$in:['booked','checked-in']},entityId:{$nin:changingIds}}).toArray()
              if(stays.some(row=>(row.payload.roomId===document.payload.roomId||!row.payload.roomId&&row.payload.roomName.toLocaleLowerCase()===document.payload.roomName.toLocaleLowerCase())&&document.payload.checkIn<row.payload.checkOut&&document.payload.checkOut>row.payload.checkIn))throw new Error('The destination room has an overlapping stay.')
              const destinationHolds=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'hotel-room-block','payload.branchId':document.payload.branchId,'payload.status':'held'}).toArray()
              if(destinationHolds.some(row=>hotelRoomBlockActive(row.payload)&&row.payload.rooms.some(room=>room.roomId===document.payload.roomId)&&document.payload.checkIn<row.payload.checkOut&&document.payload.checkOut>row.payload.checkIn))throw new Error('The destination room is held for a tentative booking.')
              if((await hotelCalendarBlocks(businessId,document.payload.roomId)).some(stay=>document.payload.checkIn<stay.checkOut&&document.payload.checkOut>stay.checkIn))throw new Error('The destination room is blocked by a connected booking calendar.')
              if(!groupReschedule){const latestClose=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'hotel-day-close','payload.branchId':document.payload.branchId}).sort({'payload.businessDate':-1}).limit(1).toArray();if(latestClose.length&&latestClose[0].payload.businessDate>=hotelBusinessDate)throw new Error('A room transfer cannot be posted after today?s business date has closed.')}
            }
            if(document.payload.kind==='hotel-stay'&&document.payload.status==='booked') {
              const channelImported=document.payload.source==='channex'&&current?.payload.source==='channex'&&document.payload.channelBookingId===current.payload.channelBookingId
              if(!current){const closed=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'hotel-day-close','payload.branchId':document.payload.branchId}).sort({'payload.businessDate':-1}).limit(1).toArray();if(closed.length&&document.payload.checkIn<=closed[0].payload.businessDate)throw new Error('Bookings cannot start on or before the latest closed hotel business date.')}
              if(document.payload.roomId) {
                const room=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:document.payload.roomId})
                if(!room||room.payload.kind!=='hotel-room'||room.payload.branchId!==document.payload.branchId||room.payload.roomName!==document.payload.roomName||!channelImported&&Math.round(room.payload.nightlyRate*100)!==Math.round(document.payload.nightlyRate*100)||Number(document.payload.guestCount||1)>Number(room.payload.maxGuests||20)||!current&&room.payload.status!=='active')throw new Error('Choose an active registered room with the saved nightly rate and occupancy.')
                if(!channelImported&&!current&&!hotelRoomRestrictionsAllow(room.payload,document.payload.checkIn,document.payload.checkOut))throw new Error('The stay dates do not meet this room’s minimum, maximum, arrival, departure or stop-sell restrictions.')
                if(!channelImported&&!current&&document.payload.rateBreakdown&&JSON.stringify(hotelRateBreakdown(room.payload,document.payload.checkIn,document.payload.checkOut))!==JSON.stringify(document.payload.rateBreakdown))throw new Error('The saved hotel quote does not match the room rates for these dates. Refresh availability and create a new booking.')
                if(!channelImported&&!current&&document.payload.nightlyRates&&JSON.stringify(hotelNightlyRates(room.payload,document.payload.checkIn,document.payload.checkOut))!==JSON.stringify(document.payload.nightlyRates))throw new Error('The saved nightly rate schedule does not match the room rates. Refresh availability and create a new booking.')
                if(!channelImported&&!current&&document.payload.depositRequired!==undefined&&Number(document.payload.depositRequired)!==hotelDepositRequirement(room.payload,document.payload.checkIn,document.payload.checkOut))throw new Error('The saved reservation deposit does not match the room policy. Refresh availability and create a new booking.')
                if(!channelImported&&!current&&document.payload.depositRequired===undefined&&hotelDepositRequirement(room.payload,document.payload.checkIn,document.payload.checkOut)>0&&Date.parse(document.payload.createdAt)>=Date.parse(room.payload.updatedAt||''))throw new Error('Update this device before booking a room with a required deposit policy.')
              } else {
                const rooms=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'hotel-room','payload.branchId':document.payload.branchId}).toArray()
                if(rooms.length)throw new Error('Choose a room from the room register.')
              }
              const changingGroupIds=document.payload.groupChangeId?documents.filter(other=>other.entityType==='pos_record'&&other.payload.kind==='hotel-stay'&&other.payload.groupId===document.payload.groupId&&other.payload.groupChangeId===document.payload.groupChangeId).map(other=>other.entityId):[document.entityId],stays=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'hotel-stay','payload.branchId':document.payload.branchId,'payload.status':{$in:['booked','checked-in']},entityId:{$nin:changingGroupIds}}).toArray()
              if(stays.some(row=>(row.payload.roomId&&document.payload.roomId?row.payload.roomId===document.payload.roomId:row.payload.roomName.toLocaleLowerCase()===document.payload.roomName.toLocaleLowerCase())&&document.payload.checkIn<row.payload.checkOut&&document.payload.checkOut>row.payload.checkIn))throw new Error('That room already has an overlapping booking.')
              const conversion=document.payload.convertedFromBlockId&&documents.find(other=>other.entityType==='pos_record'&&other.entityId===document.payload.convertedFromBlockId&&other.payload.kind==='hotel-room-block'&&other.payload.status==='released'&&other.payload.convertedGroupId===document.payload.groupId),holds=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'hotel-room-block','payload.branchId':document.payload.branchId,'payload.status':'held'}).toArray()
              if(holds.some(row=>row.entityId!==conversion?.entityId&&hotelRoomBlockActive(row.payload)&&row.payload.rooms.some(room=>room.roomId===document.payload.roomId)&&document.payload.checkIn<row.payload.checkOut&&document.payload.checkOut>row.payload.checkIn)||documents.some(other=>other.entityType==='pos_record'&&other.payload.kind==='hotel-room-block'&&other.entityId!==document.payload.convertedFromBlockId&&other.payload.branchId===document.payload.branchId&&hotelRoomBlockActive(other.payload)&&other.payload.rooms.some(room=>room.roomId===document.payload.roomId)&&document.payload.checkIn<other.payload.checkOut&&document.payload.checkOut>other.payload.checkIn))throw new Error('That room is held for another tentative booking.')
              if(documents.some(other=>other.entityType==='pos_record'&&other.payload.kind==='hotel-stay'&&other.entityId!==document.entityId&&other.payload.branchId===document.payload.branchId&&['booked','checked-in'].includes(other.payload.status)&&(other.payload.roomId&&document.payload.roomId?other.payload.roomId===document.payload.roomId:other.payload.roomName.toLocaleLowerCase()===document.payload.roomName.toLocaleLowerCase())&&document.payload.checkIn<other.payload.checkOut&&document.payload.checkOut>other.payload.checkIn))throw new Error('Another booking in this sync batch already holds that room for overlapping dates.')
              if(!current&&(await hotelCalendarBlocks(businessId,document.payload.roomId)).some(stay=>stay.id!==`${document.payload.convertedFromBlockId}:${document.payload.roomId}`&&document.payload.checkIn<stay.checkOut&&document.payload.checkOut>stay.checkIn))throw new Error('That room has a reservation from a connected booking channel for those dates.')
            }
            if(document.payload.kind==='hotel-stay'&&document.payload.status==='checked-in'&&current?.payload.status!=='checked-in') {
              const room=document.payload.roomId?await entityHeads.findOne({businessId,entityType:'pos_record',entityId:document.payload.roomId}):await entityHeads.findOne({businessId,entityType:'pos_record','payload.kind':'hotel-room','payload.branchId':document.payload.branchId,'payload.roomName':document.payload.roomName})
              if(room&&(room.payload.kind!=='hotel-room'||room.payload.status!=='active'||(room.payload.housekeepingStatus||'ready')!=='ready'))throw new Error('The assigned room must be active and housekeeping must mark it ready before check-in.')
              const base=await entityHeads.findOne({businessId,entityType:'pos_record','payload.kind':'service-job','payload.hospitality.recordId':document.entityId,'payload.hospitality.chargeType':{$exists:false}})
              if(!base||['cancelled','estimate'].includes(base.payload.status))throw new Error('Issue the accommodation folio before checking in the guest.')
              const refunds=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'return','payload.saleId':{$in:(base.payload.payments||[]).map(entry=>entry.sale.id)}}).toArray(),paid=serviceJobBalance(base.payload,refunds.map(row=>row.payload)).paid,required=Number(current?.payload?.depositRequired||0);if(paid+0.005<required)throw new Error(`Collect the required reservation deposit of ${required.toFixed(2)} before check-in.`)
            }
            if(document.payload.kind==='hotel-stay'&&document.payload.status==='cancelled'&&current?.payload.status!=='cancelled'){
              if(current?.payload.status!=='booked')throw new Error('Only a booked stay can be cancelled.')
              const linked=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'service-job','payload.hospitality.recordId':document.entityId}).toArray()
              if(linked.some(job=>job.payload.status!=='cancelled'))throw new Error('Cancel or refund every linked folio before cancelling the stay.')
            }
            if(document.payload.kind==='hotel-stay'&&document.payload.status==='checked-out') {
              const linked=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'service-job','payload.hospitality.recordId':document.entityId}).toArray()
              const saleIds=linked.flatMap(row=>row.payload.payments.map(entry=>entry.sale.id))
              const refunds=saleIds.length?await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'return','payload.saleId':{$in:saleIds}}).toArray():[]
              const refundRows=refunds.map(row=>row.payload)
              const jobs=linked.map(row=>({...row.payload,balance:serviceJobBalance(row.payload,refundRows)})).sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt))
              const base=jobs.find(job=>!job.hospitality.chargeType)
              if(document.payload.nightlyRate>0&&(!base||base.status==='cancelled'||base.balance.due>0)||jobs.some(job=>job.status!=='cancelled'&&job.balance.due>0))throw new Error('Collect every stay charge before checking out.')
            }
            if(document.payload.kind==='nightclub-entry') {
              const event=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:document.payload.eventId})
              if(!event||event.payload.kind!=='nightclub-event'||event.payload.branchId!==document.payload.branchId||!['scheduled','closed'].includes(event.payload.status))throw new Error('Choose an event that is still open for guest check-in.')
              if(document.payload.status==='checked-in'&&!['scheduled','closed'].includes(event.payload.status))throw new Error('This event is cancelled or unavailable.')
              if(document.payload.status==='expected'&&event.payload.capacity) {
                const entries=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'nightclub-entry','payload.eventId':event.entityId,'payload.status':{$in:['expected','checked-in']},entityId:{$ne:document.entityId}}).toArray()
                const books=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'restaurant-reservations','payload.branchId':event.payload.branchId}).toArray(),reserved=books.flatMap(book=>book.payload.entries||[]).filter(entry=>entry.nightlifeEventId===event.entityId&&['confirmed','arrived','seated'].includes(entry.status)).reduce((sum,entry)=>sum+Number(entry.guests||0),0)
                if(entries.length+reserved>=event.payload.capacity)throw new Error('This event has reached its guest capacity.')
              }
            }
          } catch(error) { conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:error.message,localPayload:document.payload});continue }
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
          if(document.entityType==='customer' && current?.payload && document.payload.birthday===undefined)document.payload={...document.payload,birthday:current.payload.birthday||'',birthdayReminders:current.payload.birthdayReminders||false}
          if(document.entityType==='pos_record' && (document.payload.kind?.startsWith('restaurant-') || document.payload.kind==='service-job' || ['hotel-room','hotel-stay','hotel-room-block','hotel-journal-entry','hotel-day-close','venue-space','nightclub-event','nightclub-entry','nightclub-inquiry'].includes(document.payload.kind) || document.payload.kind==='register' || document.payload.kind==='product' && Boolean(document.payload.oilPricing) || document.payload.kind?.startsWith('church-') || ['restaurant-reservations','restaurant-reservation-archive'].includes(document.payload.kind) || isStockWork(document.payload)) && current?.operationId===document.operationId) {
            if(JSON.stringify(current.payload)!==JSON.stringify(document.payload)){conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:'This operation ID already has different details.'});continue}
            // Recover a response/database interruption between storing the
            // accepted head and appending its downloadable operation.
            try{await operations.insertOne(document)}catch(error){if(error.code!==11000)throw error}
            acceptedOperationIds.push(document.operationId);continue
          }
          if(document.entityType==='pos_record' && document.payload.kind==='restaurant-reservation-archive') {
            try {
              if(document.action!=='upsert'||document.entityId!==document.payload.id)throw new Error('Invalid reservation archive operation.')
              const book=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:reservationBookId(document.payload.branchId)})
              if(!book)throw new Error('Synchronize the reservation book before its archive.')
              validateReservationArchive(document.payload,book.payload,current?.payload)
            }catch(error){conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:error.message,localPayload:document.payload,remotePayload:current?.payload||{}});continue}
          }
          if(document.entityType==='pos_record' && document.payload.kind==='restaurant-reservations') {
            try {
              if(document.action!=='upsert' || document.entityId!==document.payload.id)throw new Error('Invalid reservation operation.')
              const layout=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:`restaurant-layout:${document.payload.branchId}`})
              const tabs=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'restaurant-tab','payload.branchId':document.payload.branchId}).toArray()
              const floor=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:floorId(document.payload.branchId)})
              const archives=document.payload.archiveIds?.length?await entityHeads.find({businessId,entityType:'pos_record',entityId:{$in:document.payload.archiveIds}}).toArray():[]
              const hotelStayRows=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'hotel-stay','payload.branchId':document.payload.branchId}).toArray()
              validateReservationBook(document.payload,current?.payload,false,layout?.payload||{tables:[]},restaurantTabs(tabs.map(row=>row.payload),floor?.payload),archives.map(row=>row.payload),hotelStayRows.map(row=>row.payload))
            }catch(error){conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:error.message,localPayload:document.payload,remotePayload:current?.payload||{}});continue}
          }
          if(document.entityType==='pos_record'&&document.payload.kind==='register'&&document.payload.tillId&&!document.payload.closedAt&&!current){const occupied=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:{$ne:document.entityId},'payload.kind':'register','payload.branchId':document.payload.branchId,'payload.tillId':document.payload.tillId,'payload.closedAt':{$exists:false}});if(occupied){conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:'Another staff shift is already open on this till. Review and close it before handover.',localPayload:document.payload,remotePayload:occupied.payload});continue}}
          if(document.entityType==='pos_record' && document.payload.kind==='product' && document.payload.oilPricing){try{oilPricing(document.payload.oilPricing)}catch(error){conflicts.push({operationId:document.operationId,reason:error.message});continue}}
          if(document.entityType==='pos_record' && document.payload.kind?.startsWith('church-')) {
            try{if(document.entityId!==document.payload.id||document.action!=='upsert')throw new Error('Invalid church record operation.');validateChurchRecord(document.payload,current?.payload)}catch(error){conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:error.message,localPayload:document.payload,remotePayload:current?.payload||{}});continue}
          }
          if(document.entityType==='pos_record' && document.payload.kind==='service-job') {
            if(document.payload.hospitality?.restaurantBill){try{const bill=document.payload.hospitality.restaurantBill,tabHead=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:bill.tabId}),tab=tabHead?.payload,stayId=document.payload.hospitality.recordId;if(!tab||tab.kind!=='restaurant-tab'||tab.branchId!==document.payload.branchId||tab.status!=='open'||tab.sessionId!==bill.sessionId||tab.hotelStayId!==stayId||document.payload.hospitality.folioId!==bill.folioId)throw new Error('The restaurant bill is no longer linked to this checked-in hotel stay and folio.');const orders=(await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'counter-order','payload.branchId':tab.branchId}).toArray()).map(row=>row.payload),sales=(await operations.find({businessId,entityType:'sale','payload.branchId':tab.branchId}).toArray()).map(row=>row.payload),portion=restaurantPortion(tab,orders,sales,bill.selections,{allowMultipleCustomers:true});if(JSON.stringify(portion.parts)!==JSON.stringify(bill.selections)||Math.abs(portion.pricing.total-document.payload.pricing.total)>0.005||Math.abs(portion.pricing.tax-document.payload.pricing.tax)>0.005)throw new Error('The hotel folio invoice does not match the restaurant items, tax and total.');const linkedStay=stagedHotelStays.get(stayId)||((await entityHeads.findOne({businessId,entityType:'pos_record',entityId:stayId}))?.payload);if(!linkedStay||linkedStay.kind!=='hotel-stay'||linkedStay.branchId!==tab.branchId||linkedStay.status!=='checked-in')throw new Error('The linked hotel stay must remain checked in.');const otherJobs=(await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'service-job','payload.branchId':tab.branchId,entityId:{$ne:document.entityId}}).toArray()).map(row=>row.payload);if(otherJobs.some(job=>job.status!=='cancelled'&&job.hospitality?.restaurantBill?.tabId===tab.id&&job.hospitality.restaurantBill.sessionId===tab.sessionId&&job.hospitality.restaurantBill.selections.some(part=>bill.selections.some(selected=>selected.orderId===part.orderId&&selected.lineId===part.lineId))))throw new Error('Some restaurant bill items already have a hotel folio invoice.');const actorId=document.payload.staffId;if(actorId&&ObjectId.isValid(actorId)){const actor=await accounts.findOne({_id:new ObjectId(actorId),businessId,removedAt:{$exists:false}});if(actor&&!hasPermission(actor,'hotelOperations'))throw new Error('Hotel operations permission is required to charge restaurant bills to a room.')}}catch(error){conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:error.message,localPayload:document.payload,remotePayload:current?.payload||{}});continue}}
            try { if(document.entityId!==document.payload.id || document.action!=='upsert')throw new Error('Invalid service job operation.');if(document.payload.church&&!current){const link=document.payload.church;for(const [id,kind,name,phone] of [[link.fundId,'church-fund',link.fundName,''],...(link.donorId?[[link.donorId,'church-donor',link.donorName,link.donorPhone]]:[])]){const identity=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:id});if(!identity||identity.payload.kind!==kind||identity.payload.branchId!==document.payload.branchId||identity.payload.name!==name||identity.payload.phone!==phone||identity.payload.status==='archived'&&Date.parse(identity.payload.updatedAt)<=Date.parse(document.payload.createdAt))throw new Error('Synchronize matching active funds and donors before new contributions.')}}if(document.payload.hospitality){const linked=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:document.payload.hospitality.recordId}),linkedPayload=stagedHotelStays.get(document.payload.hospitality.recordId)||linked?.payload;validateHospitalityInvoice(document.payload,linkedPayload);if(!current&&document.payload.hospitality.chargeType==='extra'&&linkedPayload?.status!=='checked-in')throw new Error('Add guest folio charges while the guest is checked in.');if(document.payload.hospitality.recordKind==='nightclub-entry'){const event=linkedPayload?.eventId&&await entityHeads.findOne({businessId,entityType:'pos_record',entityId:linkedPayload.eventId});if(!event||event.payload.kind!=='nightclub-event'||event.payload.status==='cancelled')throw new Error('The linked nightclub event is unavailable.')}if(document.payload.hospitality.chargeType!=='extra'){const other=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:{$ne:document.entityId},'payload.kind':'service-job','payload.status':{$ne:'cancelled'},'payload.hospitality.recordId':document.payload.hospitality.recordId,'payload.hospitality.chargeType':{$exists:false}});if(other)throw new Error('This stay or admission already has an active invoice.')}}const refunds=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'return','payload.saleId':{$in:(current?.payload?.payments||[]).map(entry=>entry.sale.id)}}).toArray();validateServiceJob(document.payload,current?.payload,false,refunds.map(row=>row.payload));for(const entry of document.payload.payments){recordPayment(entry.sale,entry.sale.paymentDetails?.policy);if(await entityHeads.findOne({businessId,entityType:'pos_record',entityId:{$ne:document.entityId},'payload.kind':'service-job','payload.payments.sale.id':entry.sale.id}))throw new Error('This payment ID is already used by another job.')} }
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
              if(document.payload.command.action==='move') {
                const book=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:reservationBookId(document.payload.branchId)})
                const source=restaurantTabs(tabs.map(row=>row.payload),current?.payload).find(tab=>tab.id===document.payload.command.tabId&&tab.sessionId===document.payload.command.sessionId)
                if(source?.displayTableId!==document.payload.command.tableId)checkReservationOpening(book?.payload,{},document.payload.command.tableId,source?.guests||1,document.payload.updatedAt)
              }

            }catch(error){conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:error.message,localPayload:document.payload,remotePayload:current?.payload||{}});continue}
          }
          if(document.entityType==='pos_record' && document.payload.kind==='restaurant-ledger') {
            try {
              if(document.action!=='upsert' || document.entityId!==document.payload.id) throw new Error('Invalid bill payment allocation.')
              const tab=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:document.payload.tabId})
              const orders=await entityHeads.find({businessId,entityType:'pos_record','payload.kind':'counter-order','payload.branchId':document.payload.branchId}).toArray()
              const legacy=await operations.find({businessId,entityType:'sale',entityId:{$in:orders.map(row=>`counter-payment:${row.entityId}`)}}).toArray()
              recordPayment(document.payload.latestSale,document.payload.latestSale.paymentDetails?.policy)
              const effective=tab&&restaurantTabs([tab.payload],restaurantFloor?.payload)[0]
              await validateRestaurantLedger(document.payload,current?.payload,effective,orders.map(row=>row.payload).filter(order=>effective&&billContains(effective,order)),legacy.map(row=>row.payload))
            }catch(error){conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:error.message,localPayload:document.payload,remotePayload:current?.payload||{}});continue}
          }
          if (document.entityType === 'pos_record' && ['restaurant-layout','restaurant-tab'].includes(document.payload.kind)) {
            try {
              if(document.entityId !== document.payload.id || document.action !== 'upsert') throw new Error('Invalid restaurant operation.')
              validateRestaurantRecord(document.payload,current?.payload)
              if(document.payload.kind==='restaurant-tab'){
                const oldCharges=current?.payload?.roomCharges||[],nextCharges=document.payload.roomCharges||[]
                if(nextCharges.length>oldCharges.length){const charge=nextCharges.at(-1),invoiceHead=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:charge.invoiceId}),invoice=invoiceHead?.payload||documents.find(other=>other.entityType==='pos_record'&&other.entityId===charge.invoiceId)?.payload,bill=invoice?.hospitality?.restaurantBill;if(!invoice||invoice.kind!=='service-job'||invoice.status==='cancelled'||invoice.branchId!==document.payload.branchId||invoice.hospitality?.recordId!==document.payload.hotelStayId||invoice.hospitality?.folioId!==charge.folioId||bill?.tabId!==document.payload.id||bill?.sessionId!==document.payload.sessionId||JSON.stringify(bill.selections)!==JSON.stringify(charge.selections)||Math.abs(Number(invoice.pricing?.total)-Number(charge.total))>0.005)throw new Error('Synchronize the matching active hotel folio invoice before transferring this restaurant bill.');const actorId=document.payload.staffId;if(actorId&&ObjectId.isValid(actorId)){const actor=await accounts.findOne({_id:new ObjectId(actorId),businessId,removedAt:{$exists:false}});if(actor&&(!hasPermission(actor,'hotelOperations')||!hasPermission(actor,'serviceJobs')||!hasPermission(actor,'restaurant')))throw new Error('Hotel operations, Jobs & invoices and restaurant permissions are required for a folio transfer.')}}
              }
              if(document.payload.kind==='restaurant-tab' && document.payload.status==='open' && (!current || current.payload.sessionId!==document.payload.sessionId)){const duplicate=await entityHeads.findOne({businessId,entityType:'pos_record','payload.kind':'restaurant-tab',$or:[{'payload.sessionId':document.payload.sessionId},{'payload.history.sessionId':document.payload.sessionId}]});if(duplicate)throw new Error('Use a new unique bill session.')}

              const bookingHead=await entityHeads.findOne({businessId,entityType:'pos_record',entityId:reservationBookId(document.payload.branchId)})
              if(document.payload.kind==='restaurant-tab' && document.payload.status==='open' && (!current || current.payload.sessionId!==document.payload.sessionId)){const reservation=checkReservationOpening(bookingHead?.payload,document.payload,document.payload.tableId,document.payload.guests,document.payload.openedAt);if((reservation?.hotelStayId||'')!==(document.payload.hotelStayId||''))throw new Error('The bill must preserve the hotel stay linked to its reservation.')}
              if(document.payload.kind === 'restaurant-layout') {
                for(const row of bookingHead?.payload.entries||[])if(['confirmed','arrived'].includes(row.status)&&row.tableId&&Date.parse(row.endAt)>Date.parse(document.payload.updatedAt)){const before=current?.payload.tables.find(table=>table.id===row.tableId),after=document.payload.tables.find(table=>table.id===row.tableId);if(!after||JSON.stringify(before)!==JSON.stringify(after))throw new Error('Reschedule or cancel upcoming reservations before changing their table.')}
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
          if(document.entityType==='pos_record' && isStockWork(document.payload)) {
            try {
              if(document.action!=='upsert' || document.entityId!==document.payload.id)throw new Error('Invalid stock work operation.')
              const job=document.payload.kind==='service-materials'?await entityHeads.findOne({businessId,entityType:'pos_record',entityId:document.payload.jobId}):null
              if(document.payload.kind==='service-materials' && !job)throw new Error('Synchronize the issued job before its materials.')
              validateStockWork(document.payload,current?.payload,job?.payload)
            }catch(error){conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:error.message,localPayload:document.payload,remotePayload:current?.payload||{}});continue}
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
              if (document.payload.kind === 'counter-order' && document.payload.status === 'cancelled' && current?.payload?.source === 'customer-portal' && await database.collection('customer_paystack_sessions').findOne({ businessId, purpose: 'order', targetId: document.entityId, status: { $in: ['initializing', 'initialized', 'uncertain', 'needs-review'] } })) throw new Error('Resolve the active Paystack checkout before cancelling this order.')
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
              if (document.payload.kind === 'counter-order' && (document.payload.status === 'collected' || document.payload.action === 'delivery' && document.payload.deliveryAction === 'dispatch') && !document.payload.tableService && !await operations.findOne({ businessId, entityType: 'sale', entityId: `counter-payment:${document.entityId}` })) throw new Error('Synchronize the order payment before handover or delivery dispatch.')
            } catch (error) { conflicts.push({ operationId: document.operationId, entityType: document.entityType, entityId: document.entityId, reason: error.message, localPayload: document.payload, remotePayload: current?.payload || {} }); continue }
          }
          if(document.entityType==='customer' && document.payload.birthday!==undefined){try{birthdayValue(document.payload.birthday)}catch(error){conflicts.push({operationId:document.operationId,reason:error.message});continue}}
          if (document.entityType === 'product') {
            const barcodeValues = equivalentProductBarcodes(document.payload.barcode)
            const previousBarcodeIdentity = canonicalProductBarcode(current?.payload?.barcode) || String(current?.payload?.barcode || '').trim().toLocaleLowerCase()
            const nextBarcodeIdentity = canonicalProductBarcode(document.payload.barcode) || String(document.payload.barcode || '').trim().toLocaleLowerCase()
            if (barcodeValues.length && previousBarcodeIdentity !== nextBarcodeIdentity) {
              const duplicate = await entityHeads.findOne({ businessId, entityType: 'product', entityId: { $ne: document.entityId }, 'payload.barcode': { $in: barcodeValues } })
              if (duplicate) { conflicts.push({ operationId: document.operationId, entityType: document.entityType, entityId: document.entityId, reason: 'This barcode is already assigned to another product in this business.', localPayload: document.payload, remotePayload: duplicate.payload }); continue }
            }
            try { document.payload.customValues = { ...readCustomValues(current?.payload?.customValues), ...readCustomValues(document.payload.customValues) } }
            catch { conflicts.push({ operationId: document.operationId, entityType: document.entityType, entityId: document.entityId, reason: 'Invalid custom product details.' }); continue }
          }
          if(document.entityType==='pos_record' && document.payload.expectedUpdatedAt!==undefined && document.payload.expectedUpdatedAt!==(current?.payload?.updatedAt||'')){
            conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:'This record was changed on another till. Refresh and review the other version.',localPayload:document.payload,remotePayload:current?.payload||{}});continue
          }
          if (!isNewerMutableOperation(document, current)) {
            if (identicalSettings(document,current)) { if(document.entityType==='pos_record'&&['hotel-room','hotel-stay','hotel-room-block'].includes(document.payload.kind))await channexBookingSync.enqueueAriChange(businessId,document.payload.branchId,current?.payload||null,document.payload); acceptedOperationIds.push(document.operationId); continue }
            conflicts.push({ operationId: document.operationId, entityType: document.entityType, entityId: document.entityId, reason: 'A newer version of this record was saved on another device.', localPayload: document.payload, remotePayload: current.payload })
            continue
          }
          try {
            const guarded=document.entityType==='pos_record' && document.payload.expectedUpdatedAt!==undefined
            const result=await entityHeads.updateOne(guarded && current?{...filter,operationId:current.operationId}:filter,{ $set: { updatedAt: operationUpdatedAt(document), payload: document.payload, operationId: document.operationId, deviceId, receivedAt: new Date() } },{upsert:guarded?!current:true})
            if(guarded && current && !result.matchedCount){conflicts.push({operationId:document.operationId,entityType:document.entityType,entityId:document.entityId,reason:'A concurrent till edit won. Refresh this record.'});continue}
            if(document.entityType==='pos_record'&&['hotel-room','hotel-stay','hotel-room-block'].includes(document.payload.kind))await channexBookingSync.enqueueAriChange(businessId,document.payload.branchId,current?.payload||null,document.payload)
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
            await queueProductCatalogueContribution(businessId, document)
            acceptedOperationIds.push(document.operationId); continue
          }
          throw error
        }
        try { await processInventoryNotification(document) } catch (error) { console.error('Inventory notification processing failed.', error instanceof Error ? error.message : 'Unknown error.') }
        await queueProductCatalogueContribution(businessId, document)
        if (document.entityType === 'settings' && document.action === 'upsert' && document.payload?.appName && document.payload?.currency) {
          await businessSettings.updateOne({ businessId }, { $set: { businessId, settings: document.payload, ...(document.payload.catalogueContributionMode ? { catalogueContributionMode: document.payload.catalogueContributionMode } : {}), updatedAt: operationUpdatedAt(document), receivedAt: new Date() } }, { upsert: true })
        }
        if(document.entityType==='pos_record'&&document.payload.kind==='hotel-stay')stagedHotelStays.set(document.entityId,document.payload)
        acceptedOperationIds.push(document.operationId)
      }
      await processSharedProductContributionQueue(sharedProductCatalogueQueue, sharedProductCatalogue, businessId)
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
      if(query.get('retailOrderCapability')!=='retail-orders-v1' && rows.some(row=>row.payload?.retailOrder||row.payload?.paymentDetails?.counterOrder?.retailOrder))return send(response,426,{error:'Update this device to process retail online orders safely.'})
      if (query.get('customerOrderCapability') !== 'customer-orders-v1' && rows.some(row => row.payload?.source === 'customer-portal')) return send(response, 426, { error: 'Update this device to safely accept and process online customer orders.' })
      if (query.get('staffCapability') !== 'staff-removal-v1' && rows.some(row => row.entityType === 'staff_removal')) return send(response, 426, { error: 'Update this device to apply staff access removals.' })
      if(query.get('churchCapability')!=='church-collections-v1' && rows.some(requiresChurchSync))return send(response,426,{error:'Update this device to synchronize funds, donors and contributions.'})
      if(query.get('reservationCapability')!=='restaurant-reservations-v1' && rows.some(requiresReservationSync))return send(response,426,{error:'Update this device to synchronize restaurant reservations and their bills.'})
      if(query.get('hospitalityCapability')!=='hospitality-operations-v1' && rows.some(requiresHospitalitySync))return send(response,426,{error:'Update this device to apply hotel and nightlife operations and their invoices.'})
      if(query.get('stockWorkCapability')!=='stock-work-v1' && rows.some(row=>row.entityType==='pos_record' && isStockWork(row.payload)))return send(response,426,{error:'Update this device to synchronize material use and food production batches.'})
      if(query.get('serviceJobWalletCapability')!=='service-jobs-wallet-v1'&&rows.some(row=>row.payload?.kind==='service-job'&&row.payload.payments?.some(entry=>entry.sale.paymentMethod==='wallet')))return send(response,426,{error:'Update this device to apply wallet invoice payments.'})
      if(query.get('serviceJobCapability')!=='service-jobs-v1' && rows.some(requiresServiceJobSync)) return send(response,426,{error:'Update this device to synchronize service jobs and invoice payments.'})
      if (query.get('restaurantCapability') !== 'restaurant-v2' && rows.some(row=>['restaurant-layout','restaurant-tab','restaurant-ledger','restaurant-floor'].includes(row.payload?.kind) || row.payload?.restaurantOrder || row.payload?.paymentDetails?.restaurantBill || row.payload?.id === 'restaurant-menu' || row.payload?.tableService || row.payload?.paymentDetails?.counterOrder?.tableService || row.payload?.shopProfile?.restaurant || row.payload?.shopProfile?.workflows === 'restaurant')) return send(response,426,{error:'Update this device to synchronize Restaurant & bar tables, bills and orders.'})
      if (query.get('capabilities') !== 'counter-v3' && rows.some(row => ['counter-menu', 'counter-order', 'counter-consumption'].includes(row.payload?.kind) || row.payload?.paymentDetails?.counterOrder || row.payload?.shopProfile?.fastFood || row.payload?.shopProfile?.workflows === 'fast-food')) return send(response, 426, { error: 'Update this device to synchronize Fast food orders and payments.' })
      if (!['retail-v3', 'business-v4'].includes(query.get('protocol')) && rows.some(row => row.entityType === 'retail_record' || row.payload?.stockEvent || row.payload?.counts?.some(count=>count.stockEvent) || row.payload?.batchAllocations || row.payload?.items?.some(item=>item.batchAllocations))) return send(response, 426, { error: 'Update this device to synchronize supermarket stock and financial records.' })
      const staffAccess=await accounts.find({businessId,role:{$in:['admin','cashier']},removedAt:{$exists:false}}).toArray()
      if(staffAccess.some(account=>account.permissions)&&query.get('staffPermissionsCapability')!=='staff-permissions-v1')return send(response,426,{error:'Update this device to apply individual staff permissions.'})
      await processSharedProductContributionQueue(sharedProductCatalogueQueue, sharedProductCatalogue, businessId)
      return send(response, 200, { staffAccess:staffAccess.map(account=>({id:account._id.toString(),role:account.role,permissions:parsePermissions(account.permissions),operationalAccess:Boolean(account.operationalAccess)})), operations: rows.map(({ _id, ...operation }) => ({ ...operation, operationId: operation.operationId })), cursor: rows.length ? rows.at(-1)._id.toString() : cursor })
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
  void checkMailAuthorization().then(result=>console.info('Mail authorization:',JSON.stringify(result)))
})
