import { createServer } from 'node:http'
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { MongoClient, ObjectId } from 'mongodb'
import { isNewerMutableOperation, mutableEntities, operationUpdatedAt } from './conflict-policy.mjs'
import { sendPasswordReset } from './mailer.mjs'
import { corsHeadersFor } from './cors.mjs'
import { createSubscriptions } from './subscriptions.mjs'

const port = Number(process.env.PORT || 8080)
const uri = process.env.MONGODB_URI
const jwtSecret = process.env.JWT_SECRET
const adminApiKey = process.env.ADMIN_API_KEY
if (!uri || !jwtSecret || !adminApiKey) throw new Error('MONGODB_URI, JWT_SECRET, and ADMIN_API_KEY are required for the cloud sync API.')

const client = new MongoClient(uri)
await client.connect()
const database = client.db(process.env.MONGODB_DATABASE || 'stockroom_sync')
const operations = database.collection('sync_operations')
const entityHeads = database.collection('sync_entity_heads')
const businessSettings = database.collection('business_settings')
const accounts = database.collection('accounts')
const devices = database.collection('devices')
const passwordResets = database.collection('password_resets')
await operations.createIndex({ businessId: 1, operationId: 1 }, { unique: true })
await operations.createIndex({ businessId: 1, _id: 1 })
await entityHeads.createIndex({ businessId: 1, entityType: 1, entityId: 1 }, { unique: true })
await businessSettings.createIndex({ businessId: 1 }, { unique: true })
// Staff email is optional contact data. Convert the original mandatory unique
// index once so several staff accounts can omit it.
await accounts.dropIndex('email_1').catch((error) => { if (error?.codeName !== 'IndexNotFound') throw error })
await accounts.createIndex({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } })
// A business has one owner and can have many staff. Older deployments created
// this index as unique, which silently limited every business to one account
// and surfaced as a misleading email/username collision on staff creation.
await accounts.dropIndex('businessId_1').catch((error) => { if (error?.codeName !== 'IndexNotFound') throw error })
await accounts.createIndex({ businessId: 1 })
await accounts.createIndex({ businessId: 1, username: 1 }, { unique: true, partialFilterExpression: { username: { $type: 'string' } } })
await devices.createIndex({ businessId: 1, deviceId: 1 }, { unique: true })
await passwordResets.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })

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
function accessToken(account) { return signToken({ kind: 'access', businessId: account.businessId, email: account.email || '', username: account.username || '', role: account.role || 'owner', operationalAccess: Boolean(account.operationalAccess), exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8 }) }
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
function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
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

