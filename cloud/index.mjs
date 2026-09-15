import { createServer } from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { MongoClient, ObjectId } from 'mongodb'

const port = Number(process.env.PORT || 8080)
const uri = process.env.MONGODB_URI
const jwtSecret = process.env.JWT_SECRET
const adminApiKey = process.env.ADMIN_API_KEY
if (!uri || !jwtSecret || !adminApiKey) throw new Error('MONGODB_URI, JWT_SECRET, and ADMIN_API_KEY are required for the cloud sync API.')

const client = new MongoClient(uri)
await client.connect()
const database = client.db(process.env.MONGODB_DATABASE || 'stockroom_sync')
const operations = database.collection('sync_operations')
await operations.createIndex({ businessId: 1, operationId: 1 }, { unique: true })
await operations.createIndex({ businessId: 1, _id: 1 })

function send(response, status, payload) { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(payload)) }
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
function signToken(payload) {
  const header = encode({ alg: 'HS256', typ: 'JWT' })
  const body = encode(payload)
  const signature = createHmac('sha256', jwtSecret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}
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

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') return send(response, 200, { ok: true })
  try {
    if (request.method === 'POST' && request.url === '/v1/admin/devices') {
      if (request.headers['x-admin-key'] !== adminApiKey) return send(response, 401, { error: 'Unauthorized.' })
      const input = await readJson(request)
      const businessId = String(input.businessId || '')
      const deviceId = String(input.deviceId || '')
      if (!businessId || !deviceId) return send(response, 400, { error: 'businessId and deviceId are required.' })
      const expiresInDays = Math.min(Math.max(Number(input.expiresInDays) || 365, 1), 730)
      const token = signToken({ businessId, deviceId, exp: Math.floor(Date.now() / 1000) + expiresInDays * 86_400 })
      return send(response, 201, { deviceToken: token, expiresInDays })
    }
    const claims = verifyToken(request)
    if (!claims) return send(response, 401, { error: 'Unauthorized.' })
    if (request.method === 'POST' && request.url === '/v1/sync/push') {
      const input = await readJson(request)
      const businessId = String(input.businessId || '')
      const deviceId = String(input.deviceId || '')
      const incoming = Array.isArray(input.operations) ? input.operations.slice(0, 500) : []
      if (!businessId || !deviceId || !incoming.length || claims.businessId !== businessId || claims.deviceId !== deviceId) return send(response, 403, { error: 'Token does not authorize this business/device.' })
      const documents = incoming.map((operation) => ({ businessId, deviceId, operationId: String(operation.operationId), entityType: String(operation.entityType), entityId: String(operation.entityId), action: String(operation.action), payload: operation.payload || {}, createdAt: operation.createdAt || new Date().toISOString(), receivedAt: new Date() }))
      const acceptedOperationIds = []
      for (const document of documents) {
        await operations.updateOne({ businessId, operationId: document.operationId }, { $setOnInsert: document }, { upsert: true })
        acceptedOperationIds.push(document.operationId)
      }
      return send(response, 200, { acceptedOperationIds })
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
