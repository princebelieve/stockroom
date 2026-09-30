import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { mailConfigured, sendReferralBonusNotice, sendSubscriptionConfirmation, sendSubscriptionGraceNotice, sendSubscriptionReminder } from './mailer.mjs'
import { graceDaysEndsAt, graceEndsAt, subscriptionAccess, referralPercentages } from '../server/subscription-policy.mjs'

export function validatePlan(input) {
  const plan = {
    amount: Number(input.amount),
    currency: String(input.currency || '').toUpperCase(),
    days: Number(input.days),
    reminderDays: Number(input.reminderDays),
    freeTrialDays: Number(input.freeTrialDays ?? 0),
  }
  if (!Number.isSafeInteger(plan.amount) || plan.amount < 1 || plan.amount > 1000000000 || !['NGN', 'GHS', 'ZAR', 'KES', 'USD', 'XOF'].includes(plan.currency) || !Number.isInteger(plan.days) || plan.days < 1 || plan.days > 730 || !Number.isInteger(plan.reminderDays) || plan.reminderDays < 1 || plan.reminderDays > 30 || !Number.isInteger(plan.freeTrialDays) || plan.freeTrialDays < 0 || plan.freeTrialDays > 365) throw new Error('Enter a valid amount in minor units, currency, duration (1–730 days), reminder window (1–30 days), and free-trial days (0–365).')
  if (input.graceDays !== undefined) {
    plan.graceDays = Number(input.graceDays)
    if (!Number.isInteger(plan.graceDays) || plan.graceDays < 0 || plan.graceDays > 365) throw new Error('Monthly grace period must be between 0 and 365 days.')
  } else {
    plan.graceMonths = Number(input.graceMonths ?? 1)
    if (!Number.isInteger(plan.graceMonths) || plan.graceMonths < 0 || plan.graceMonths > 12) throw new Error('Yearly and Enterprise grace period must be between 0 and 12 months.')
  }
  if (plan.currency === 'USD' && plan.amount < 200) throw new Error('USD subscription prices must be at least 200 cents ($2.00).')
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

export async function createSubscriptions({ database, accounts, verifyToken, send, fetcher = fetch, handlePayoutWebhook = async () => false }) {
  const settings = database.collection('subscription_settings')
  const subscriptions = database.collection('subscriptions')
  const payments = database.collection('subscription_payments')
  const notices = database.collection('subscription_notices')
  const enterpriseRequests = database.collection('enterprise_subscription_requests')
  const businessExits = database.collection('business_exit_payments')
  await businessExits.createIndex({ reference: 1 }, { unique: true, sparse: true })
  await subscriptions.createIndex({ expiresAt: 1 })
  const getPlan = () => settings.findOne({ _id: 'plan' })
  const getPlans = async () => {
    const saved = await getPlan()
    if (!saved) return []
    if (Array.isArray(saved.plans)) return saved.plans
    return [{ ...saved, id: 'monthly', name: 'Monthly' }]
  }
  async function currentEnterpriseRequest(businessId) {
    const rows = await enterpriseRequests.find({ businessId }).sort({ createdAt: -1 }).limit(20).toArray()
    return rows.find(row => row.status === 'pending' || row.status === 'approved') || null
  }
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
    const legacyTrialEndsAt = subscription?.trialConfigured !== true && !subscription?.expiresAt && trialDays > 0 && Number.isFinite(createdAtTime) && createdAtTime > 0
      ? new Date(createdAtTime + trialDays * 86400000).toISOString()
      : null
    const trialEndsAt = subscription?.trialEndsAt || legacyTrialEndsAt
    const isTrial = !subscription?.expiresAt && Boolean(trialEndsAt)
    const playActive = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED'].includes(subscription?.playSubscriptionState) && subscription?.playExpiresAt && new Date(subscription.playExpiresAt) > new Date()
    const playIsLater = Boolean(playActive && (!subscription?.expiresAt || new Date(subscription.playExpiresAt) > new Date(subscription.expiresAt)))
    const effectiveExpiresAt = playIsLater ? subscription.playExpiresAt : subscription?.expiresAt || trialEndsAt
    const planId = playIsLater ? subscription.playPlanId : subscription?.planId || (isTrial ? 'trial' : null)
    const graceDays = isTrial ? 0 : playIsLater ? (planId === 'monthly' ? Number(subscription.playGraceDays ?? plan?.monthlyGraceDays ?? 30) : undefined) : planId === 'monthly' && subscription?.graceMonths === undefined ? Number(subscription?.graceDays ?? plan?.monthlyGraceDays ?? Number(plan?.monthlyGraceMonths ?? plan?.graceMonths ?? 1) * 30) : undefined
    const graceMonths = isTrial ? undefined : playIsLater ? (planId === 'monthly' ? undefined : Number(subscription.playGraceMonths ?? plan?.graceMonths ?? 1)) : planId === 'monthly' ? subscription?.graceMonths : Number(subscription?.graceMonths ?? plan?.graceMonths ?? 1)
    return subscriptionAccess({ businessId, testMode: control?.testMode !== false, expiresAt: effectiveExpiresAt, trialEndsAt, isTrial, planId, graceMonths, graceDays, suspended: Boolean(subscription?.suspendedAt || subscription?.closedAt), suspensionReason: subscription?.closedAt ? 'This business has completed its Stockroom exit.' : subscription?.suspensionReason || '', portalUrl: process.env.SUBSCRIPTION_PUBLIC_URL ? appUrl() : '' })
  }
  async function ensureSubscription(businessId) {
    await subscriptions.updateOne({ _id: businessId }, { $setOnInsert: { expiresAt: null, references: [], commissionEvents: [] } }, { upsert: true }).catch(error => { if (error.code !== 11000) throw error })
  }
  const developerEmail = String(process.env.DEVELOPER_EMAIL || '').trim().toLowerCase()
  const isDeveloper = claims => Boolean(developerEmail && claims?.kind === 'access' && claims.role === 'owner' && String(claims.email || '').trim().toLowerCase() === developerEmail)
  const appUrl = (screen = 'subscription') => {
    const url = new URL(process.env.SUBSCRIPTION_PUBLIC_URL)
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('Configure an HTTPS SUBSCRIPTION_PUBLIC_URL.')
    url.pathname = '/'
    url.search = ''
    url.searchParams.set('screen', screen)
    return url.href
  }
  async function referralInfo(businessId) {
    await referrals.updateOne({ _id: businessId }, { $setOnInsert: { code: randomBytes(16).toString('hex') } }, { upsert: true }).catch(error => { if (error.code !== 11000) throw error })
    const referral = await referrals.findOne({ _id: businessId })
    const rows = await commissions.find({ referrerId: businessId, $or: [{ referrerType: 'business' }, { referrerType: { $exists: false } }] }).sort({ createdAt: -1 }).limit(100).toArray()
    const link = new URL(appUrl('register')); link.searchParams.set('ref', referral.code)
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
    if (!response.ok || !result.status) {
      const reason = String(result.message || '').toLowerCase()
      if (reason.includes('currency') && (reason.includes('support') || reason.includes('enabled'))) throw new Error('This subscription currency is not enabled for the payment account. Please contact Stockroom support.')
      throw new Error('Paystack request failed. Please try again.')
    }
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
    const underRewardLimit = { $lt: [{ $size: { $ifNull: ['$references', []] } }, 4] }
    const percent = { $cond: [underRewardLimit, { $cond: [first, payment.firstReferralPercent || 0, payment.recurringReferralPercent || 0] }, 0] }
    const basisPoints = { $cond: [underRewardLimit, { $cond: [first, Math.round((payment.firstReferralPercent || 0) * 100), Math.round((payment.recurringReferralPercent || 0) * 100)] }, 0] }
    const commission = { reference, referrerId: { $cond: [underRewardLimit, payment.referrerId || null, null] }, referrerType: { $cond: [underRewardLimit, payment.referrerType || 'business', null] }, currency: payment.currency, percent, kind: { $cond: [underRewardLimit, { $cond: [first, 'first', 'recurring'] }, 'exhausted'] }, amount: { $floor: { $divide: [{ $multiply: [payment.amount, basisPoints] }, 10000] } }, createdAt: '$$NOW' }
    const paymentAccess = { ...(payment.planId ? { planId: payment.planId } : {}), ...(Number.isInteger(payment.graceDays) ? { graceDays: payment.graceDays } : {}), ...(Number.isInteger(payment.graceMonths) ? { graceMonths: payment.graceMonths } : {}), trialEndsAt: null }
    await subscriptions.updateOne({ _id: payment.businessId, references: { $ne: reference } }, [{ $set: { expiresAt: { $add: [{ $max: [{ $ifNull: ['$expiresAt', '$trialEndsAt'] }, { $ifNull: ['$playExpiresAt', '$$NOW'] }, '$$NOW'] }, payment.days * 86400000] }, references: { $concatArrays: [{ $ifNull: ['$references', []] }, [reference]] }, commissionEvents: { $concatArrays: [{ $ifNull: ['$commissionEvents', []] }, [commission]] }, ...paymentAccess } }])
    // The same atomic update selects the first paid renewal, even with concurrent checkouts.
    const settled = await subscriptions.findOne({ _id: payment.businessId })
    const entry = settled.commissionEvents?.find(item => item.reference === reference)
    let newlyCredited = false
    if (entry?.referrerId) {
      const recorded = await commissions.updateOne({ _id: reference }, { $setOnInsert: entry }, { upsert: true }).catch(error => { if (error.code !== 11000) throw error })
      newlyCredited = Boolean(recorded?.upsertedCount)
    }
    const firstConfirmation = !payment.paidAt
    const paymentOwner = firstConfirmation && mailConfigured() ? await accounts.findOne({ businessId: payment.businessId, role: 'owner' }) : null
    await payments.updateOne({ _id: reference }, { $set: { paidAt: new Date() } })
    if (payment.enterpriseRequestId) await enterpriseRequests.updateOne({ _id: payment.enterpriseRequestId, status: 'approved' }, { $set: { status: 'paid', paidAt: new Date(), paymentReference: reference } })
    if (paymentOwner?.email) void sendSubscriptionConfirmation({ to: paymentOwner.email, amount: payment.amount, currency: payment.currency, expiresAt: settled.expiresAt }).catch(error => console.error('Subscription confirmation email failed:', error.message))
    if (newlyCredited && entry.amount > 0) {
      const referrer = entry.referrerType === 'visitor' ? await database.collection('referral_visitors').findOne({ _id: entry.referrerId }) : await accounts.findOne({ businessId: entry.referrerId, role: 'owner' })
      if (referrer?.email) void sendReferralBonusNotice({ to: referrer.email, amount: entry.amount, currency: entry.currency, kind: entry.kind }).catch(error => console.error('Referral bonus notice failed:', error.message))
    }
    return { expiresAt: settled.expiresAt }
  }
  async function settleBusinessExit(reference, businessId) {
    const exit = await businessExits.findOne({ _id: businessId, reference, status: 'pending' })
    if (!exit) { const prior = await businessExits.findOne({ _id: businessId }); if (prior?.paidAt && prior.reference === reference) return prior; throw new Error('Export payment reference not found.') }
    const data = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`)
    if (data.status !== 'success' || data.reference !== reference || data.amount !== exit.amount || data.currency !== exit.currency || data.customer?.email?.toLowerCase() !== exit.email.toLowerCase()) throw new Error('Payment has not been confirmed for the export fee.')
    await businessExits.updateOne({ _id: businessId, reference, status: 'pending' }, { $set: { status: 'paid', paidAt: new Date() } })
    return businessExits.findOne({ _id: businessId })
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
      const end = subscription.planId === 'monthly' && Number.isInteger(subscription.graceDays)
        ? graceDaysEndsAt(subscription.expiresAt, subscription.graceDays)
        : graceEndsAt(subscription.expiresAt, Number(subscription.graceMonths ?? (subscription.planId === 'monthly' ? plan.monthlyGraceMonths ?? plan.graceMonths : plan.graceMonths) ?? 1))
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
  async function handle(request, response) {
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
        if (event.event === 'charge.success') {
          const exit = await businessExits.findOne({ reference: event.data.reference, status: 'pending' })
          if (exit) await settleBusinessExit(event.data.reference, exit.businessId)
        }
        if (event.event === 'charge.failed') await businessExits.updateOne({ reference: event.data.reference, status: 'pending' }, { $set: { status: 'failed' } })
        await handlePayoutWebhook(event)
        return reply(200, { ok: true })
      }
      const claims = verifyToken(request)
      if (url.pathname === '/v1/subscriptions/setup') {
        if (!isDeveloper(claims)) return reply(403, { error: 'Developer account required.' })
        if (request.method === 'PUT') {
          const input = JSON.parse(await body(request))
          const registrationKeyDurationDays = Number(input.registrationKeyDurationDays ?? 7)
          if (!Number.isInteger(registrationKeyDurationDays) || registrationKeyDurationDays < 1 || registrationKeyDurationDays > 30) throw new Error('Registration key duration must be from 1 to 30 days.')
          const accountDeletionGraceDays = Number(input.accountDeletionGraceDays ?? 90)
          if (!Number.isInteger(accountDeletionGraceDays) || accountDeletionGraceDays < 1 || accountDeletionGraceDays > 365) throw new Error('Account deletion delay must be from 1 to 365 days.')
          const productExportFeeAmount = Number(input.productExportFeeAmount ?? 0)
          const productExportFeeCurrency = String(input.productExportFeeCurrency || input.currency || 'NGN').toUpperCase()
          if (!Number.isSafeInteger(productExportFeeAmount) || productExportFeeAmount < 0 || productExportFeeAmount > 1000000000 || !['NGN', 'GHS', 'ZAR', 'KES', 'USD', 'XOF'].includes(productExportFeeCurrency)) throw new Error('Product export fee must be a non-negative minor-unit amount and supported currency.')
          const googlePlayProductIds = Object.fromEntries(['monthly', 'yearly', 'enterprise'].map(id => [id, String(input[`play${id[0].toUpperCase()}${id.slice(1)}ProductId`] || '').trim()]).filter(([, value]) => value))
          if (Object.values(googlePlayProductIds).some(value => !/^[a-zA-Z0-9._-]{3,100}$/.test(value))) throw new Error('Google Play product IDs must be 3 to 100 letters, numbers, dots, underscores, or hyphens.')
          const referral = { ...referralPercentages(input), visitorFirstReferralPercent: Number(input.visitorFirstReferralPercent ?? 0), visitorRecurringReferralPercent: Number(input.visitorRecurringReferralPercent ?? 0) }
          for (const value of [referral.visitorFirstReferralPercent, referral.visitorRecurringReferralPercent]) if (!Number.isFinite(value) || value < 0 || value > 100 || Math.round(value * 100) !== value * 100) throw new Error('Visitor referral rates must be from 0 to 100 with up to two decimal places.')
          const plan = input.monthlyAmount === undefined
            ? { ...validatePlan(input), registrationKeyDurationDays, accountDeletionGraceDays, productExportFeeAmount, productExportFeeCurrency, googlePlayProductIds, ...referral }
            : (() => {
              const monthlyGraceDays = Number(input.monthlyGraceDays ?? Number(input.monthlyGraceMonths ?? input.graceMonths ?? 1) * 30)
              const otherGraceMonths = Number(input.graceMonths ?? 1)
              const base = { currency: input.currency, reminderDays: input.reminderDays, freeTrialDays: input.freeTrialDays }
              const plans = [
                { ...validatePlan({ ...base, amount: input.monthlyAmount, days: 30, graceDays: monthlyGraceDays }), id: 'monthly', name: 'Monthly' },
                { ...validatePlan({ ...base, amount: input.yearlyAmount, days: 365, graceMonths: otherGraceMonths }), id: 'yearly', name: 'Yearly' },
                { ...validatePlan({ ...base, amount: input.enterpriseAmount, days: Number(input.enterpriseDays || 365), graceMonths: otherGraceMonths }), id: 'enterprise', name: 'Enterprise' },
              ]
              return { ...plans[0], graceMonths: otherGraceMonths, monthlyGraceDays, registrationKeyDurationDays, accountDeletionGraceDays, productExportFeeAmount, productExportFeeCurrency, googlePlayProductIds, ...referral, plans }
            })()
          await settings.updateOne({ _id: 'plan' }, { $set: plan }, { upsert: true })
        } else if (request.method !== 'GET') return reply(405, { error: 'Method not allowed.' })
        const plan = await getPlan()
        return reply(200, { plan, registrationKeyDurationDays: plan?.registrationKeyDurationDays ?? 7, accountDeletionGraceDays: plan?.accountDeletionGraceDays ?? 90, productExportFeeAmount: plan?.productExportFeeAmount ?? 0, productExportFeeCurrency: plan?.productExportFeeCurrency || plan?.currency || 'NGN', googlePlayProductIds: plan?.googlePlayProductIds || {}, testMode: (await getControl())?.testMode !== false, paystackConfigured: Boolean(process.env.PAYSTACK_SECRET_KEY), emailConfigured: mailConfigured(), publicUrlConfigured: Boolean(process.env.SUBSCRIPTION_PUBLIC_URL) })
      }
      if (url.pathname.startsWith('/v1/subscriptions/businesses') && request.method === 'GET') {
        if (!isDeveloper(claims)) return reply(403, { error: 'Developer account required.' })
        const params = new URL(request.url, 'http://localhost').searchParams
        const limit = Number(params.get('limit') || '10')
        const skip = Number(params.get('skip') || '0')
        return reply(200, { businesses: await listBusinesses(Math.min(Math.max(limit, 1), 10), Math.max(skip, 0)) })
      }
      if (url.pathname === '/v1/subscriptions/enterprise-requests' && request.method === 'GET') {
        if (!isDeveloper(claims)) return reply(403, { error: 'Developer account required.' })
        const rows = await enterpriseRequests.find({}).sort({ createdAt: -1 }).limit(100).toArray()
        return reply(200, { requests: rows.map(({ _id, businessId, ownerName, email, message, status, createdAt, offeredAmount, offeredCurrency, offeredDays, offerNote, approvedAt }) => ({ id: _id, businessId, ownerName, email, message, status, createdAt, offeredAmount, offeredCurrency, offeredDays, offerNote, approvedAt })) })
      }
      if (url.pathname === '/v1/subscriptions/enterprise-requests/approve' && request.method === 'POST') {
        if (!isDeveloper(claims)) return reply(403, { error: 'Developer account required.' })
        const input = JSON.parse(await body(request))
        const requestRow = await enterpriseRequests.findOne({ _id: String(input.requestId || ''), status: 'pending' })
        if (!requestRow) return reply(404, { error: 'Pending enterprise request not found.' })
        const configured = await getPlan()
        if (!configured) return reply(409, { error: 'Save subscription plans before approving an enterprise request.' })
        const offer = validatePlan({ amount: input.amount, currency: input.currency || configured.currency, days: input.days, reminderDays: configured.reminderDays, freeTrialDays: configured.freeTrialDays, graceMonths: configured.graceMonths })
        await enterpriseRequests.updateOne({ _id: requestRow._id, status: 'pending' }, { $set: { status: 'approved', offeredAmount: offer.amount, offeredCurrency: offer.currency, offeredDays: offer.days, offerNote: String(input.note || '').trim().slice(0, 1000), approvedAt: new Date() } })
        return reply(200, { ok: true })
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
      if (url.pathname === '/v1/subscriptions' && request.method === 'GET') return reply(200, { plan: await getPlan(), plans: await getPlans(), access: await access(claims.businessId), subscription: await subscriptions.findOne({ _id: claims.businessId }, { projection: { expiresAt: 1, referrerId: 1 } }), enterpriseRequest: await currentEnterpriseRequest(claims.businessId), isDeveloper: isDeveloper(claims) })
      if (url.pathname === '/v1/subscriptions/business-exit' && request.method === 'GET') {
        const configured = await getPlan(), record = await businessExits.findOne({ _id: claims.businessId })
        const business = await database.collection('business_settings').findOne({ businessId: claims.businessId })
        const hasStarted = Boolean(record?.reference || record?.exportedAt)
        return reply(200, { businessName: business?.settings?.appName || owner.businessName || '', feeAmount: hasStarted ? Number(record.amount) || 0 : Number(configured?.productExportFeeAmount) || 0, feeCurrency: hasStarted ? record.currency : configured?.productExportFeeCurrency || configured?.currency || 'NGN', paid: Boolean(record?.paidAt), exported: Boolean(record?.exportedAt), closed: Boolean(record?.closedAt), paymentStatus: record?.status || 'unpaid' })
      }
      if (url.pathname === '/v1/subscriptions/business-exit/checkout' && request.method === 'POST') {
        const input = JSON.parse(await body(request)), business = await database.collection('business_settings').findOne({ businessId: claims.businessId })
        const businessName = String(business?.settings?.appName || owner.businessName || '').trim()
        if (!businessName || String(input.businessName || '').trim().toLocaleLowerCase() !== businessName.toLocaleLowerCase()) return reply(400, { error: 'Enter the exact business name shown in Business settings to continue.' })
        const configured = await getPlan(), amount = Number(configured?.productExportFeeAmount) || 0, currency = String(configured?.productExportFeeCurrency || configured?.currency || 'NGN')
        let record = await businessExits.findOne({ _id: claims.businessId })
        if (record?.closedAt) return reply(409, { error: 'This business has already completed its Stockroom exit.' })
        if (record?.paidAt || amount === 0) return reply(200, { paid: true, feeAmount: amount, feeCurrency: currency })
        if (!process.env.PAYSTACK_SECRET_KEY) return reply(503, { error: 'Online payment is unavailable. Contact Stockroom support to arrange the export fee.' })
        if (record?.status === 'pending' && record.authorizationUrl) return reply(200, { authorizationUrl: record.authorizationUrl, reference: record.reference, feeAmount: record.amount, feeCurrency: record.currency })
        const reference = `export-${randomBytes(20).toString('hex')}`
        const attempt = { _id: claims.businessId, businessId: claims.businessId, email: owner.email, amount, currency, reference, status: 'initiating', businessName, createdAt: new Date() }
        if (!record) {
          try { await businessExits.insertOne(attempt) }
          catch (error) { if (error?.code === 11000) return reply(409, { error: 'An export payment is already starting. Refresh and try again shortly.' }); throw error }
        } else {
          const reserved = await businessExits.updateOne({ _id: claims.businessId, status: 'failed', paidAt: { $exists: false }, closedAt: { $exists: false } }, { $set: attempt, $unset: { authorizationUrl: '', exportedAt: '' } })
          if (!reserved.modifiedCount) return reply(409, { error: 'An export payment is already starting. Refresh and try again shortly.' })
        }
        try {
          const callback = new URL(appUrl('subscription')); callback.searchParams.set('exit', '1')
          const result = await paystack('/transaction/initialize', { email: owner.email, amount, currency, reference, callback_url: callback.href })
          await businessExits.updateOne({ _id: claims.businessId, reference }, { $set: { status: 'pending', authorizationUrl: result.authorization_url } })
          return reply(200, { authorizationUrl: result.authorization_url, reference, feeAmount: amount, feeCurrency: currency })
        } catch (error) { await businessExits.updateOne({ _id: claims.businessId, reference }, { $set: { status: 'failed', paymentError: error.message } }); throw error }
      }
      if (url.pathname === '/v1/subscriptions/business-exit/verify' && request.method === 'POST') {
        const input = JSON.parse(await body(request)), result = await settleBusinessExit(String(input.reference || ''), claims.businessId)
        return reply(200, { paid: Boolean(result.paidAt), paymentStatus: result.status })
      }
      if (url.pathname === '/v1/subscriptions/business-exit/exported' && request.method === 'POST') {
        const configured = await getPlan(), record = await businessExits.findOne({ _id: claims.businessId })
        if ((Number(configured?.productExportFeeAmount) || 0) > 0 && !record?.paidAt) return reply(402, { error: 'Pay the one-time export fee before downloading products.' })
        await businessExits.updateOne({ _id: claims.businessId }, { $set: { businessId: claims.businessId, amount: Number(record?.amount ?? configured?.productExportFeeAmount) || 0, currency: record?.currency || configured?.productExportFeeCurrency || configured?.currency || 'NGN', exportedAt: new Date() } }, { upsert: true })
        return reply(200, { exported: true })
      }
      if (url.pathname === '/v1/subscriptions/business-exit/close' && request.method === 'POST') {
        const input = JSON.parse(await body(request)), configured = await getPlan(), record = await businessExits.findOne({ _id: claims.businessId })
        const business = await database.collection('business_settings').findOne({ businessId: claims.businessId }), businessName = String(business?.settings?.appName || owner.businessName || '').trim()
        if (String(input.businessName || '').trim().toLocaleLowerCase() !== businessName.toLocaleLowerCase()) return reply(400, { error: 'Enter the exact business name to confirm final exit.' })
        if (!record?.exportedAt || ((Number(record?.amount ?? configured?.productExportFeeAmount) || 0) > 0 && !record.paidAt)) return reply(409, { error: 'Complete the paid product export before final exit.' })
        await businessExits.updateOne({ _id: claims.businessId }, { $set: { closedAt: new Date(), status: 'closed' } })
        await subscriptions.updateOne({ _id: claims.businessId }, { $set: { closedAt: new Date() } }, { upsert: true })
        return reply(200, { closed: true, dataRetained: true })
      }
      if (url.pathname === '/v1/subscriptions/referrals' && request.method === 'GET') return reply(200, await referralInfo(claims.businessId))
      if (url.pathname === '/v1/subscriptions/referrals' && request.method === 'POST') {
        const input = JSON.parse(await body(request))
        const referral = await referrals.findOne({ code: String(input.code || '').trim() })
        if (!referral || referral._id === claims.businessId) return reply(400, { error: 'Invalid referral code. You cannot refer your own business.' })
        await ensureSubscription(claims.businessId)
        const bound = await subscriptions.updateOne({ _id: claims.businessId, referrerId: { $exists: false }, referralClosed: { $ne: true }, 'references.0': { $exists: false } }, { $set: { referrerId: referral.ownerId || referral._id, referrerType: referral.type || 'business' } })
        if (!bound.modifiedCount) return reply(409, { error: 'A referrer is already assigned or your first checkout has started.' })
        return reply(200, { ok: true })
      }
      if (url.pathname === '/v1/subscriptions/checkout' && request.method === 'POST') {
        const input = JSON.parse(await body(request))
        const plan = (await getPlans()).find(item => item.id === String(input.planId || 'monthly'))
        if (!plan) return reply(409, { error: 'The selected subscription plan is unavailable.' })
        if (plan.id === 'enterprise') return reply(409, { error: 'Enterprise plans require an approved proposal.' })
        const reference = `sub-${randomBytes(20).toString('hex')}`
        const callback = appUrl()
        await ensureSubscription(claims.businessId)
        const subscription = await subscriptions.findOneAndUpdate({ _id: claims.businessId }, { $set: { referralClosed: true } }, { returnDocument: 'after' })
        const configuredPlan = await getPlan()
        const rates = subscription.referrerType === 'visitor' ? { firstReferralPercent: configuredPlan?.visitorFirstReferralPercent || 0, recurringReferralPercent: configuredPlan?.visitorRecurringReferralPercent || 0 } : referralPercentages(configuredPlan || plan)
        await payments.insertOne({ ...validatePlan(plan), ...rates, planId: plan.id || 'monthly', referrerId: subscription.referrerId || null, referrerType: subscription.referrerType || 'business', _id: reference, businessId: claims.businessId, email: owner.email, createdAt: new Date() })
        const result = await paystack('/transaction/initialize', { email: owner.email, amount: plan.amount, currency: plan.currency, reference, callback_url: callback })
        return reply(200, { authorizationUrl: result.authorization_url, reference })
      }
      if (url.pathname === '/v1/subscriptions/enterprise-request' && request.method === 'POST') {
        const input = JSON.parse(await body(request))
        if (await currentEnterpriseRequest(claims.businessId)) return reply(409, { error: 'You already have an enterprise request in progress.' })
        const message = String(input.message || '').trim()
        if (message.length > 1000) return reply(400, { error: 'Your message must be 1,000 characters or fewer.' })
        await enterpriseRequests.insertOne({ _id: `enterprise-${randomBytes(16).toString('hex')}`, businessId: claims.businessId, ownerName: owner.ownerName || owner.name || '', email: owner.email, message, status: 'pending', createdAt: new Date() })
        return reply(201, { ok: true })
      }
      if (url.pathname === '/v1/subscriptions/enterprise-checkout' && request.method === 'POST') {
        const requestRow = await currentEnterpriseRequest(claims.businessId)
        if (!requestRow || requestRow.status !== 'approved') return reply(409, { error: 'There is no approved enterprise proposal ready for payment.' })
        const configured = await getPlan()
        const plan = validatePlan({ amount: requestRow.offeredAmount, currency: requestRow.offeredCurrency, days: requestRow.offeredDays, reminderDays: configured?.reminderDays, freeTrialDays: configured?.freeTrialDays, graceMonths: configured?.graceMonths })
        const reference = `sub-${randomBytes(20).toString('hex')}`
        await ensureSubscription(claims.businessId)
        const subscription = await subscriptions.findOneAndUpdate({ _id: claims.businessId }, { $set: { referralClosed: true } }, { returnDocument: 'after' })
        const rates = subscription.referrerType === 'visitor' ? { firstReferralPercent: configured?.visitorFirstReferralPercent || 0, recurringReferralPercent: configured?.visitorRecurringReferralPercent || 0 } : referralPercentages(configured || {})
        await payments.insertOne({ ...plan, ...rates, planId: 'enterprise', enterpriseRequestId: requestRow._id, referrerId: subscription.referrerId || null, referrerType: subscription.referrerType || 'business', _id: reference, businessId: claims.businessId, email: owner.email, createdAt: new Date() })
        const result = await paystack('/transaction/initialize', { email: owner.email, amount: plan.amount, currency: plan.currency, reference, callback_url: appUrl() })
        return reply(200, { authorizationUrl: result.authorization_url, reference })
      }
      if (url.pathname === '/v1/subscriptions/verify' && request.method === 'POST') {
        const input = JSON.parse(await body(request))
        return reply(200, { subscription: await settle(String(input.reference || ''), claims.businessId) })
      }
      return reply(404, { error: 'Not found.' })
    } catch (error) { return reply(url.pathname.endsWith('/webhook') ? 503 : 400, { error: error.message }) }
  }
  handle.access = access
  return handle
}
