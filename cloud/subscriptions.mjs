import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { mailConfigured, sendReferralBonusNotice, sendSubscriptionConfirmation, sendSubscriptionGraceNotice, sendSubscriptionReminder } from './mailer.mjs'
import { graceEndsAt, subscriptionAccess, referralPercentages } from '../server/subscription-policy.mjs'

export function validatePlan(input) {
  const plan = {
    amount: Number(input.amount),
    currency: String(input.currency || '').toUpperCase(),
    days: Number(input.days),
    reminderDays: Number(input.reminderDays),
    freeTrialDays: Number(input.freeTrialDays ?? 0),
    graceMonths: Number(input.graceMonths ?? 1),
  }
  if (!Number.isSafeInteger(plan.amount) || plan.amount < 1 || plan.amount > 1000000000 || !['NGN', 'GHS', 'ZAR', 'KES', 'USD', 'XOF'].includes(plan.currency) || !Number.isInteger(plan.days) || plan.days < 1 || plan.days > 730 || !Number.isInteger(plan.reminderDays) || plan.reminderDays < 1 || plan.reminderDays > 30 || !Number.isInteger(plan.freeTrialDays) || plan.freeTrialDays < 0 || plan.freeTrialDays > 365) throw new Error('Enter a valid amount in minor units, currency, duration (1–730 days), reminder window (1–30 days), and free-trial days (0–365).')
  if (!Number.isInteger(plan.graceMonths) || plan.graceMonths < 0 || plan.graceMonths > 12) throw new Error('Grace period must be between 0 and 12 calendar months.')
  return plan
}
export function validSignature(raw, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^[a-f0-9]{128}$/.test(signature)) return false
  const expected = createHmac('sha512', secret).update(raw).digest('hex')
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}
export function paymentMatches(payment, data) {
  return data.status === 'success' && data.reference === payment._id && data.amount === payment.amount && data.currency === payment.currency && data.customer?.email?.toLowerCase() === payment.email.toLowerCase()
}
async function body(request) {
  const chunks = []; let size = 0
  for await (const chunk of request) { size += chunk.length; if (size > 65536) throw new Error('Request too large.'); chunks.push(chunk) }
  return Buffer.concat(chunks)
}

