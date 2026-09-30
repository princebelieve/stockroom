import { createHash, createSign } from 'node:crypto'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API_ROOT = 'https://androidpublisher.googleapis.com/androidpublisher/v3'
const ALLOWED_STATES = new Set(['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED'])

function b64url(value) { return Buffer.from(value).toString('base64url') }
function parseServiceAccount() {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  try { return JSON.parse(raw) } catch { throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON must contain valid service account JSON.') }
}
function configuredProducts(saved = null) {
  const raw = process.env.GOOGLE_PLAY_PRODUCT_IDS || saved
  if (!raw) return null
  let values
  try { values = typeof raw === 'string' ? JSON.parse(raw) : raw } catch { throw new Error('GOOGLE_PLAY_PRODUCT_IDS must be JSON, for example {"monthly":"stockroom_monthly","yearly":"stockroom_yearly"}.') }
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('GOOGLE_PLAY_PRODUCT_IDS must map plan IDs to Play subscription product IDs.')
  if (!Object.keys(values).length) return null
  const allowed = new Set(['monthly', 'yearly', 'enterprise'])
  const result = Object.fromEntries(Object.entries(values).map(([planId, productId]) => [planId, String(productId).trim()]))
  if (!Object.keys(result).length || Object.entries(result).some(([planId, productId]) => !allowed.has(planId) || !/^[a-zA-Z0-9._-]{3,100}$/.test(productId))) throw new Error('Configure valid monthly, yearly, or enterprise Google Play product IDs.')
  return result
}

export function createGooglePlayBilling({ database, accounts, verifyToken, fetcher = fetch }) {
  const subscriptions = database.collection('subscriptions')
  const purchases = database.collection('google_play_purchases')
  let cachedAccessToken = ''
  let tokenExpiresAt = 0
  let tokenPromise

  async function config() {
    const serviceAccount = parseServiceAccount()
    const saved = await database.collection('subscription_settings').findOne({ _id: 'plan' }, { projection: { googlePlayProductIds: 1 } })
    const products = configuredProducts(saved?.googlePlayProductIds)
    const packageName = String(process.env.GOOGLE_PLAY_PACKAGE_NAME || '').trim()
    const enabled = Boolean(serviceAccount?.client_email && serviceAccount?.private_key && products && packageName)
    return { serviceAccount, products, packageName, enabled }
  }

  async function googleAccessToken(serviceAccount) {
    if (cachedAccessToken && tokenExpiresAt > Date.now() + 60_000) return cachedAccessToken
    if (tokenPromise) return tokenPromise
    tokenPromise = (async () => {
      const now = Math.floor(Date.now() / 1000)
      const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
      const claims = b64url(JSON.stringify({ iss: serviceAccount.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: TOKEN_URL, iat: now, exp: now + 3600 }))
      const unsigned = `${header}.${claims}`
      const signer = createSign('RSA-SHA256')
      signer.update(unsigned)
      signer.end()
      const assertion = `${unsigned}.${signer.sign(serviceAccount.private_key).toString('base64url')}`
      const response = await fetcher(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), signal: AbortSignal.timeout(15000) })
      const data = await response.json()
      if (!response.ok || !data.access_token) throw new Error('Google Play API authentication failed. Check the service account and Play Console API access.')
      cachedAccessToken = data.access_token
      tokenExpiresAt = Date.now() + Number(data.expires_in || 3600) * 1000
      return cachedAccessToken
    })().finally(() => { tokenPromise = null })
    return tokenPromise
  }

  async function getSubscription({ serviceAccount, packageName, purchaseToken }) {
    const accessToken = await googleAccessToken(serviceAccount)
    const url = `${API_ROOT}/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`
    const response = await fetcher(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) })
    const data = await response.json()
    if (!response.ok) {
      const error = new Error(response.status === 404 ? 'Google Play could not find this subscription purchase.' : 'Google Play could not verify this purchase right now.')
      error.statusCode = response.status === 404 ? 400 : 502
      throw error
    }
    return data
  }

  async function acknowledgeSubscription({ serviceAccount, packageName, productId, purchaseToken }) {
    const accessToken = await googleAccessToken(serviceAccount)
    const url = `${API_ROOT}/applications/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`
    const response = await fetcher(url, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000) })
    if (!response.ok) throw new Error('Google Play could not acknowledge this subscription purchase. Check the Play Console API permissions.')
  }

  function accountBinding(businessId, packageName) {
    // The client uses this opaque value as obfuscatedExternalAccountId. It is
    // deterministic so a later restore or renewal can be tied to the same shop.
    return createHash('sha256').update(`${packageName}:${businessId}`).digest('hex')
  }

  function tokenKey(purchaseToken) { return createHash('sha256').update(purchaseToken).digest('hex') }

  function planForProduct(productId, products) {
    return Object.entries(products).find(([, configuredId]) => configuredId === productId)?.[0] || null
  }

  function entitlement(data, products) {
    const lineItems = Array.isArray(data.lineItems) ? data.lineItems : []
    const active = lineItems.map(item => ({ item, planId: planForProduct(String(item.productId || ''), products), expiry: new Date(item.expiryTime || 0) }))
      .filter(item => item.planId && Number.isFinite(item.expiry.getTime()))
      .sort((a, b) => b.expiry - a.expiry)[0]
    if (!active || !ALLOWED_STATES.has(data.subscriptionState) || active.expiry <= new Date()) return null
    return { ...active, state: data.subscriptionState }
  }

  async function upsertVerified({ businessId, purchaseToken, data, config: current }) {
    const binding = data.externalAccountIdentifiers?.obfuscatedExternalAccountId
    if (binding !== accountBinding(businessId, current.packageName)) {
      const error = new Error('This Play purchase is not linked to the signed-in business. Start the purchase from that business account, then restore it here.')
      error.statusCode = 403
      throw error
    }
    const currentEntitlement = entitlement(data, current.products)
    if (!currentEntitlement) {
      const error = new Error('Google Play confirms that this subscription is not currently active.')
      error.statusCode = 409
      throw error
    }
    const tokenId = tokenKey(purchaseToken)
    const existing = await purchases.findOne({ _id: tokenId })
    if (existing && existing.businessId !== businessId) {
      const error = new Error('This Play purchase is already linked to another business.')
      error.statusCode = 409
      throw error
    }
    const linkedToken = data.linkedPurchaseToken
    if (linkedToken) {
      const prior = await purchases.findOne({ _id: tokenKey(linkedToken) })
      if (prior && prior.businessId !== businessId) {
        const error = new Error('The replaced Play purchase belongs to another business.')
        error.statusCode = 409
        throw error
      }
    }
    const { item, planId, expiry, state } = currentEntitlement
    if (data.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') await acknowledgeSubscription({ serviceAccount: current.serviceAccount, packageName: current.packageName, productId: item.productId, purchaseToken })
    const now = new Date()
    const configured = await database.collection('subscription_settings').findOne({ _id: 'plan' })
    const plan = configured?.plans?.find(row => row.id === planId) || configured
    await subscriptions.updateOne({ _id: businessId }, { $set: {
      playExpiresAt: expiry,
      playPlanId: planId,
      playProductId: item.productId,
      playPurchaseTokenHash: tokenId,
      playSubscriptionState: state,
      ...(Number.isInteger(plan?.graceDays) ? { playGraceDays: plan.graceDays } : {}),
      ...(Number.isInteger(plan?.graceMonths) ? { playGraceMonths: plan.graceMonths } : {}),
      playLastVerifiedAt: now,
    } }, { upsert: true })
    await purchases.updateOne({ _id: tokenId }, { $set: {
      businessId, productId: item.productId, planId, packageName: current.packageName,
      latestOrderId: data.latestOrderId || null, linkedPurchaseTokenHash: linkedToken ? tokenKey(linkedToken) : null,
      expiry, subscriptionState: state, updatedAt: now,
    }, $setOnInsert: { createdAt: now } }, { upsert: true })
    return { status: state, expiresAt: expiry, planId }
  }

  async function verifyPurchase(request, response, current) {
    const claims = verifyToken(request)
    if (claims?.kind !== 'access' || claims.role !== 'owner' || !claims.businessId) return send(response, 401, { error: 'Sign in as the business owner to verify a Play subscription.' })
    const owner = await accounts.findOne({ businessId: claims.businessId, role: 'owner' })
    if (!owner) return send(response, 401, { error: 'Business owner account not found.' })
    const input = await readJson(request)
    const purchaseToken = String(input.purchaseToken || '').trim()
    if (purchaseToken.length < 20 || purchaseToken.length > 4096) return send(response, 400, { error: 'A valid Google Play purchase token is required.' })
    const data = await getSubscription({ serviceAccount: current.serviceAccount, packageName: current.packageName, purchaseToken })
    if (data.packageName && data.packageName !== current.packageName) return send(response, 403, { error: 'This purchase was made for a different Android app.' })
    const result = await upsertVerified({ businessId: claims.businessId, purchaseToken, data, config: current })
    return send(response, 200, { ok: true, subscription: result })
  }

  async function verifyPubSubIdentity(request) {
    const authorization = String(request.headers.authorization || '')
    const idToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1]
    const audience = String(process.env.GOOGLE_PLAY_RTDN_AUDIENCE || '').trim()
    const expectedEmail = String(process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL || '').trim().toLowerCase()
    if (!idToken || !audience || !expectedEmail) return false
    const response = await fetcher(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, { signal: AbortSignal.timeout(10000) })
    if (!response.ok) return false
    const claims = await response.json()
    return claims.aud === audience && claims.email_verified === 'true' && String(claims.email || '').toLowerCase() === expectedEmail && ['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)
  }

  async function handleRtdn(request, response, current) {
    if (!await verifyPubSubIdentity(request)) return send(response, 401, { error: 'Google Pub/Sub identity could not be verified.' })
    const input = await readJson(request, 1024 * 1024)
    const message = input.message
    if (!message?.data) return send(response, 400, { error: 'Pub/Sub message data is required.' })
    let event
    try { event = JSON.parse(Buffer.from(message.data, 'base64').toString('utf8')) } catch { return send(response, 400, { error: 'Pub/Sub message is not valid Google Play notification data.' }) }
    if (event.packageName !== current.packageName) return send(response, 403, { error: 'Notification package does not match this app.' })
    const notice = event.subscriptionNotification
    if (!notice?.purchaseToken) return send(response, 200, { ok: true, ignored: true })
    const key = tokenKey(notice.purchaseToken)
    let mapping = await purchases.findOne({ _id: key })
    if (!mapping && notice.linkedPurchaseToken) mapping = await purchases.findOne({ _id: tokenKey(notice.linkedPurchaseToken) })
    if (!mapping) return send(response, 200, { ok: true, pendingVerification: true })
    const data = await getSubscription({ serviceAccount: current.serviceAccount, packageName: current.packageName, purchaseToken: notice.purchaseToken })
    if (data.packageName && data.packageName !== current.packageName) return send(response, 403, { error: 'Verified purchase belongs to another app.' })
    const currentEntitlement = entitlement(data, current.products)
    if (currentEntitlement) {
      const existingSubscription = await subscriptions.findOne({ _id: mapping.businessId }, { projection: { playPurchaseTokenHash: 1 } })
      const linkedMapping = notice.linkedPurchaseToken ? await purchases.findOne({ _id: tokenKey(notice.linkedPurchaseToken), businessId: mapping.businessId }) : null
      if (existingSubscription?.playPurchaseTokenHash && existingSubscription.playPurchaseTokenHash !== key && !linkedMapping) return send(response, 200, { ok: true, ignored: true, reason: 'Stale purchase token.' })
      const result = await upsertVerified({ businessId: mapping.businessId, purchaseToken: notice.purchaseToken, data, config: current })
      return send(response, 200, { ok: true, subscription: result })
    }
    const productId = String(data.lineItems?.[0]?.productId || mapping.productId || '')
    const state = String(data.subscriptionState || 'SUBSCRIPTION_STATE_EXPIRED')
    const expiry = data.lineItems?.map(item => new Date(item.expiryTime || 0)).filter(date => Number.isFinite(date.getTime())).sort((a, b) => b - a)[0] || new Date(0)
    const existingSubscription = await subscriptions.findOne({ _id: mapping.businessId }, { projection: { playPurchaseTokenHash: 1 } })
    if (existingSubscription?.playPurchaseTokenHash && existingSubscription.playPurchaseTokenHash !== key) return send(response, 200, { ok: true, ignored: true, reason: 'Stale purchase token.' })
    await subscriptions.updateOne({ _id: mapping.businessId }, { $set: { playExpiresAt: expiry, playProductId: productId, playPurchaseTokenHash: key, playSubscriptionState: state, playLastVerifiedAt: new Date() } }, { upsert: true })
    await purchases.updateOne({ _id: key }, { $set: { subscriptionState: state, expiry, updatedAt: new Date() } })
    return send(response, 200, { ok: true, status: state })
  }

  function send(response, status, data) {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify(data))
    return true
  }

  async function readJson(request, maxBytes = 65536) {
    let size = 0
    const chunks = []
    for await (const chunk of request) { size += chunk.length; if (size > maxBytes) throw new Error('Request too large.'); chunks.push(chunk) }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { throw new Error('Invalid JSON.') }
  }

  async function handle(request, response) {
    const url = new URL(request.url, 'http://localhost')
    if (url.pathname === '/v1/play/subscriptions/config' && request.method === 'GET') {
      let current
      try { current = await config() } catch { return send(response, 503, { enabled: false, error: 'Google Play subscription configuration is invalid.' }) }
      if (!current.enabled) return send(response, 503, { enabled: false, error: 'Google Play subscriptions are not configured yet.' })
      const claims = verifyToken(request)
      if (claims?.kind !== 'access' || claims.role !== 'owner' || !claims.businessId) return send(response, 401, { error: 'Sign in as the business owner to load Play subscription options.' })
      return send(response, 200, { enabled: true, packageName: current.packageName, products: current.products, obfuscatedAccountId: accountBinding(claims.businessId, current.packageName) })
    }
    if (url.pathname === '/v1/play/subscriptions/verify' && request.method === 'POST') {
      let current
      try { current = await config() } catch { return send(response, 503, { enabled: false, error: 'Google Play subscription configuration is invalid.' }) }
      if (!current.enabled) return send(response, 503, { enabled: false, error: 'Google Play subscriptions are not configured yet.' })
      try { return await verifyPurchase(request, response, current) }
      catch (error) { return send(response, error.statusCode || 400, { error: error.statusCode === 502 ? 'Google Play could not verify this purchase right now. Please retry.' : error.message || 'Could not verify this Google Play purchase.' }) }
    }
    if (url.pathname === '/v1/play/rtdn' && request.method === 'POST') {
      let current
      try { current = await config() } catch { return send(response, 503, { enabled: false, error: 'Google Play notification configuration is invalid.' }) }
      if (!current.enabled) return send(response, 503, { enabled: false, error: 'Google Play notifications are not configured yet.' })
      return handleRtdn(request, response, current)
    }
    return false
  }

  return { handle }
}
