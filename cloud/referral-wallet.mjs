import { randomUUID } from 'node:crypto'

const minorCurrencies = new Set(['NGN', 'GHS', 'ZAR', 'KES', 'USD'])
const walletCurrencies = new Set(['NGN', 'GHS', 'ZAR', 'KES', 'USD', 'XOF'])
const recipientTypes = { NGN: 'nuban', GHS: 'ghipss', ZAR: 'basa', KES: 'kepss', USD: 'kepss' }
const walletId = (type, id, currency) => `${type}:${id}:${currency}`

export async function createReferralWallet({ database, accounts, verifyToken }) {
  const visitors = database.collection('referral_visitors')
  const referrals = database.collection('subscription_referrals')
  const subscriptions = database.collection('subscriptions')
  const commissions = database.collection('referral_commissions')
  const payouts = database.collection('referral_payouts')
  const wallets = database.collection('referral_wallets')
  const profiles = database.collection('referral_payout_profiles')

  await Promise.all([
    payouts.createIndex({ referrerType: 1, referrerId: 1, createdAt: -1 }),
    wallets.createIndex({ referrerType: 1, referrerId: 1, currency: 1 }, { unique: true }),
    profiles.createIndex({ referrerType: 1, referrerId: 1, currency: 1 }, { unique: true }),
  ])

  const sendJson = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); return true }
  const autoReady = () => process.env.PAYSTACK_REFERRAL_AUTO_PAYOUTS === 'true' && process.env.PAYSTACK_REFERRAL_WEBHOOK_READY === 'true' && Boolean(process.env.PAYSTACK_SECRET_KEY)
  const authorizedDeveloper = claims => Boolean(process.env.DEVELOPER_EMAIL && claims?.kind === 'access' && claims.role === 'owner' && String(claims.email || '').toLowerCase() === process.env.DEVELOPER_EMAIL.trim().toLowerCase())
  const paystack = async (path, input) => {
    if (!process.env.PAYSTACK_SECRET_KEY) throw new Error('Paystack transfers are not configured.')
    const result = await fetch(`https://api.paystack.co${path}`, { method: input ? 'POST' : 'GET', headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' }, ...(input ? { body: JSON.stringify(input) } : {}), signal: AbortSignal.timeout(20_000) })
    const data = await result.json().catch(() => ({}))
    if (!result.ok || !data.status) throw Object.assign(new Error(data.message || 'Paystack transfer request failed.'), { providerRejected: true })
    return data.data
  }
  async function identity(claims) {
    if (claims?.kind === 'visitor' && claims.visitorId) {
      const row = await visitors.findOne({ _id: claims.visitorId })
      return row ? { id: row._id, type: 'visitor', name: row.name, email: row.email } : null
    }
    if (claims?.kind === 'access' && claims.role === 'owner' && claims.businessId && claims.email) {
      const row = await accounts.findOne({ businessId: claims.businessId, email: claims.email, role: 'owner' })
      return row ? { id: row.businessId, type: 'business', name: row.ownerName || row.name || '', email: row.email } : null
    }
    return null
  }
  async function ensureWallet(referrer, currency) {
    const id = walletId(referrer.type, referrer.id, currency)
    const ownerTypeQuery = referrer.type === 'business' ? { $or: [{ referrerType: 'business' }, { referrerType: { $exists: false } }] } : { referrerType: referrer.type }
    const earned = await commissions.find({ referrerId: referrer.id, ...ownerTypeQuery, currency }).toArray()
    const legacyEarned = earned.reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0)
    await wallets.updateOne({ _id: id }, { $setOnInsert: { referrerId: referrer.id, referrerType: referrer.type, currency, earnedMinor: legacyEarned, paidMinor: 0, reservedMinor: 0, createdAt: new Date() } }, { upsert: true })
    return id
  }
  async function walletSummary(referrer) {
    const ownerTypeQuery = referrer.type === 'business' ? { $or: [{ referrerType: 'business' }, { referrerType: { $exists: false } }] } : { referrerType: referrer.type }
    const [earnedRows, payoutRows, profileRows, referredRows] = await Promise.all([
      commissions.find({ referrerId: referrer.id, ...ownerTypeQuery }).sort({ createdAt: -1 }).limit(500).toArray(),
      payouts.find({ referrerId: referrer.id, referrerType: referrer.type }).sort({ createdAt: -1 }).limit(100).toArray(),
      profiles.find({ referrerId: referrer.id, referrerType: referrer.type }).toArray(),
      subscriptions.find({ referrerId: referrer.id, referrerType: referrer.type }).toArray(),
    ])
    const currencies = [...new Set([...earnedRows.map(row => row.currency), ...payoutRows.map(row => row.currency)].filter(Boolean))]
    const balances = []
    for (const currency of currencies) {
      const earnedMinor = earnedRows.filter(row => row.currency === currency).reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0)
      const rows = payoutRows.filter(row => row.currency === currency)
      const paidMinor = rows.filter(row => row.status === 'paid').reduce((sum, row) => sum + row.amountMinor, 0)
      const reservedMinor = rows.filter(row => ['manual_requested', 'initiating', 'processing', 'awaiting_otp', 'manual_review'].includes(row.status)).reduce((sum, row) => sum + row.amountMinor, 0)
      await ensureWallet(referrer, currency)
      balances.push({ currency, earnedMinor, paidMinor, pendingMinor: reservedMinor, availableMinor: Math.max(0, earnedMinor - paidMinor - reservedMinor) })
    }
    const profileMap = Object.fromEntries(profileRows.map(row => [row.currency, { currency: row.currency, name: row.name, bankName: row.bankName || '', accountLast4: row.accountLast4 || '', automaticReady: Boolean(autoReady() && row.recipientCode && recipientTypes[row.currency]) }]))
    const referral = await referrals.findOne({ _id: referrer.type === 'business' ? referrer.id : `visitor:${referrer.id}` })
    return { referrer, link: referral ? (referrer.type === 'visitor' ? `${process.env.SUBSCRIPTION_PUBLIC_URL || 'https://stockroom.globalcreest.com'}/welcome?ref=${referral.code}#register` : `${process.env.SUBSCRIPTION_PUBLIC_URL || 'https://stockroom.globalcreest.com'}/?screen=register&ref=${referral.code}`) : '', referredBusinesses: referredRows.length, automaticTransfersEnabled: autoReady(), balances, profiles: Object.values(profileMap), commissions: earnedRows.map(({ _id, amount, currency, percent, kind, createdAt }) => ({ reference: _id, amountMinor: amount, currency, percent, kind, createdAt })), payouts: payoutRows.map(({ _id, amountMinor, currency, status, method, reference, note, createdAt, paidAt, automaticError }) => ({ id: _id, amountMinor, currency, status, method: method || '', reference: reference || '', note: note || '', createdAt, paidAt: paidAt || null, automaticError: automaticError || '' })) }
  }
  async function referralsReport() {
    const [businessRows, visitorRows, referredRows, commissionRows, payoutRows, registeredBusinessCount, visitorPromoterCount, referredBusinessCount] = await Promise.all([
      accounts.find({ role: 'owner' }).sort({ createdAt: -1 }).limit(2000).toArray(),
      visitors.find({}).sort({ createdAt: -1 }).limit(2000).toArray(),
      subscriptions.find({ referrerId: { $exists: true } }).sort({ createdAt: -1 }).limit(5000).toArray(),
      commissions.find({}).sort({ createdAt: -1 }).limit(10000).toArray(),
      payouts.find({}).sort({ createdAt: -1 }).limit(5000).toArray(),
      accounts.countDocuments({ role: 'owner' }),
      visitors.countDocuments({}),
      subscriptions.countDocuments({ referrerId: { $exists: true } }),
    ])
    const businessById = new Map(businessRows.map(row => [row.businessId, row]))
    const visitorById = new Map(visitorRows.map(row => [row._id, row]))
    const referrers = new Map()
    for (const row of businessRows) referrers.set(`business:${row.businessId}`, { id: row.businessId, type: 'business', name: row.ownerName || row.name || 'Business owner', email: row.email || '', registered: 0, businesses: [], earnings: {}, payouts: {}, pending: {} })
    for (const row of visitorRows) referrers.set(`visitor:${row._id}`, { id: row._id, type: 'visitor', name: row.name || 'Visitor promoter', email: row.email || '', registered: 0, businesses: [], earnings: {}, payouts: {}, pending: {} })
    for (const row of referredRows) {
      const type = row.referrerType || 'business', id = row.referrerId
      if (!id) continue
      const referrer = type === 'visitor' ? visitorById.get(id) : businessById.get(id)
      const key = `${type}:${id}`
      const entry = referrers.get(key) || { id, type, name: referrer?.ownerName || referrer?.name || 'Referral account', email: referrer?.email || '', registered: 0, businesses: [], earnings: {}, payouts: {} }
      const owner = businessById.get(row._id)
      entry.registered += 1
      entry.businesses.push({ businessId: row._id, ownerName: owner?.ownerName || owner?.name || '', ownerEmail: owner?.email || '', registeredAt: owner?.createdAt || row.createdAt || null, paidSubscriptions: Array.isArray(row.references) ? row.references.length : 0, status: row.expiresAt ? 'paid' : row.trialEndsAt ? 'trial' : 'not paid' })
      referrers.set(key, entry)
    }
    for (const row of commissionRows) {
      const key = `${row.referrerType || 'business'}:${row.referrerId}`
      const entry = referrers.get(key)
      if (entry) entry.earnings[row.currency] = (entry.earnings[row.currency] || 0) + (Number(row.amount) || 0)
    }
    for (const row of payoutRows) {
      const key = `${row.referrerType}:${row.referrerId}`
      const entry = referrers.get(key)
      if (entry && row.status === 'paid') entry.payouts[row.currency] = (entry.payouts[row.currency] || 0) + (Number(row.amountMinor) || 0)
      else if (entry && ['manual_requested', 'initiating', 'processing', 'awaiting_otp', 'manual_review'].includes(row.status)) entry.pending[row.currency] = (entry.pending[row.currency] || 0) + (Number(row.amountMinor) || 0)
    }
    const referredByBusiness = new Map(referredRows.map(row => [row._id, row]))
    const businesses = businessRows.map(owner => {
      const row = referredByBusiness.get(owner.businessId)
      const referrer = row?.referrerType === 'visitor' ? visitorById.get(row.referrerId) : row?.referrerId ? businessById.get(row.referrerId) : null
      return { businessId: owner.businessId, ownerName: owner.ownerName || owner.name || '', ownerEmail: owner.email || '', registeredAt: owner.createdAt || null, paidSubscriptions: Array.isArray(row?.references) ? row.references.length : 0, subscriptionStatus: row?.expiresAt ? 'paid' : row?.trialEndsAt ? 'trial' : 'not paid', suspended: Boolean(row?.suspendedAt), suspensionReason: row?.suspensionReason || '', referredBy: row?.referrerId ? { id: row.referrerId, type: row.referrerType || 'business', name: referrer?.ownerName || referrer?.name || 'Referral account', email: referrer?.email || '' } : null }
    })
    const payoutList = payoutRows.map(row => {
      const referrer = row.referrerType === 'visitor' ? visitorById.get(row.referrerId) : businessById.get(row.referrerId)
      return { id: row._id, referrerType: row.referrerType, referrerName: referrer?.ownerName || referrer?.name || '', referrerEmail: referrer?.email || '', currency: row.currency, amountMinor: row.amountMinor, status: row.status, method: row.method || '', note: row.note || '', paymentNote: row.paymentNote || '', createdAt: row.createdAt, automaticError: row.automaticError || '' }
    })
    return { registeredBusinesses: registeredBusinessCount, referredBusinesses: referredBusinessCount, visitorPromoters: visitorPromoterCount, businesses, referrers: [...referrers.values()].map(entry => ({ ...entry, businesses: entry.businesses.slice(0, 100) })).sort((a, b) => b.registered - a.registered), payouts: payoutList.slice(0, 250), automaticTransfersEnabled: autoReady() }
  }
  async function handle(request, response) {
    const path = new URL(request.url, 'http://localhost').pathname
    if (!path.startsWith('/v1/referral-wallet/') && !path.startsWith('/v1/developer/')) return false
    const claims = verifyToken(request)
    try {
      if (path.startsWith('/v1/developer/')) {
        if (!authorizedDeveloper(claims)) return sendJson(response, 403, { error: 'Developer account required.' })
        if (path === '/v1/developer/overview' && request.method === 'GET') return sendJson(response, 200, await referralsReport())
        const businessMatch = path.match(/^\/v1\/developer\/businesses\/([a-zA-Z0-9_-]+)\/(suspend|restore)$/)
        if (businessMatch && request.method === 'POST') {
          const businessId = businessMatch[1]
          if (businessMatch[2] === 'suspend') {
            const input = await readBody(request), reason = String(input.reason || '').trim().slice(0, 500)
            if (!reason) return sendJson(response, 400, { error: 'Enter a reason for suspending this business.' })
            await subscriptions.updateOne({ _id: businessId }, { $set: { suspendedAt: new Date(), suspendedBy: claims.email, suspensionReason: reason, updatedAt: new Date() } }, { upsert: true })
            return sendJson(response, 200, { ok: true, suspended: true })
          }
          await subscriptions.updateOne({ _id: businessId }, { $unset: { suspendedAt: '', suspendedBy: '', suspensionReason: '' }, $set: { updatedAt: new Date() } })
          return sendJson(response, 200, { ok: true, suspended: false })
        }
        const manualMatch = path.match(/^\/v1\/developer\/payouts\/([a-f0-9-]+)\/manual$/)
        if (manualMatch && request.method === 'POST') {
          const input = await readBody(request)
          const row = await payouts.findOne({ _id: manualMatch[1] })
          const canResolveAmbiguousTransfer = row?.status === 'manual_review' && input.confirmedNotPaid === true
          if (!row || (!['manual_requested', 'failed'].includes(row.status) && !canResolveAmbiguousTransfer)) return sendJson(response, 409, { error: 'This payout is not awaiting a manual payment. Check ambiguous Paystack transfers before resolving them.' })
          const updated = await payouts.updateOne({ _id: row._id, status: row.status }, { $set: { status: 'paid', method: 'manual', paymentNote: String(input.note || '').trim().slice(0, 500), paidAt: new Date(), paidBy: claims.email } })
          if (!updated.modifiedCount) return sendJson(response, 409, { error: 'Payout status changed. Refresh and try again.' })
          const key = await ensureWallet({ id: row.referrerId, type: row.referrerType }, row.currency)
          await wallets.updateOne({ _id: key }, { $inc: { paidMinor: row.amountMinor, reservedMinor: row.status === 'manual_requested' ? -row.amountMinor : 0 } })
          return sendJson(response, 200, { ok: true })
        }
        const otpMatch = path.match(/^\/v1\/developer\/payouts\/([a-f0-9-]+)\/finalize$/)
        if (otpMatch && request.method === 'POST') {
          const input = await readBody(request), row = await payouts.findOne({ _id: otpMatch[1], status: 'awaiting_otp' })
          if (!row || !row.transferCode) return sendJson(response, 409, { error: 'This transfer is not waiting for OTP confirmation.' })
          const result = await paystack('/transfer/finalize_transfer', { transfer_code: row.transferCode, otp: String(input.otp || '') })
          await payouts.updateOne({ _id: row._id, status: 'awaiting_otp' }, { $set: { status: result.status === 'success' ? 'processing' : 'awaiting_otp', updatedAt: new Date() } })
          return sendJson(response, 200, { ok: true, status: result.status })
        }
        return sendJson(response, 404, { error: 'Developer route not found.' })
      }
      const referrer = await identity(claims)
      if (!referrer) return sendJson(response, 401, { error: 'Sign in to your promoter or business owner account.' })
      if (path === '/v1/referral-wallet/me' && request.method === 'GET') return sendJson(response, 200, await walletSummary(referrer))
      if (path === '/v1/referral-wallet/banks' && request.method === 'GET') {
        const currency = new URL(request.url, 'http://localhost').searchParams.get('currency')?.toUpperCase() || ''
        if (!autoReady() || !recipientTypes[currency]) return sendJson(response, 409, { error: 'Automatic Paystack bank lookup is not available; use manual payout.' })
        const result = await paystack(`/bank?currency=${encodeURIComponent(currency)}&perPage=100`)
        return sendJson(response, 200, { banks: (Array.isArray(result) ? result : []).filter(bank => bank.active !== false).map(bank => ({ name: bank.name, code: bank.code })) })
      }
      if (path === '/v1/referral-wallet/profile' && request.method === 'POST') {
        if (!autoReady()) return sendJson(response, 409, { error: 'Automatic Paystack transfers are not enabled. You can still request a manual payout.' })
        const input = await readBody(request), currency = String(input.currency || '').toUpperCase(), type = recipientTypes[currency]
        const name = String(input.name || '').trim(), accountNumber = String(input.accountNumber || '').replace(/\s/g, ''), bankCode = String(input.bankCode || '').trim()
        if (!type || !minorCurrencies.has(currency) || !name || name.length > 100 || !/^\d{6,20}$/.test(accountNumber) || !bankCode || bankCode.length > 30) return sendJson(response, 400, { error: 'Enter a supported payout currency, account holder, account number and bank code.' })
        const recipient = await paystack('/transferrecipient', { type, name, account_number: accountNumber, bank_code: bankCode, currency })
        await profiles.updateOne({ referrerId: referrer.id, referrerType: referrer.type, currency }, { $set: { referrerId: referrer.id, referrerType: referrer.type, currency, name, bankName: recipient.details?.bank_name || '', accountLast4: accountNumber.slice(-4), recipientCode: recipient.recipient_code, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true })
        return sendJson(response, 200, { ok: true, profile: { currency, name, bankName: recipient.details?.bank_name || '', accountLast4: accountNumber.slice(-4), automaticReady: true } })
      }
      if (path === '/v1/referral-wallet/payouts' && request.method === 'POST') {
        const input = await readBody(request), currency = String(input.currency || '').toUpperCase(), amountMinor = Number(input.amountMinor)
        if (!walletCurrencies.has(currency) || !Number.isSafeInteger(amountMinor) || amountMinor < 1) return sendJson(response, 400, { error: 'Choose a supported currency and enter an amount greater than zero.' })
        const walletKey = await ensureWallet(referrer, currency)
        const ownerTypeQuery = referrer.type === 'business' ? { $or: [{ referrerType: 'business' }, { referrerType: { $exists: false } }] } : { referrerType: referrer.type }
        const earnedRows = await commissions.find({ referrerId: referrer.id, ...ownerTypeQuery, currency }).toArray()
        const earned = earnedRows.reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0)
        await wallets.updateOne({ _id: walletKey }, { $max: { earnedMinor: earned } })
        const reserved = await wallets.updateOne({ _id: walletKey, $expr: { $gte: [{ $subtract: [{ $subtract: ['$earnedMinor', '$paidMinor'] }, '$reservedMinor'] }, amountMinor] } }, { $inc: { reservedMinor: amountMinor } })
        if (!reserved.modifiedCount) return sendJson(response, 409, { error: 'The requested amount is higher than your available referral balance.' })
        const id = randomUUID(), profile = await profiles.findOne({ referrerId: referrer.id, referrerType: referrer.type, currency })
        const automatic = autoReady() && Boolean(profile?.recipientCode && recipientTypes[currency])
        const row = { _id: id, referrerId: referrer.id, referrerType: referrer.type, currency, amountMinor, status: automatic ? 'initiating' : 'manual_requested', method: automatic ? 'paystack' : 'manual', note: String(input.note || '').trim().slice(0, 300), createdAt: new Date(), ...(automatic ? { reference: `ref-${id}` } : {}) }
        try { await payouts.insertOne(row) }
        catch (error) {
          await wallets.updateOne({ _id: walletKey }, { $inc: { reservedMinor: -amountMinor } }).catch(() => {})
          throw error
        }
        if (automatic) {
          try {
            const transfer = await paystack('/transfer', { source: 'balance', amount: amountMinor, recipient: profile.recipientCode, reference: `ref-${id}`, currency, reason: 'Stockroom referral reward' })
            await payouts.updateOne({ _id: id, status: 'initiating' }, { $set: { transferCode: transfer.transfer_code || '', status: transfer.status === 'otp' ? 'awaiting_otp' : 'processing', updatedAt: new Date() } })
            return sendJson(response, 202, { ok: true, mode: 'paystack', status: transfer.status === 'otp' ? 'awaiting_otp' : 'processing', message: transfer.status === 'otp' ? 'Paystack requires transfer OTP approval. The developer will need to confirm it.' : 'Paystack transfer started. The wallet will update when Paystack confirms it.' })
          } catch (error) {
            const providerRejected = Boolean(error?.providerRejected)
            const updated = await payouts.updateOne({ _id: id, status: 'initiating' }, { $set: { status: providerRejected ? 'manual_requested' : 'manual_review', method: providerRejected ? 'manual' : 'paystack', automaticError: String(error.message || 'Paystack transfer could not start.').slice(0, 300), updatedAt: new Date() }, $unset: { transferCode: '' } })
            if (!updated.modifiedCount) return sendJson(response, 202, { ok: true, mode: 'paystack', status: 'processing', message: 'Paystack has already notified Stockroom that the transfer is processing.' })
            if (!providerRejected) return sendJson(response, 202, { ok: true, mode: 'review', status: 'manual_review', message: 'Paystack did not confirm whether it received the transfer request. The amount is held while this is checked to prevent a duplicate payment.' })
          }
        }
        return sendJson(response, 202, { ok: true, mode: 'manual', status: 'manual_requested', message: automatic ? 'Paystack rejected the transfer request. Your payout is saved for manual payment.' : 'Your manual payout request is saved for review.' })
      }
      return sendJson(response, 404, { error: 'Wallet route not found.' })
    } catch (error) { return sendJson(response, 400, { error: error instanceof Error ? error.message : 'Wallet request failed.' }) }
  }
  async function readBody(request) {
    let raw = ''
    for await (const chunk of request) { raw += chunk; if (raw.length > 16_384) throw new Error('Request is too large.') }
    return JSON.parse(raw || '{}')
  }
  async function handleWebhook(event) {
    if (!['transfer.success', 'transfer.failed', 'transfer.reversed'].includes(event?.event)) return false
    const row = await payouts.findOne({ reference: event.data?.reference })
    if (!row || row.status === 'paid' && event.event === 'transfer.success') return true
    if (event.event === 'transfer.success') {
      const updated = await payouts.updateOne({ _id: row._id, status: { $in: ['processing', 'awaiting_otp', 'initiating'] } }, { $set: { status: 'paid', paidAt: new Date(), method: 'paystack', updatedAt: new Date() } })
      if (updated.modifiedCount) await wallets.updateOne({ _id: walletId(row.referrerType, row.referrerId, row.currency) }, { $inc: { paidMinor: row.amountMinor, reservedMinor: -row.amountMinor } })
    } else if (event.event === 'transfer.reversed' && row.status === 'paid') {
      const updated = await payouts.updateOne({ _id: row._id, status: 'paid' }, { $set: { status: 'reversed', automaticError: String(event.data?.reason || event.event), updatedAt: new Date() } })
      if (updated.modifiedCount) await wallets.updateOne({ _id: walletId(row.referrerType, row.referrerId, row.currency) }, { $inc: { paidMinor: -row.amountMinor } })
    } else {
      const updated = await payouts.updateOne({ _id: row._id, status: { $in: ['processing', 'awaiting_otp', 'initiating'] } }, { $set: { status: event.event === 'transfer.reversed' ? 'reversed' : 'failed', automaticError: String(event.data?.reason || event.event), updatedAt: new Date() } })
      if (updated.modifiedCount) await wallets.updateOne({ _id: walletId(row.referrerType, row.referrerId, row.currency) }, { $inc: { reservedMinor: -row.amountMinor } })
    }
    return true
  }
    return { handle, handleWebhook }
}