const subscriptionHandler = await createSubscriptions({ database, accounts, verifyToken, send })
const server = createServer(async (request, response) => {
  const corsHeaders = corsHeadersFor(request.headers.origin, process.env.PWA_ALLOWED_ORIGINS)
  for (const [name, value] of Object.entries(corsHeaders)) response.setHeader(name, value)
  if (request.method === 'OPTIONS') { response.writeHead(204, corsHeaders); return response.end() }
  if (request.method === 'GET' && request.url === '/health') return send(response, 200, { ok: true })
  try {
    if (await subscriptionHandler(request, response)) return
    if (request.method === 'POST' && request.url === '/v1/auth/register') {
      const input = await readJson(request)
      const businessId = String(input.businessId || '').trim()
      const ownerName = String(input.ownerName || '').trim()
      const email = String(input.email || '').trim().toLowerCase()
      const password = String(input.password || '')
      if (!/^[a-z0-9][a-z0-9-]{2,80}$/i.test(businessId) || !ownerName || !/^\S+@\S+\.\S+$/.test(email) || password.length < 10) return send(response, 400, { error: 'Provide a valid business ID, owner name, email, and password of at least 10 characters.' })
      const account = { businessId, ownerName, name: ownerName, email, role: 'owner', passwordHash: hashPassword(password), createdAt: new Date() }
      try { const created = await accounts.insertOne(account); account._id = created.insertedId } catch (error) { if (error?.code === 11000) return send(response, 409, { error: 'That business ID or email already exists.' }); throw error }
      return send(response, 201, { account: publicAccount(account), accessToken: accessToken(account) })
    }
    if (request.method === 'POST' && request.url === '/v1/auth/login') {
      const input = await readJson(request)
      const email = String(input.email || '').trim().toLowerCase()
      const staffUsername = username(input.username)
      if ((email && staffUsername) || (!email && !staffUsername)) return send(response, 400, { error: 'Use an owner email or staff username.' })
      const account = email ? await accounts.findOne({ email, role: 'owner' }) : await accounts.findOne({ username: staffUsername, role: { $in: ['admin', 'cashier'] } })
      if (!account || !matchesPassword(String(input.password || ''), account.passwordHash)) return send(response, 401, { error: 'Username or password is incorrect.' })
      return send(response, 200, { account: publicAccount(account), accessToken: accessToken(account) })
    }
    if (request.method === 'GET' && request.url === '/v1/auth/me') {
      const claims = verifyToken(request)
      if (!isAccess(claims)) return send(response, 401, { error: 'Owner or staff access token required.' })
      const account = claims.role === 'owner'
        ? await accounts.findOne({ businessId: claims.businessId, email: claims.email, role: 'owner' })
        : await accounts.findOne({ businessId: claims.businessId, username: claims.username, role: { $in: ['admin', 'cashier'] } })
      if (!account) return send(response, 401, { error: 'Account not found.' })
      return send(response, 200, { account: publicAccount(account) })
    }
    if (request.method === 'POST' && request.url === '/v1/auth/password-reset/request') {
      const input = await readJson(request)
      const account = await accounts.findOne({ email: String(input.email || '').trim().toLowerCase() })
      // Always return the same response so email addresses cannot be discovered.
      // Staff accounts deliberately cannot recover access from their own email.
      // Only the business owner's recovery address is an account-control channel.
      if (!account || account.role !== 'owner') return send(response, 202, { ok: true })
      const rawToken = randomBytes(32).toString('base64url')
      await passwordResets.insertOne({ accountId: account._id, tokenHash: createHmac('sha256', jwtSecret).update(rawToken).digest('hex'), expiresAt: new Date(Date.now() + 30 * 60_000), usedAt: null })
      // Configure an email provider webhook outside this code. In non-production
      // development only, return the token to permit end-to-end testing.
      const delivered = await sendPasswordReset({ to: account.email, token: rawToken }).catch(() => false)
      const responseBody = { ok: true, delivered, ...(process.env.NODE_ENV !== 'production' ? { resetToken: rawToken } : {}) }
      return send(response, 202, responseBody)
    }
    if (request.method === 'POST' && request.url === '/v1/auth/password-reset/confirm') {
      const input = await readJson(request)
      const password = String(input.password || '')
      if (password.length < 10) return send(response, 400, { error: 'Password must be at least 10 characters.' })
      const tokenHash = createHmac('sha256', jwtSecret).update(String(input.token || '')).digest('hex')
      const reset = await passwordResets.findOneAndUpdate({ tokenHash, usedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } }, { returnDocument: 'after' })
      if (!reset) return send(response, 400, { error: 'The reset link is invalid or has expired.' })
      const account = await accounts.findOneAndUpdate({ _id: reset.accountId, role: 'owner' }, { $set: { passwordHash: hashPassword(password), passwordChangedAt: new Date() } }, { returnDocument: 'after' })
      if (!account) return send(response, 400, { error: 'Only an owner password can be reset by email.' })
      await devices.updateMany({ businessId: account.businessId }, { $set: { revokedAt: new Date(), revokeReason: 'Owner password reset' } })
      return send(response, 200, { account: publicAccount(account), accessToken: accessToken(account), message: 'Password updated. Re-enroll each device.' })
    }
    if (request.method === 'POST' && request.url === '/v1/admin/devices') {
      if (request.headers['x-admin-key'] !== adminApiKey) return send(response, 401, { error: 'Unauthorized.' })
      const input = await readJson(request)
      const businessId = String(input.businessId || '')
      const deviceId = String(input.deviceId || '')
      if (!businessId || !deviceId) return send(response, 400, { error: 'businessId and deviceId are required.' })
      const expiresInDays = Math.min(Math.max(Number(input.expiresInDays) || 365, 1), 730)
      await devices.updateOne({ businessId, deviceId }, { $set: { businessId, deviceId, label: String(input.label || deviceId), enrolledAt: new Date(), revokedAt: null } }, { upsert: true })
      const token = deviceToken(businessId, deviceId)
      return send(response, 201, { businessId, deviceId, deviceToken: token, expiresInDays })
    }
    const claims = verifyToken(request)
    if (!claims) return send(response, 401, { error: 'Unauthorized.' })
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
      if (!isAccess(claims)) return send(response, 403, { error: 'Owner access token required.' })
      const input = await readJson(request)
      const deviceId = String(input.deviceId || '').trim()
      if (!/^[a-z0-9][a-z0-9-]{2,100}$/i.test(deviceId)) return send(response, 400, { error: 'A valid device ID is required.' })
      await devices.updateOne({ businessId: claims.businessId, deviceId }, { $set: { businessId: claims.businessId, deviceId, label: String(input.label || deviceId), enrolledAt: new Date(), revokedAt: null, revokeReason: null } }, { upsert: true })
      return send(response, 201, { businessId: claims.businessId, deviceId, deviceToken: deviceToken(claims.businessId, deviceId) })
    }
    if (request.method === 'POST' && request.url === '/v1/staff') {
      if (!isAccess(claims) || claims.role !== 'owner') return send(response, 403, { error: 'Owner access token required.' })
      const input = await readJson(request)
      const name = String(input.name || '').trim(); const email = String(input.email || '').trim().toLowerCase(); const staffUsername = username(input.username); const password = String(input.password || ''); const role = String(input.role || '')
      if (!name || (email && !/^\S+@\S+\.\S+$/.test(email)) || !validUsername(staffUsername) || password.length < 10 || !['admin', 'cashier'].includes(role)) return send(response, 400, { error: 'Provide valid staff details, a 3–32 character username, and a 10-character password.' })
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
      return send(response, 200, { users: staff.map((account) => ({ ...publicAccount(account), createdAt: account.createdAt })) })
    }
    const accessMatch = request.url?.match(/^\/v1\/staff\/([^/]+)\/operational-access$/)
    if (request.method === 'PUT' && accessMatch) {
      if (!isAccess(claims) || claims.role !== 'owner') return send(response, 403, { error: 'Owner access token required.' })
      if (!ObjectId.isValid(accessMatch[1])) return send(response, 400, { error: 'Invalid staff account.' })
      const input = await readJson(request)
      const updated = await accounts.findOneAndUpdate({ _id: new ObjectId(accessMatch[1]), businessId: claims.businessId, role: 'cashier' }, { $set: { operationalAccess: input.enabled === true } }, { returnDocument: 'after' })
      if (!updated) return send(response, 404, { error: 'Cashier account not found.' })
      return send(response, 200, { account: publicAccount(updated) })
    }
    const passwordMatch = request.url?.match(/^\/v1\/staff\/([^/]+)\/password$/)
    if (request.method === 'PUT' && passwordMatch) {
      if (!isAccess(claims) || claims.role !== 'owner') return send(response, 403, { error: 'Owner access token required.' })
      if (!ObjectId.isValid(passwordMatch[1])) return send(response, 400, { error: 'Invalid staff account.' })
      const input = await readJson(request)
      const password = String(input.password || '')
      if (password.length < 10) return send(response, 400, { error: 'Password must be at least 10 characters.' })
      const updated = await accounts.findOneAndUpdate({ _id: new ObjectId(passwordMatch[1]), businessId: claims.businessId, role: 'cashier' }, { $set: { passwordHash: hashPassword(password), passwordChangedAt: new Date() } }, { returnDocument: 'after' })
      if (!updated) return send(response, 404, { error: 'Cashier account not found.' })
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
    const device = await devices.findOne({ businessId: claims.businessId, deviceId: claims.deviceId })
    if (!device || device.revokedAt) return send(response, 401, { error: 'This device has been revoked.' })
    if (request.method === 'POST' && request.url === '/v1/sync/push') {
      const input = await readJson(request)
      const businessId = String(input.businessId || '')
      const deviceId = String(input.deviceId || '')
      const incoming = Array.isArray(input.operations) ? input.operations.slice(0, 500) : []
      if (!businessId || !deviceId || !incoming.length || claims.businessId !== businessId || claims.deviceId !== deviceId) return send(response, 403, { error: 'Token does not authorize this business/device.' })
      const documents = incoming.map((operation) => ({ businessId, deviceId, operationId: String(operation.operationId), entityType: String(operation.entityType), entityId: String(operation.entityId), action: String(operation.action), payload: operation.payload || {}, createdAt: operation.createdAt || new Date().toISOString(), receivedAt: new Date() }))
      const acceptedOperationIds = []
      const conflicts = []
      for (const document of documents) {
        // Retries are normal after an interrupted response. They are successful
        // no-ops, never conflicts and never duplicate financial events.
        if (await operations.findOne({ businessId, operationId: document.operationId }, { projection: { _id: 1 } })) {
          acceptedOperationIds.push(document.operationId)
          continue
        }
        if (mutableEntities.has(document.entityType)) {
          const filter = { businessId, entityType: document.entityType, entityId: document.entityId }
          const current = await entityHeads.findOne(filter)
          if (!isNewerMutableOperation(document, current)) {
            conflicts.push({ operationId: document.operationId, entityType: document.entityType, entityId: document.entityId, reason: 'A newer version of this record was saved on another device.', localPayload: document.payload, remotePayload: current.payload })
            continue
          }
          await entityHeads.updateOne(filter, { $set: { updatedAt: operationUpdatedAt(document), payload: document.payload, operationId: document.operationId, deviceId, receivedAt: new Date() } }, { upsert: true })
        }
        await operations.updateOne({ businessId, operationId: document.operationId }, { $setOnInsert: document }, { upsert: true })
        if (document.entityType === 'settings' && document.action === 'upsert' && document.payload?.appName && document.payload?.currency) {
          await businessSettings.updateOne({ businessId }, { $set: { businessId, settings: document.payload, updatedAt: operationUpdatedAt(document), receivedAt: new Date() } }, { upsert: true })
        }
        acceptedOperationIds.push(document.operationId)
      }
      return send(response, 200, { acceptedOperationIds, conflicts })
    }
    if (request.method === 'GET' && request.url?.startsWith('/v1/sync/pull')) {
      const query = new URL(request.url, `http://${request.headers.host}`).searchParams
      const businessId = query.get('businessId') || ''
      const deviceId = query.get('deviceId') || ''
      const cursor = query.get('cursor') || ''
      if (!businessId || !deviceId || claims.businessId !== businessId || claims.deviceId !== deviceId) return send(response, 403, { error: 'Token does not authorize this business/device.' })
      const filter = { businessId, deviceId: { $ne: deviceId }, ...(ObjectId.isValid(cursor) ? { _id: { $gt: new ObjectId(cursor) } } : {}) }
      const rows = await operations.find(filter).sort({ _id: 1 }).limit(500).toArray()
      return send(response, 200, { operations: rows.map(({ _id, ...operation }) => ({ ...operation, operationId: operation.operationId })), cursor: rows.length ? rows.at(-1)._id.toString() : cursor })
    }
    return send(response, 404, { error: 'Not found.' })
  } catch (error) {
    console.error(error)
    return send(response, 500, { error: 'Sync service error.' })
  }
})

server.listen(port, () => console.log(`Sync API listening on ${port}`))
