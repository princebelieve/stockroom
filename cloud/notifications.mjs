import { createHash, createHmac, createPrivateKey, createSign, createECDH, randomBytes, createCipheriv } from 'node:crypto'
import { ObjectId } from 'mongodb'

const base64url = value => Buffer.from(value).toString('base64url')
const decode = value => Buffer.from(String(value || ''), 'base64url')
const hmac = (key, value) => createHmac('sha256', key).update(value).digest()

function hkdfExpand(prk, info, length) {
  let output = Buffer.alloc(0), previous = Buffer.alloc(0), counter = 1
  while (output.length < length) {
    previous = hmac(prk, Buffer.concat([previous, info, Buffer.from([counter++])]))
    output = Buffer.concat([output, previous])
  }
  return output.subarray(0, length)
}

function encryption(subscription, publicKey) {
  const userPublic = decode(subscription.keys?.p256dh), auth = decode(subscription.keys?.auth)
  if (userPublic.length !== 65 || userPublic[0] !== 4 || auth.length < 16) throw new Error('Invalid browser push encryption keys.')
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const serverPublic = ecdh.getPublicKey()
  const shared = ecdh.computeSecret(userPublic)
  const authPrk = hmac(auth, shared)
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), userPublic, serverPublic])
  const ikm = hkdfExpand(authPrk, keyInfo, 32)
  const salt = randomBytes(16), contentPrk = hmac(salt, ikm)
  const cek = hkdfExpand(contentPrk, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
  const nonce = hkdfExpand(contentPrk, Buffer.from('Content-Encoding: nonce\0'), 12)
  const cipher = createCipheriv('aes-128-gcm', cek, nonce)
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(publicKey), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])
  const header = Buffer.alloc(21)
  salt.copy(header, 0); header.writeUInt32BE(4096, 16); header[20] = serverPublic.length
  return Buffer.concat([header, serverPublic, encrypted])
}