export async function createSubscriptions({ database, accounts, verifyToken, send, fetcher = fetch }) {
  const settings = database.collection('subscription_settings')
  const subscriptions = database.collection('subscriptions')
  const payments = database.collection('subscription_payments')
  const notices = database.collection('subscription_notices')
  await subscriptions.createIndex({ expiresAt: 1 })
  const getPlan = () => settings.findOne({ _id: 'plan' })
  const referrals = database.collection('subscription_referrals')
  const commissions = database.collection('referral_commissions')
  await referrals.createIndex({ code: 1 }, { unique: true })
  await commissions.createIndex({ referrerId: 1, createdAt: -1 })
  // Roll out without blocking existing shops until the developer enables billing.
  await settings.updateOne({ _id: 'control' }, { $setOnInsert: { testMode: true } }, { upsert: true })
  const getControl = () => settings.findOne({ _id: 'control' })
  async function access(businessId) {
    const [control, subscription, plan, owner] = await Promise.all([getControl(), subscriptions.findOne({ _id: businessId }), getPlan(), accounts.findOne({ businessId, role: 'owner' })])
    const trialDays = Number(plan?.freeTrialDays ?? 0)
    const createdAtTime = owner?.createdAt ? new Date(owner.createdAt).getTime() : 0
    const trialEndsAt = trialDays > 0 && Number.isFinite(createdAtTime) && createdAtTime > 0
      ? new Date(createdAtTime + trialDays * 86400000).toISOString()
      : null
    const effectiveExpiresAt = subscription?.expiresAt || (trialEndsAt && new Date(trialEndsAt) > new Date() ? trialEndsAt : null)
    return subscriptionAccess({ businessId, testMode: control?.testMode !== false, expiresAt: effectiveExpiresAt, graceMonths: Number(plan?.graceMonths ?? 1), portalUrl: process.env.SUBSCRIPTION_PUBLIC_URL ? appUrl() : '' })
  }
  async function ensureSubscription(businessId) {
    await subscriptions.updateOne({ _id: businessId }, { $setOnInsert: { expiresAt: null, references: [], commissionEvents: [] } }, { upsert: true }).catch(error => { if (error.code !== 11000) throw error })
  }
  const developerEmail = String(process.env.DEVELOPER_EMAIL || '').trim().toLowerCase()
  const isDeveloper = claims => Boolean(developerEmail && claims?.kind === 'access' && claims.role === 'owner' && String(claims.email || '').trim().toLowerCase() === developerEmail)
  const appUrl = () => {
    const url = new URL(process.env.SUBSCRIPTION_PUBLIC_URL)
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('Configure an HTTPS SUBSCRIPTION_PUBLIC_URL.')
    url.pathname = '/'
    url.search = ''
    url.searchParams.set('screen', 'subscription')
    return url.href
  }
  async function referralInfo(businessId) {
    await referrals.updateOne({ _id: businessId }, { $setOnInsert: { code: randomBytes(16).toString('hex') } }, { upsert: true }).catch(error => { if (error.code !== 11000) throw error })
    const referral = await referrals.findOne({ _id: businessId })
    const rows = await commissions.find({ referrerId: businessId }).sort({ createdAt: -1 }).limit(100).toArray()
    const link = new URL(appUrl()); link.searchParams.set('ref', referral.code)
    return { link: link.href, commissions: rows.map(({ _id, amount, currency, percent, kind, createdAt }) => ({ reference: _id, amount, currency, percent, kind, createdAt })) }
  }
  async function listBusinesses(limit = 10, skip = 0) {
    const rows = await accounts.find({ role: 'owner' }).sort({ createdAt: -1 }).skip(Number(skip) || 0).limit(Number(limit) || 10).toArray()
    return rows.map((account) => ({ businessId: account.businessId, ownerName: account.ownerName || account.name || '', email: account.email || '', createdAt: account.createdAt }))
  }
  async function paystack(path, input) {
    if (!process.env.PAYSTACK_SECRET_KEY) throw new Error('Paystack is not configured.')
    const response = await fetcher(`https://api.paystack.co${path}`, { method: input ? 'POST' : 'GET', headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' }, ...(input ? { body: JSON.stringify(input) } : {}), signal: AbortSignal.timeout(20000) })
    const result = await response.json()
    if (!response.ok || !result.status) throw new Error('Paystack request failed. Please try again.')
    return result.data
  }
  async function settle(reference, businessId) {
    const payment = await payments.findOne({ _id: reference, ...(businessId ? { businessId } : {}) })
    if (!payment) throw new Error('Payment reference not found.')
    const data = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`)
    if (!paymentMatches(payment, data)) throw new Error('Payment has not been confirmed for this subscription.')
    // One atomic document update makes concurrent callbacks and retries idempotent.
    await ensureSubscription(payment.businessId)
    const first = { $eq: [{ $size: { $ifNull: ['$references', []] } }, 0] }
    const percent = { $cond: [first, payment.firstReferralPercent || 0, payment.recurringReferralPercent || 0] }
    const basisPoints = { $cond: [first, Math.round((payment.firstReferralPercent || 0) * 100), Math.round((payment.recurringReferralPercent || 0) * 100)] }
    const commission = { reference, referrerId: payment.referrerId || null, currency: payment.currency, percent, kind: { $cond: [first, 'first', 'recurring'] }, amount: { $floor: { $divide: [{ $multiply: [payment.amount, basisPoints] }, 10000] } }, createdAt: '$$NOW' }
    await subscriptions.updateOne({ _id: payment.businessId, references: { $ne: reference } }, [{ $set: { expiresAt: { $add: [{ $max: ['$expiresAt', '$$NOW'] }, payment.days * 86400000] }, references: { $concatArrays: [{ $ifNull: ['$references', []] }, [reference]] }, commissionEvents: { $concatArrays: [{ $ifNull: ['$commissionEvents', []] }, [commission]] } } }])
    // The same atomic update selects the first paid renewal, even with concurrent checkouts.
    const settled = await subscriptions.findOne({ _id: payment.businessId })
    const entry = settled.commissionEvents?.find(item => item.reference === reference)
    let newlyCredited = false
    if (entry?.referrerId) {
      const recorded = await commissions.updateOne({ _id: reference }, { $setOnInsert: entry }, { upsert: true }).catch(error => { if (error.code !== 11000) throw error })
      newlyCredited = Boolean(recorded?.upsertedCount)
    }
    const firstConfirmation = !payment.paidAt
    await payments.updateOne({ _id: reference }, { $set: { paidAt: new Date() } })
    if (firstConfirmation && owner?.email && mailConfigured()) void sendSubscriptionConfirmation({ to: owner.email, amount: payment.amount, currency: payment.currency, expiresAt: settled.expiresAt }).catch(error => console.error('Subscription confirmation email failed:', error.message))
    if (newlyCredited && entry.amount > 0) {
      const referrer = await accounts.findOne({ businessId: entry.referrerId, role: 'owner' })
      if (referrer?.email) void sendReferralBonusNotice({ to: referrer.email, amount: entry.amount, currency: entry.currency, kind: entry.kind }).catch(error => console.error('Referral bonus notice failed:', error.message))
    }
    return { expiresAt: settled.expiresAt }
  }
  async function reminders() {
    const plan = await getPlan()
    if (!plan || !mailConfigured()) return
    const now = new Date()
    for await (const subscription of subscriptions.find({ expiresAt: { $gt: now, $lte: new Date(+now + plan.reminderDays * 86400000) } })) {
      const owner = await accounts.findOne({ businessId: subscription._id, role: 'owner' })
      if (!owner?.email) continue
      const id = `${subscription._id}:${subscription.expiresAt.toISOString()}`
      try { await notices.insertOne({ _id: id, lockedUntil: new Date(Date.now() + 600000), sent: false }) } catch (error) {
        if (error.code !== 11000) throw error
        const claim = await notices.updateOne({ _id: id, sent: false, lockedUntil: { $lt: now } }, { $set: { lockedUntil: new Date(Date.now() + 600000) } })
        if (!claim.modifiedCount) continue
      }
      try {
        await sendSubscriptionReminder({ to: owner.email, expiresAt: subscription.expiresAt, url: appUrl() })
        await notices.updateOne({ _id: id }, { $set: { sent: true, sentAt: new Date() } })
      } catch (error) { await notices.updateOne({ _id: id }, { $set: { lockedUntil: new Date(0) } }); console.error('Subscription reminder failed:', error.message) }
    }
    for await (const subscription of subscriptions.find({ expiresAt: { $lte: now } })) {
      const end = graceEndsAt(subscription.expiresAt, Number(plan.graceMonths ?? 1))
      if (!end || new Date(end) <= now) continue
      const owner = await accounts.findOne({ businessId: subscription._id, role: 'owner' })
      if (!owner?.email) continue
      const id = `grace:${subscription._id}:${new Date(subscription.expiresAt).toISOString()}`
      try { await notices.insertOne({ _id: id, sent: false }) } catch (error) { if (error?.code === 11000) continue; throw error }
      try { await sendSubscriptionGraceNotice({ to: owner.email, expiresAt: new Date(subscription.expiresAt), graceEndsAt: new Date(end), url: appUrl() }); await notices.updateOne({ _id: id }, { $set: { sent: true, sentAt: new Date() } }) } catch (error) { console.error('Subscription grace email failed:', error.message) }
    }
  }
  const timer = setInterval(() => reminders().catch(error => console.error('Reminder scan failed:', error.message)), 3600000)
  timer.unref()
  void reminders().catch(error => console.error('Reminder scan failed:', error.message))
  return async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    if (!url.pathname.startsWith('/v1/subscriptions')) return false
    response.setHeader('Cache-Control', 'no-store')
    const reply = (status, data) => { send(response, status, data); return true }
    try {
      if (url.pathname === '/v1/subscriptions/webhook' && request.method === 'POST') {
        const raw = await body(request)
        if (!validSignature(raw, request.headers['x-paystack-signature'], process.env.PAYSTACK_SECRET_KEY)) return reply(401, { error: 'Invalid signature.' })
        const event = JSON.parse(raw)
        if (event.event === 'charge.success' && await payments.findOne({ _id: event.data.reference })) await settle(event.data.reference)
        return reply(200, { ok: true })
      }
      const claims = verifyToken(request)
      if (url.pathname === '/v1/subscriptions/setup') {
        if (!isDeveloper(claims)) return reply(403, { error: 'Developer account required.' })
        if (request.method === 'PUT') {
          const input = JSON.parse(await body(request))
          const plan = { ...validatePlan(input), ...referralPercentages(input) }
          await settings.updateOne({ _id: 'plan' }, { $set: plan }, { upsert: true })
        } else if (request.method !== 'GET') return reply(405, { error: 'Method not allowed.' })
        return reply(200, { plan: await getPlan(), testMode: (await getControl())?.testMode !== false, paystackConfigured: Boolean(process.env.PAYSTACK_SECRET_KEY), emailConfigured: mailConfigured(), publicUrlConfigured: Boolean(process.env.SUBSCRIPTION_PUBLIC_URL) })
      }
      if (url.pathname.startsWith('/v1/subscriptions/businesses') && request.method === 'GET') {
        if (!isDeveloper(claims)) return reply(403, { error: 'Developer account required.' })
        const params = new URL(request.url, 'http://localhost').searchParams
        const limit = Number(params.get('limit') || '10')
        const skip = Number(params.get('skip') || '0')
        return reply(200, { businesses: await listBusinesses(Math.min(Math.max(limit, 1), 10), Math.max(skip, 0)) })
      }
      if (url.pathname === '/v1/subscriptions/test-mode' && request.method === 'PUT') {
        if (!isDeveloper(claims)) return reply(403, { error: 'Developer account required.' })
        const input = JSON.parse(await body(request))
        if (typeof input.testMode !== 'boolean') return reply(400, { error: 'testMode must be true or false.' })
        if (!input.testMode && !await getPlan()) return reply(409, { error: 'Save a subscription plan before enabling enforcement.' })
        await settings.updateOne({ _id: 'control' }, { $set: { testMode: input.testMode, updatedAt: new Date() } })
        return reply(200, { testMode: input.testMode })
      }
      if (url.pathname === '/v1/subscriptions/access' && request.method === 'GET') {
        if (!claims?.businessId || !['device', 'access'].includes(claims.kind)) return reply(401, { error: 'Sign in or enroll this device.' })
        const authorized = claims.kind === 'device'
          ? await database.collection('devices').findOne({ businessId: claims.businessId, deviceId: claims.deviceId, revokedAt: null })
          : await accounts.findOne({ businessId: claims.businessId, ...(claims.email ? { email: claims.email } : { username: claims.username }) })
        if (!authorized) return reply(403, { error: 'Account or device access was revoked.' })
        return reply(200, await access(claims.businessId))
      }
      if (claims?.kind !== 'access' || claims.role !== 'owner') return reply(403, { error: 'Sign in with your cloud owner account.' })
      const owner = await accounts.findOne({ businessId: claims.businessId, email: claims.email, role: 'owner' })
      if (!owner) return reply(403, { error: 'Owner account not found.' })
      if (url.pathname === '/v1/subscriptions' && request.method === 'GET') return reply(200, { plan: await getPlan(), access: await access(claims.businessId), subscription: await subscriptions.findOne({ _id: claims.businessId }, { projection: { expiresAt: 1, referrerId: 1 } }), isDeveloper: isDeveloper(claims) })
      if (url.pathname === '/v1/subscriptions/referrals' && request.method === 'GET') return reply(200, await referralInfo(claims.businessId))
      if (url.pathname === '/v1/subscriptions/referrals' && request.method === 'POST') {
        const input = JSON.parse(await body(request))
        const referral = await referrals.findOne({ code: String(input.code || '').trim() })
        if (!referral || referral._id === claims.businessId) return reply(400, { error: 'Invalid referral code. You cannot refer your own business.' })
        await ensureSubscription(claims.businessId)
        const bound = await subscriptions.updateOne({ _id: claims.businessId, referrerId: { $exists: false }, referralClosed: { $ne: true }, 'references.0': { $exists: false } }, { $set: { referrerId: referral._id } })
        if (!bound.modifiedCount) return reply(409, { error: 'A referrer is already assigned or your first checkout has started.' })
        return reply(200, { ok: true })
      }
      if (url.pathname === '/v1/subscriptions/checkout' && request.method === 'POST') {
        const plan = await getPlan()
        if (!plan) return reply(409, { error: 'The developer has not configured a subscription plan.' })
        const reference = `sub-${randomBytes(20).toString('hex')}`
        const callback = appUrl()
        await ensureSubscription(claims.businessId)
        const subscription = await subscriptions.findOneAndUpdate({ _id: claims.businessId }, { $set: { referralClosed: true } }, { returnDocument: 'after' })
        await payments.insertOne({ ...validatePlan(plan), ...referralPercentages(plan), referrerId: subscription.referrerId || null, _id: reference, businessId: claims.businessId, email: owner.email, createdAt: new Date() })
        const result = await paystack('/transaction/initialize', { email: owner.email, amount: plan.amount, currency: plan.currency, reference, callback_url: callback })
        return reply(200, { authorizationUrl: result.authorization_url, reference })
      }
      if (url.pathname === '/v1/subscriptions/verify' && request.method === 'POST') {
        const input = JSON.parse(await body(request))
        return reply(200, { subscription: await settle(String(input.reference || ''), claims.businessId) })
      }
      return reply(404, { error: 'Not found.' })
    } catch (error) { return reply(url.pathname.endsWith('/webhook') ? 503 : 400, { error: error.message }) }
  }
}
