import { randomUUID } from 'node:crypto'
import { ObjectId } from 'mongodb'

export function createAccountDeletion({ database, accounts, devices, refreshTokens, visitors, verifyToken, graceDays }) {
  const requests = database.collection('account_deletion_requests')
  const periodDays = async () => {
    const value = Number(await graceDays())
    return Number.isInteger(value) && value >= 1 && value <= 365 ? value : 14
  }

  async function identity(claims) {
    if (claims?.kind === 'visitor' && claims.visitorId) {
      const account = await visitors.findOne({ _id: claims.visitorId })
      return account ? { type: 'visitor', subjectId: account._id, account } : null
    }
    if (claims?.kind !== 'access' || !claims.businessId) return null
    let account = claims.sub && ObjectId.isValid(claims.sub) ? await accounts.findOne({ _id: new ObjectId(claims.sub), businessId: claims.businessId }) : null
    if (!account) account = await accounts.findOne({ businessId: claims.businessId, ...(claims.email ? { email: claims.email } : { username: claims.username }), role: claims.role })
    return account ? { type: account.role === 'owner' ? 'business' : 'account', subjectId: account._id, businessId: account.businessId, account } : null
  }

  const pendingFor = ({ type, subjectId, businessId }) => type === 'business'
    ? requests.findOne({ type, businessId, status: { $in: ['pending', 'processing'] } })
    : requests.findOne({ type, subjectId, status: { $in: ['pending', 'processing'] } })

  async function present(claims) {
    const who = await identity(claims)
    if (!who) return null
    const request = await pendingFor(who)
    return request ? { status: 'pending', requestedAt: request.requestedAt, scheduledFor: request.scheduledFor, graceDays: request.graceDays, scope: request.type } : { status: 'active', graceDays: await periodDays() }
  }

  async function handle(request, response) {
    const url = new URL(request.url, 'http://localhost')
    if (url.pathname !== '/v1/account-deletion/me') return false
    const claims = verifyToken(request)
    const who = await identity(claims)
    if (!who) { response.writeHead(401, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'Sign in to manage account closure.' })); return true }
    if (who.type === 'account') { response.writeHead(403, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'Only the owner can manage staff access. Staff cannot request account deletion.' })); return true }
    response.setHeader('Cache-Control', 'no-store')
    if (request.method === 'GET') {
      const result = await present(claims)
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(result)); return true
    }
    if (request.method !== 'POST') { response.writeHead(405, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'Method not allowed.' })); return true }
    let input
    try { input = await new Promise((resolve, reject) => { let data = ''; request.on('data', chunk => { data += chunk; if (data.length > 4096) reject(new Error('Request too large.')) }); request.on('end', () => { try { resolve(JSON.parse(data || '{}')) } catch { reject(new Error('Invalid JSON.')) } }) }) }
    catch (error) { response.writeHead(400, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: error.message })); return true }
    if (!input || typeof input !== 'object' || Array.isArray(input)) { response.writeHead(400, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'Send an account closure action.' })); return true }
    const action = String(input.action || '')
    if (action === 'request') {
      if (input.confirmation !== 'DELETE') { response.writeHead(400, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'Type DELETE to confirm your request.' })); return true }
      if (await pendingFor(who)) { response.writeHead(409, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'An account deletion request is already pending.' })); return true }
      const days = await periodDays(), now = new Date(), scheduledFor = new Date(now.getTime() + days * 86_400_000)
      const saved = { _id: randomUUID(), type: who.type, subjectId: who.subjectId, ...(who.businessId ? { businessId: who.businessId } : {}), requestedAt: now, scheduledFor, graceDays: days, status: 'pending' }
      await requests.insertOne(saved)
      if (who.type === 'business') {
        const activeDevices = await devices.find({ businessId: who.businessId, revokedAt: null }).project({ deviceId: 1, _id: 0 }).toArray()
        saved.revokedDeviceIds = activeDevices.map(row => row.deviceId)
        await requests.updateOne({ _id: saved._id }, { $set: { revokedDeviceIds: saved.revokedDeviceIds } })
        await devices.updateMany({ businessId: who.businessId, revokedAt: null }, { $set: { revokedAt: now, deletionRequestId: saved._id } })
      }
      response.writeHead(201, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ status: 'pending', requestedAt: now, scheduledFor, graceDays: days, scope: who.type })); return true
    }
    if (action === 'cancel') {
      const saved = await pendingFor(who)
      if (!saved) { response.writeHead(404, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'There is no pending deletion request to cancel.' })); return true }
      const cancelledAt = new Date()
      const result = await requests.updateOne({ _id: saved._id, status: 'pending', scheduledFor: { $gt: cancelledAt } }, { $set: { status: 'cancelled', cancelledAt }, $unset: { subjectId: '', businessId: '' } })
      if (!result.modifiedCount) { response.writeHead(409, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'The request is being finalized and can no longer be cancelled.' })); return true }
      if (saved.type === 'business' && saved.revokedDeviceIds?.length) await devices.updateMany({ businessId: saved.businessId, deviceId: { $in: saved.revokedDeviceIds }, deletionRequestId: saved._id }, { $unset: { revokedAt: '', deletionRequestId: '' } })
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ status: 'active', cancelledAt })); return true
    }
    response.writeHead(400, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'Choose request or cancel.' })); return true
  }

  async function blocked(request) {
    const claims = verifyToken(request)
    if (!claims) return null
    const url = new URL(request.url, 'http://localhost')
    if (['/v1/account-deletion/me', '/v1/auth/refresh'].includes(url.pathname)) return null
    if (url.pathname === '/v1/devices/enroll' && claims.kind === 'access' && claims.role === 'owner') return null
    if (claims.kind === 'device' && claims.businessId) {
      const closing = await requests.findOne({ type: 'business', businessId: claims.businessId, status: { $in: ['pending', 'processing'] } })
      return closing ? 'This business is inactive while its account deletion request is pending.' : null
    }
    const who = await identity(claims)
    if (!who) return null
    if (who.businessId) {
      const closing = await requests.findOne({ type: 'business', businessId: who.businessId, status: { $in: ['pending', 'processing'] } })
      if (closing) return 'This business is inactive while its account deletion request is pending. The owner can cancel the request before its scheduled date.'
    }
    const pending = await pendingFor(who)
    return pending ? 'This account is inactive while its deletion request is pending. Open Account deletion to cancel before its scheduled date.' : null
  }

  async function eraseNotifications(recipientKeys) {
    for (const name of ['app_notifications', 'push_subscriptions', 'fcm_push_subscriptions']) await database.collection(name).deleteMany({ recipientKey: { $in: recipientKeys } })
  }

  async function erase(request) {
    if (request.type === 'business') {
      const businessId = request.businessId
      const accountIds = (await accounts.find({ businessId }).project({ _id: 1 }).toArray()).map(row => row._id)
      await eraseNotifications(accountIds.map(id => `account:${id}`))
      const scoped = ['accounts', 'devices', 'business_settings', 'sync_operations', 'sync_entity_heads', 'subscription_payments', 'google_play_purchases', 'enterprise_subscription_requests', 'business_registration_keys', 'auth_refresh_tokens', 'inventory_alert_state', 'supermarket_resources', 'supermarket_admissions', 'product_form_ocr_usage']
      for (const name of scoped) await database.collection(name).deleteMany({ businessId })
      const prefix = `^${businessId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`
      for (const name of ['supermarket_admissions', 'product_form_ocr_usage']) await database.collection(name).deleteMany({ _id: { $regex: prefix } })
      await database.collection('password_resets').deleteMany({ accountId: { $in: accountIds } })
      await database.collection('subscriptions').deleteOne({ _id: businessId })
      await database.collection('subscription_notices').deleteMany({ _id: { $regex: `^${businessId}:` } })
      await database.collection('business_exit_payments').deleteMany({ $or: [{ businessId }, { _id: businessId }] })
      await database.collection('subscription_referrals').deleteOne({ _id: businessId })
      await database.collection('referral_commissions').updateMany({ referrerId: businessId, referrerType: 'business' }, { $unset: { referrerName: '', referrerEmail: '' } })
      await database.collection('subscriptions').updateMany({ referrerId: businessId }, { $unset: { referrerId: '', referrerType: '' } })
      await database.collection('referral_wallets').deleteMany({ referrerId: businessId, referrerType: 'business' })
      await database.collection('referral_payout_profiles').deleteMany({ referrerId: businessId, referrerType: 'business' })
      await database.collection('referral_payouts').updateMany({ referrerId: businessId, referrerType: 'business' }, { $unset: { referrerName: '', referrerEmail: '', recipientCode: '' } })
      await requests.deleteMany({ businessId, _id: { $ne: request._id } })
    } else if (request.type === 'account') {
      await eraseNotifications([`account:${request.subjectId}`])
      await accounts.deleteOne({ _id: request.subjectId })
      await refreshTokens.deleteMany({ accountId: request.subjectId })
      await database.collection('password_resets').deleteMany({ accountId: request.subjectId })
    } else if (request.type === 'visitor') {
      const id = String(request.subjectId)
      await eraseNotifications([`visitor:${id}`])
      await visitors.deleteOne({ _id: id })
      await database.collection('subscription_referrals').deleteOne({ _id: `visitor:${id}` })
      await database.collection('referral_commissions').updateMany({ referrerId: id, referrerType: 'visitor' }, { $unset: { referrerName: '', referrerEmail: '' } })
      await database.collection('subscriptions').updateMany({ referrerId: id, referrerType: 'visitor' }, { $unset: { referrerId: '', referrerType: '' } })
      await database.collection('referral_payouts').updateMany({ referrerId: id, referrerType: 'visitor' }, { $unset: { referrerName: '', referrerEmail: '', recipientCode: '' } })
      await database.collection('referral_wallets').deleteMany({ referrerId: id, referrerType: 'visitor' })
      await database.collection('referral_payout_profiles').deleteMany({ referrerId: id, referrerType: 'visitor' })
    }
    await requests.updateOne({ _id: request._id }, { $set: { status: 'completed', completedAt: new Date() }, $unset: { subjectId: '', businessId: '', revokedDeviceIds: '' } })
  }

  async function processDue() {
    const now = new Date()
    await requests.updateMany({ status: 'processing', processingAt: { $lt: new Date(now.getTime() - 10 * 60_000) } }, { $set: { status: 'pending' }, $unset: { processingAt: '' } })
    const due = await requests.find({ status: 'pending', scheduledFor: { $lte: now } }).limit(20).toArray()
    for (const row of due) {
      const claimed = await requests.updateOne({ _id: row._id, status: 'pending', scheduledFor: { $lte: now } }, { $set: { status: 'processing', processingAt: now } })
      if (!claimed.modifiedCount) continue
      try { await erase(row) }
      catch (error) {
        console.error('Scheduled account deletion failed; it will be retried.', error instanceof Error ? error.message : 'Unknown error.')
        await requests.updateOne({ _id: row._id, status: 'processing' }, { $set: { status: 'pending', lastAttemptAt: new Date() }, $unset: { processingAt: '' } })
      }
    }
  }

  void processDue().catch(error => console.error('Could not process scheduled account deletions.', error instanceof Error ? error.message : 'Unknown error.'))
  const worker = setInterval(() => { void processDue().catch(error => console.error('Could not process scheduled account deletions.', error instanceof Error ? error.message : 'Unknown error.')) }, 15 * 60_000)
  worker.unref?.()
  return { handle, blocked, processDue }
}
