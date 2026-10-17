import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { recordPayment } from '../server/payment.mjs'
import { validateCounterPayment } from '../server/counter-service.mjs'

const cents = value => Math.round(Number(value) * 100)
export const PAYSTACK_MINIMUM_SUBUNITS = Object.freeze({ NGN: 5000, USD: 200, GHS: 10, ZAR: 100, KES: 300, XOF: 100 })
const paystackMinimum = PAYSTACK_MINIMUM_SUBUNITS
const liveStatuses = ['initializing', 'initialized', 'uncertain', 'needs-review']
const expiration = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)

export function createCustomerPaystackPayments({ database, entityHeads, operations, businessSettings, customerPortalAccounts, verifyToken, readJson, send, serialize, configFor, env = process.env, fetcher = fetch, ObjectId }) {
  const sessions = database.collection('customer_paystack_sessions')
  const initializing = new Set()
  const limits = new Map()
  async function ensure() {
    await sessions.createIndex({ businessId: 1, requestId: 1 }, { unique: true })
    await sessions.createIndex({ state: 1 }, { unique: true })
    await sessions.createIndex({ reference: 1 }, { unique: true, sparse: true })
    await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
    await sessions.createIndex({ businessId: 1, purpose: 1, targetId: 1, status: 1 })
    await sessions.createIndex({ businessId: 1, activeKey: 1 }, { unique: true, partialFilterExpression: { activeKey: { $exists: true } } })
  }
  async function claimsFor(request) {
    const claims = verifyToken(request)
    if (claims?.kind !== 'customer' || !claims.businessId || !claims.customerId) return null
    if (claims.guest) return claims
    if (!ObjectId.isValid(claims.sub)) return null
    const account = await customerPortalAccounts.findOne({ _id: new ObjectId(claims.sub), businessId: claims.businessId, customerId: claims.customerId, active: true })
    return account && claims.authVersion === new Date(account.updatedAt || account.createdAt).getTime() ? claims : null
  }
  async function paystack(config, reference) {
    const response = await fetcher(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${config.secretKey}` }, signal: AbortSignal.timeout(20000) })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || result.status !== true || !result.data) throw new Error(`Paystack verification failed (${response.status}).`)
    return result.data
  }
  function redirect(response, session, status) {
    const origin = env.SUBSCRIPTION_PUBLIC_URL || env.VITE_PUBLIC_APP_URL || 'https://stockroom.globalcreest.com/'
    const target = new URL('/', origin)
    target.searchParams.set('customer', session.businessId)
    target.searchParams.set('catalog', session.catalogMode || 'food')
    target.searchParams.set('paystackPayment', status)
    target.searchParams.set('paystackPurpose', session.purpose)
    target.searchParams.set('paystackTarget', session.targetId)
    target.searchParams.set('paystackRequestId', session.requestId)
    if (session.purpose === 'wallet') target.searchParams.set('wallet', '1')
    response.writeHead(303, { Location: target.toString(), 'Cache-Control': 'no-store' }); response.end()
  }
  async function getOrder(session) {
    const head = await entityHeads.findOne({ businessId: session.businessId, entityType: 'pos_record', entityId: session.targetId })
    const order = head?.payload
    if (!order || order.kind !== 'counter-order' || order.source !== 'customer-portal' || order.customerPortalId !== session.customerId || order.status === 'cancelled') throw new Error('This customer order is no longer payable.')
    if (!order.acceptedTillId) throw new Error('The business acceptance was withdrawn. Contact the business before paying.')
    if (order.currency !== session.currency || cents(order.total) !== session.amount) throw new Error('The order total changed. Refresh the customer portal before paying.')
    const existing = await operations.findOne({ businessId: session.businessId, entityType: 'sale', entityId: `counter-payment:${order.id}` })
    if (existing) {
      if (existing.payload?.paymentReference === session.reference && existing.payload?.terminalProvider === 'Paystack Online') return { head, order, existing }
      throw new Error('This order already has a payment record. Contact the business before trying again.')
    }
    return { head, order, existing: null }
  }
  async function finalize(session, transaction) {
    const metadata = typeof transaction.metadata === 'string' ? (() => { try { return JSON.parse(transaction.metadata) } catch { return {} } })() : transaction.metadata || {}
    if (transaction.status !== 'success' || String(transaction.reference) !== session.reference || Number(transaction.amount) !== session.amount || String(transaction.currency).toUpperCase() !== session.currency || metadata.paymentState !== session.state || metadata.businessId !== session.businessId || metadata.customerId !== session.customerId || metadata.purpose !== session.purpose || metadata.targetId !== session.targetId) throw new Error('Paystack payment details do not match this customer payment.')
    return serialize(session.businessId, async () => {
      const current = await sessions.findOne({ businessId: session.businessId, state: session.state })
      if (current?.status === 'paid') return 'paid'
      if (!current || !liveStatuses.includes(current.status) || current.reference !== session.reference) throw new Error('This payment session is no longer active.')
      const business = await businessSettings.findOne({ businessId: session.businessId })
      if (!business || await database.collection('account_deletion_requests').findOne({ type: 'business', businessId: session.businessId, status: { $in: ['pending', 'processing'] } })) throw new Error('This business cannot accept payments right now.')
      const createdAt = new Date().toISOString()
      if (session.purpose === 'wallet') {
        const customer = await entityHeads.findOne({ businessId: session.businessId, entityType: 'customer', entityId: session.customerId })
        if (!customer || business.settings?.paymentPolicy?.allowWallet !== true) throw new Error('This customer wallet is unavailable.')
        const operationId = `customer-paystack-wallet:${session.reference}`
        await operations.updateOne({ businessId: session.businessId, operationId }, { $setOnInsert: { businessId: session.businessId, operationId, deviceId: 'paystack-online', entityType: 'wallet', entityId: session.customerId, action: 'adjust', payload: { customerId: session.customerId, amount: session.amount / 100, reason: `Paystack wallet funding ${session.reference}`, createdAt }, createdAt, receivedAt: new Date() } }, { upsert: true })
      } else if (session.purpose === 'order') {
        const { head, order, existing } = await getOrder(session)
        if (existing) {
          await sessions.updateOne({ businessId: session.businessId, state: session.state }, { $set: { status: 'paid', paidAt: createdAt, paystackTransactionId: String(transaction.id) }, $unset: { activeKey: '' } })
          return 'paid'
        }
        const items = order.lines.map(line => ({ productId: line.productId || `service:counter:${line.id}`, productName: [line.name, ...(line.options || []).map(option => option.name)].join(' / '), quantity: line.quantity, price: line.price }))
        const rawSale = { id: `counter-payment:${order.id}`, branchId: order.branchId, currency: order.currency, total: order.total, items, paymentMethod: 'external-pos', paymentReference: session.reference, terminalProvider: 'Paystack Online', createdAt, staffId: `customer:${session.customerId}`, staffName: order.customerName, paymentDetails: { amountReceived: order.total, counterOrder: { id: order.id, tillId: order.tillId, retailOrder: order.retailOrder === true, diningOption: order.diningOption || 'Takeaway', ...(order.tableService ? { tableService: order.tableService } : {}) }, ...(order.pos ? { pos: order.pos } : {}), receipt: { businessName: order.businessName, number: `counter-payment:${order.id}`, transactionType: 'Online customer order', cardType: 'Paystack' } } }
        const sale = recordPayment(rawSale, business.settings?.paymentPolicy, true)
        validateCounterPayment(sale, order)
        const operationId = `customer-paystack-order:${session.reference}`
        await operations.updateOne({ businessId: session.businessId, operationId }, { $setOnInsert: { businessId: session.businessId, operationId, deviceId: 'paystack-online', entityType: 'sale', entityId: sale.id, action: 'create', payload: sale, createdAt, receivedAt: new Date() } }, { upsert: true })
      } else throw new Error('Unknown customer payment purpose.')
      await sessions.updateOne({ businessId: session.businessId, state: session.state, status: { $in: liveStatuses } }, { $set: { status: 'paid', paidAt: createdAt, paystackTransactionId: String(transaction.id) }, $unset: { activeKey: '' } })
      return 'paid'
    })
  }
  async function start(request, response) {
    const claims = await claimsFor(request)
    if (!claims) return send(response, 401, { error: 'Sign in again to continue with customer checkout.' })
    const nowMs = Date.now(), key = `${String(request.socket.remoteAddress || '')}:${claims.businessId}:${claims.customerId}`, old = limits.get(key), window = old?.until > nowMs ? old : { count: 0, until: nowMs + 15 * 60 * 1000 }
    if (window.count >= 20) return send(response, 429, { error: 'Too many payment attempts. Wait fifteen minutes before trying again.' })
    limits.set(key, { ...window, count: window.count + 1 })
    const input = await readJson(request, 4096), purpose = input.purpose === 'wallet' ? 'wallet' : input.purpose === 'order' ? 'order' : '', requestId = String(input.requestId || ''), email = String(input.email || '').trim().toLowerCase()
    if (!purpose || !/^[a-zA-Z0-9_-]{12,100}$/.test(requestId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return send(response, 400, { error: 'Enter a valid payment request ID and receipt email address.' })
    if (purpose === 'wallet' && (claims.guest || !ObjectId.isValid(claims.sub))) return send(response, 403, { error: 'Sign in to a customer account before funding a wallet.' })
    const business = await businessSettings.findOne({ businessId: claims.businessId })
    if (!business || await database.collection('account_deletion_requests').findOne({ type: 'business', businessId: claims.businessId, status: { $in: ['pending', 'processing'] } })) return send(response, 403, { error: 'This business is not accepting customer payments.' })
    if (purpose === 'wallet' && business.settings?.paymentPolicy?.allowWallet !== true) return send(response, 403, { error: 'Customer wallet funding is not enabled by this business.' })
    const targetId = purpose === 'order' ? String(input.orderId || '') : claims.customerId
    let amount, currency, catalogMode = ['retail', 'hotel', 'nightlife'].includes(input.catalogMode) ? input.catalogMode : 'food'
    if (purpose === 'order') {
      const head = await entityHeads.findOne({ businessId: claims.businessId, entityType: 'pos_record', entityId: targetId }), order = head?.payload
      if (!order || order.kind !== 'counter-order' || order.source !== 'customer-portal' || order.customerPortalId !== claims.customerId || order.status === 'cancelled') return send(response, 404, { error: 'This customer order is no longer payable.' })
      if (!order.acceptedTillId) return send(response, 409, { error: 'The business must accept this order before Paystack checkout can start.' })
      const existing = await operations.findOne({ businessId: claims.businessId, entityType: 'sale', entityId: `counter-payment:${targetId}` })
      if (existing) return send(response, 409, { error: 'This order has already been paid.' })
      amount = cents(order.total); currency = String(order.currency || '').toUpperCase()
      if (!Object.hasOwn(paystackMinimum, currency)) return send(response, 400, { error: `Paystack checkout is not available for ${currency || 'this'} business currency.` })
      if (currency === 'XOF' && !Number.isInteger(Number(order.total))) return send(response, 400, { error: 'Paystack requires XOF order totals to be whole francs.' })
      if (amount < paystackMinimum[currency]) return send(response, 400, { error: `Paystack requires a minimum payment of ${paystackMinimum[currency] / 100} ${currency}.` })
      if (input.amount !== undefined && cents(input.amount) !== amount) return send(response, 409, { error: 'The order amount changed. Refresh before paying.' })
      catalogMode = order.retailOrder ? 'retail' : 'food'
    } else {
      if (!/^\d+(?:\.\d{1,2})?$/.test(String(input.amount ?? ''))) return send(response, 400, { error: 'Enter a wallet funding amount with at most two decimal places.' })
      amount = cents(input.amount); currency = String(business.settings?.currency || '').toUpperCase()
      if (!Object.hasOwn(paystackMinimum, currency)) return send(response, 400, { error: `Paystack checkout is not available for ${currency || 'this'} business currency.` })
      if (currency === 'XOF' && !Number.isInteger(Number(input.amount))) return send(response, 400, { error: 'Paystack requires XOF wallet funding amounts to be whole francs.' })
      if (!Number.isSafeInteger(amount) || amount < paystackMinimum[currency] || amount > 100000000 || !/^[A-Z]{3}$/.test(currency)) return send(response, 400, { error: `Choose a wallet funding amount of at least ${paystackMinimum[currency] / 100} ${currency} and no more than 1,000,000.` })
    }
    const config = await configFor(claims.businessId)
    if (!config) return send(response, 503, { error: 'This business has not connected Paystack for online payments.' })
    const prior = await sessions.findOne({ businessId: claims.businessId, requestId })
    if (prior) {
      if (prior.customerId !== claims.customerId || prior.purpose !== purpose || prior.targetId !== targetId || prior.amount !== amount || prior.email !== email) return send(response, 409, { error: 'This payment request ID has already been used for different details.' })
      if (prior.status === 'initialized') return send(response, 200, { authorizationUrl: prior.authorizationUrl })
      return send(response, 409, { error: 'This payment request is already being processed. Refresh payment status before retrying.' })
    }
    if (purpose === 'order' && await sessions.findOne({ businessId: claims.businessId, purpose, targetId, status: { $in: liveStatuses } })) return send(response, 409, { error: 'A payment attempt for this order is already active. Check its status before trying again.' })
    const state = randomBytes(32).toString('base64url'), reference = `SRC-${randomBytes(15).toString('hex')}`, session = { businessId: claims.businessId, customerId: claims.customerId, requestId, state, reference, purpose, targetId, amount, currency, email, catalogMode, status: 'initializing', ...(purpose === 'order' ? { activeKey: `${purpose}:${targetId}` } : {}), createdAt: new Date(), expiresAt: expiration() }
    try { await sessions.insertOne(session) } catch (error) { if (error.code === 11000) return send(response, 409, { error: 'This payment request is already being processed.' }); throw error }
    if (initializing.has(state)) return send(response, 409, { error: 'This payment request is already being initialized.' })
    initializing.add(state)
    try {
      const apiOrigin = (env.RENDER_EXTERNAL_URL || 'https://stockroom-0vm5.onrender.com').replace(/\/$/, '')
      const callbackUrl = `${apiOrigin}/v1/customer-portal/paystack-return?state=${encodeURIComponent(state)}`
      const resultResponse = await fetcher('https://api.paystack.co/transaction/initialize', { method: 'POST', headers: { Authorization: `Bearer ${config.secretKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, amount: String(amount), currency, reference, callback_url: callbackUrl, metadata: JSON.stringify({ paymentState: state, businessId: claims.businessId, customerId: claims.customerId, purpose, targetId }) }), signal: AbortSignal.timeout(20000) })
      const result = await resultResponse.json().catch(() => ({})), data = result.data
      if (!resultResponse.ok || result.status !== true || data?.reference !== reference || !/^https:\/\/checkout\.paystack\.com\//.test(data?.authorization_url || '') || typeof data?.access_code !== 'string' || !data.access_code) throw new Error(`Paystack could not start checkout (${resultResponse.status}).`)
      await sessions.updateOne({ businessId: claims.businessId, state, status: 'initializing' }, { $set: { status: 'initialized', authorizationUrl: data.authorization_url, accessCode: data.access_code || '' } })
      return send(response, 200, { authorizationUrl: data.authorization_url })
    } catch (error) {
      await sessions.updateOne({ businessId: claims.businessId, state, status: 'initializing' }, { $set: { status: 'uncertain', initializationError: String(error.message || '').slice(0, 250) } })
      return send(response, 502, { error: 'Paystack checkout could not be confirmed as started. Check the Paystack dashboard before retrying.' })
    } finally { initializing.delete(state) }
  }
  async function handle(request, response, url) {
    const path = url.pathname
    if (path === '/v1/customer-portal/paystack/start' && request.method === 'POST') return start(request, response)
    if (path === '/v1/customer-portal/paystack-return' && request.method === 'GET') {
      const state = String(url.searchParams.get('state') || ''), session = state ? await sessions.findOne({ state }) : null
      if (!session) return send(response, 400, { error: 'This payment return link is invalid or expired.' })
      if (session.status === 'paid') { redirect(response, session, 'success'); return true }
      try {
        const transaction = await paystack(await configFor(session.businessId), session.reference)
        if (transaction.status === 'success') { try { await finalize(session, transaction); redirect(response, session, 'success') } catch (error) { await sessions.updateOne({ state, status: { $in: liveStatuses } }, { $set: { status: 'needs-review', failureReason: String(error.message || '').slice(0, 250) } }); redirect(response, session, 'pending') } }
        else { const failed = ['failed', 'abandoned', 'reversed'].includes(transaction.status); if (failed) await sessions.updateOne({ state, status: 'initialized' }, { $set: { status: 'failed', failureReason: transaction.status }, $unset: { activeKey: '' } }); redirect(response, session, failed ? 'failed' : 'pending') }
      } catch { redirect(response, session, 'pending') }
      return true
    }
    return false
  }
  async function handleWebhookPayload(request, response, raw, body) {
    const reference = String(body?.data?.reference || ''), session = reference ? await sessions.findOne({ reference }) : null
    if (!session) return send(response, 200, { received: true })
    const config = await configFor(session.businessId)
    if (!config) return send(response, 503, { error: 'Paystack account configuration is unavailable.' })
    const signature = String(request.headers['x-paystack-signature'] || ''), expected = createHmac('sha512', config.secretKey).update(raw).digest('hex')
    if (Buffer.byteLength(signature) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return send(response, 401, { error: 'Invalid Paystack webhook signature.' })
    if (body.event === 'charge.success') try { await finalize(session, await paystack(config, reference)) } catch { return send(response, 409, { error: 'Payment is verified but could not yet be applied to the customer account.' }) }
    return send(response, 200, { received: true })
  }
  return { ensure, handle, handleWebhookPayload, async verifiesOnlineOrderSale(businessId, sale) {
    if (sale?.terminalProvider !== 'Paystack Online' || !sale?.paymentReference) return false
    const session = await sessions.findOne({ businessId, reference: sale.paymentReference, purpose: 'order', targetId: sale.paymentDetails?.counterOrder?.id, status: 'paid' })
    return Boolean(session && session.amount === cents(sale.total) && session.currency === sale.currency && sale.id === `counter-payment:${session.targetId}`)
  } }
}