export async function createNotifications({ database, accounts, visitors, verifyToken, fetcher = fetch }) {
  const notifications = database.collection('app_notifications')
  const subscriptions = database.collection('push_subscriptions')
  const fcmSubscriptions = database.collection('fcm_push_subscriptions')
  await Promise.all([
    notifications.createIndex({ recipientKey: 1, createdAt: -1 }),
    notifications.createIndex({ recipientKey:1,dedupeKey:1 },{unique:true,partialFilterExpression:{dedupeKey:{$type:'string'}}}),
    notifications.createIndex({ recipientKey: 1, readAt: 1, createdAt: -1 }),
    subscriptions.createIndex({ endpointHash: 1 }, { unique: true }),
    subscriptions.createIndex({ recipientKey: 1, updatedAt: -1 }),
    fcmSubscriptions.createIndex({ tokenHash: 1 }, { unique: true }),
    fcmSubscriptions.createIndex({ recipientKey: 1, updatedAt: -1 }),
  ])

  let cachedFcmAuth = null
  function fcmConfig() {
    const projectId = String(process.env.FCM_PROJECT_ID || '').trim()
    const clientEmail = String(process.env.FCM_CLIENT_EMAIL || '').trim()
    const privateKey = String(process.env.FCM_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim()
    return projectId && clientEmail && privateKey ? { projectId, clientEmail, privateKey } : null
  }

  async function fcmAccessToken(config) {
    if (cachedFcmAuth && cachedFcmAuth.expiresAt > Date.now() + 60_000) return cachedFcmAuth.token
    const now = Math.floor(Date.now() / 1000)
    const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(JSON.stringify({ iss: config.clientEmail, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))}`
    const signer = createSign('RSA-SHA256'); signer.update(unsigned); signer.end()
    const assertion = `${unsigned}.${signer.sign(createPrivateKey(config.privateKey)).toString('base64url')}`
    const response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), signal: AbortSignal.timeout(10000) })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || !result.access_token) throw new Error(`FCM OAuth failed (${response.status}).`)
    cachedFcmAuth = { token: result.access_token, expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000 }
    return cachedFcmAuth.token
  }

  async function deliverFcm(subscription, payload) {
    const config = fcmConfig()
    if (!config) return
    try {
      const accessToken = await fcmAccessToken(config)
      const response = await fetcher(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token: subscription.token, data: { title: payload.title, body: payload.body, url: payload.url, id: payload.id, type: payload.type }, android: { priority: 'HIGH', ttl: '3600s' } } }),
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) {
        const details = await response.json().catch(() => ({}))
        if (response.status === 404 || JSON.stringify(details).includes('UNREGISTERED')) await fcmSubscriptions.deleteOne({ _id: subscription._id })
        console.error('FCM delivery failed.', response.status, JSON.stringify(details).slice(0, 500))
      }
    } catch (error) { console.error('FCM delivery failed.', error instanceof Error ? error.message : 'Unknown error.') }
  }

  function vapid() {
    const publicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim()
    const privateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim()
    const subject = String(process.env.VAPID_SUBJECT || '').trim()
    if (!publicKey || !privateKey || !subject) return null
    const rawPublic = decode(publicKey), rawPrivate = decode(privateKey)
    if (rawPublic.length !== 65 || rawPublic[0] !== 4 || rawPrivate.length !== 32) throw new Error('VAPID keys must be a P-256 public key and private key encoded as base64url.')
    const jwk = { kty: 'EC', crv: 'P-256', x: base64url(rawPublic.subarray(1, 33)), y: base64url(rawPublic.subarray(33)), d: base64url(rawPrivate), ext: true }
    return { publicKey, key: createPrivateKey({ key: jwk, format: 'jwk' }), subject }
  }

  function authorization(endpoint, keys) {
    const url = new URL(endpoint)
    const now = Math.floor(Date.now() / 1000)
    const claims = base64url(JSON.stringify({ aud: url.origin, exp: now + 12 * 60 * 60, sub: keys.subject }))
    const header = base64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
    const unsigned = `${header}.${claims}`
    const signer = createSign('SHA256'); signer.update(unsigned); signer.end()
    const signature = signer.sign({ key: keys.key, dsaEncoding: 'ieee-p1363' }).toString('base64url')
    return `vapid t=${unsigned}.${signature}, k=${keys.publicKey}`
  }

  async function deliver(subscription, payload) {
    let keys
    try { keys = vapid() } catch (error) { console.error('VAPID push is misconfigured.', error.message); return }
    if (!keys) return
    const endpoint = String(subscription.endpoint || '')
    try {
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: { Authorization: authorization(endpoint, keys), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal' },
        body: encryption(subscription, JSON.stringify(payload)),
        signal: AbortSignal.timeout(10000),
      })
      if (response.status === 404 || response.status === 410) await subscriptions.deleteOne({ _id: subscription._id })
    } catch (error) { console.error('Push delivery failed.', error instanceof Error ? error.message : 'Unknown error.') }
  }

  async function pushRecipient(recipientKey, message) {
    const saved = { _id: new ObjectId(), recipientKey, businessId: message.businessId || null, title: String(message.title || 'Stockroom update').slice(0, 100), body: String(message.body || '').slice(0, 300), url: String(message.url || '/').slice(0, 300), type: String(message.type || 'general').slice(0, 40), createdAt: new Date(), readAt: null }
    if(message.dedupeKey){
      saved.dedupeKey=String(message.dedupeKey).slice(0,200)
      try{const result=await notifications.updateOne({recipientKey,dedupeKey:saved.dedupeKey},{$setOnInsert:saved},{upsert:true});if(!result.upsertedCount)return null}catch(error){if(error.code===11000)return null;throw error}
    }else await notifications.insertOne(saved)
    const targets = await subscriptions.find({ recipientKey }).limit(20).toArray()
    const fcmTargets = await fcmSubscriptions.find({ recipientKey }).limit(20).toArray()
    const payload = { title: saved.title, body: saved.body, url: saved.url, id: saved._id.toString(), type: saved.type }
    await Promise.all([...targets.map(target => deliver(target, payload)), ...fcmTargets.map(target => deliverFcm(target, payload))])
    return saved
  }

  async function notifyAccount(accountId, message) {
    const id = String(accountId || '')
    if (!id || !ObjectId.isValid(id)) return null
    const account = await accounts.findOne({ _id: new ObjectId(id) })
    if (!account) return null
    return pushRecipient(`account:${id}`, { ...message, businessId: account.businessId })
  }

  async function notifyBusinessOwners(businessId, message) {
    const owners = await accounts.find({ businessId, role: 'owner' }).project({ _id: 1 }).toArray()
    await Promise.all(owners.map(owner => notifyAccount(owner._id.toString(), message)))
  }

  async function notifyReferrer(referrerType, referrerId, message) {
    if (referrerType === 'visitor') {
      const visitor = await visitors.findOne({ _id: String(referrerId) })
      if (visitor) return pushRecipient(`visitor:${visitor._id}`, message)
      return null
    }
    const owner = await accounts.findOne({ businessId: String(referrerId), role: 'owner' })
    return owner ? notifyAccount(owner._id.toString(), message) : null
  }

  async function identity(claims) {
    if (claims?.kind === 'visitor' && claims.visitorId) {
      const visitor = await visitors.findOne({ _id: String(claims.visitorId) })
      return visitor ? { key: `visitor:${visitor._id}`, visitorId: visitor._id } : null
    }
    if (claims?.kind !== 'access' || !claims.sub || !ObjectId.isValid(claims.sub)) return null
    const account = await accounts.findOne({ _id: new ObjectId(claims.sub), businessId: claims.businessId })
    return account ? { key: `account:${account._id}`, businessId: account.businessId, accountId: account._id, role: account.role } : null
  }

  async function handle(request, response) {
    const url = new URL(request.url, 'http://localhost')
    if (!url.pathname.startsWith('/v1/notifications/')) return false
    response.setHeader('Cache-Control', 'no-store')
    const reply = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)); return true }
    try {
      const who = await identity(verifyToken(request))
      if (!who) return reply(401, { error: 'Sign in to manage notifications.' })
      if (url.pathname === '/v1/notifications/me' && request.method === 'GET') {
        const rows = await notifications.find({ recipientKey: who.key }).sort({ createdAt: -1 }).limit(50).toArray()
        const currentVapid = vapid()
        const pushEnabled = subscriptions.countDocuments({ recipientKey: who.key }).then(count => count > 0)
        return reply(200, { notifications: rows.map(row => ({ id: row._id.toString(), title: row.title, body: row.body, url: row.url, type: row.type, createdAt: row.createdAt, read: Boolean(row.readAt) })), unread: rows.filter(row => !row.readAt).length, pushSupported: Boolean(currentVapid), pushEnabled: await pushEnabled, fcmSupported: Boolean(fcmConfig()), fcmEnabled: await fcmSubscriptions.countDocuments({ recipientKey: who.key }) > 0, publicKey: currentVapid?.publicKey || '' })
      }
      if (url.pathname === '/v1/notifications/fcm-token' && (request.method === 'POST' || request.method === 'DELETE')) {
        const input = await readJson(request)
        const token = String(input.token || '')
        if (token.length < 20 || token.length > 4096) return reply(400, { error: 'A valid Android push token is required.' })
        const tokenHash = createHash('sha256').update(token).digest('hex')
        if (request.method === 'DELETE') await fcmSubscriptions.deleteOne({ tokenHash, recipientKey: who.key })
        else {
          if (!fcmConfig()) return reply(503, { error: 'Android push notifications are not configured on this server.' })
          const now = new Date()
          await fcmSubscriptions.updateOne({ tokenHash }, { $set: { tokenHash, token, recipientKey: who.key, ...(who.businessId ? { businessId: who.businessId } : {}), ...(who.accountId ? { accountId: who.accountId } : {}), ...(who.visitorId ? { visitorId: who.visitorId } : {}), updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true })
        }
        return reply(200, { ok: true })
      }
      if (url.pathname === '/v1/notifications/push-subscription' && request.method === 'POST') {
        const input = await readJson(request)
        if (!input.subscription) return reply(400, { error: 'Browser push subscription is required.' })
        const endpoint = String(input.subscription.endpoint || '')
        let parsed
        try { parsed = new URL(endpoint) } catch { return reply(400, { error: 'Push endpoint is invalid.' }) }
        if (parsed.protocol !== 'https:' || endpoint.length > 2048 || !input.subscription.keys?.p256dh || !input.subscription.keys?.auth || String(input.subscription.keys.p256dh).length > 200 || String(input.subscription.keys.auth).length > 100) return reply(400, { error: 'A valid HTTPS browser push subscription is required.' })
        const allowedPushHost = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)$/i.test(parsed.hostname)
        if (!allowedPushHost) return reply(400, { error: 'This browser push provider is not supported.' })
        if (!vapid()) return reply(503, { error: 'Push notifications are not configured on this server.' })
        const endpointHash = createHash('sha256').update(endpoint).digest('hex')
        const now = new Date()
        await subscriptions.updateOne({ endpointHash }, { $set: { endpointHash, endpoint, keys: { p256dh: input.subscription.keys.p256dh, auth: input.subscription.keys.auth }, recipientKey: who.key, ...(who.businessId ? { businessId: who.businessId } : {}), ...(who.accountId ? { accountId: who.accountId } : {}), ...(who.visitorId ? { visitorId: who.visitorId } : {}), updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true })
        return reply(200, { ok: true })
      }
      if (url.pathname === '/v1/notifications/push-subscription' && request.method === 'DELETE') {
        const input = await readJson(request), endpointHash = createHash('sha256').update(String(input.endpoint || '')).digest('hex')
        await subscriptions.deleteOne({ endpointHash, recipientKey: who.key })
        return reply(200, { ok: true })
      }
      if (url.pathname === '/v1/notifications/read' && request.method === 'POST') {
        const input = await readJson(request), now = new Date()
        if (input.all === true) await notifications.updateMany({ recipientKey: who.key, readAt: null }, { $set: { readAt: now } })
        else if (ObjectId.isValid(String(input.id || ''))) await notifications.updateOne({ _id: new ObjectId(input.id), recipientKey: who.key }, { $set: { readAt: now } })
        else return reply(400, { error: 'Choose a valid notification.' })
        return reply(200, { ok: true })
      }
      return reply(405, { error: 'Notification route or method not available.' })
    } catch (error) { console.error('Notification request failed.', error instanceof Error ? error.message : 'Unknown error.'); return reply(500, { error: 'Notifications are temporarily unavailable.' }) }
  }

  return { handle, notifyAccount, notifyBusinessOwners, notifyReferrer }
}

async function readJson(request) {
  let size = 0
  const chunks = []
  for await (const chunk of request) { size += chunk.length; if (size > 65536) throw new Error('Request too large.'); chunks.push(chunk) }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { throw new Error('Invalid JSON.') }
}
