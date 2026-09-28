import { randomBytes } from 'node:crypto'

export function createVisitorAccounts({ database, hashPassword, matchesPassword, signToken }) {
  const visitors = database.collection('referral_visitors')
  const referrals = database.collection('subscription_referrals')
  const send = (response, status, data) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(data)); return true }
  const session = visitor => ({ visitor: { id: visitor._id, name: visitor.name, email: visitor.email }, accessToken: signToken({ kind: 'visitor', visitorId: visitor._id, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12 }) })
  return async (request, response, verifyToken, readJson) => {
    const path = new URL(request.url, 'http://localhost').pathname
    if (!path.startsWith('/v1/visitors/')) return false
    if (request.method === 'OPTIONS') return send(response, 204, {})
    if (request.method === 'POST' && path === '/v1/visitors/register') {
      const input = await readJson(request, 8192)
      const name = String(input.name || '').trim(), email = String(input.email || '').trim().toLowerCase(), password = String(input.password || '')
      if (!name || name.length > 100 || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || password.length < 10 || password.length > 256) return send(response, 400, { error: 'Enter your name, a valid email and a password of 10–256 characters.' })
      const id = randomBytes(16).toString('hex')
      const visitor = { _id: id, name, email, passwordHash: hashPassword(password), createdAt: new Date() }
      try { await visitors.insertOne(visitor) } catch (error) { if (error?.code === 11000) return send(response, 409, { error: 'An account already uses this email. Sign in instead.' }); throw error }
      await referrals.insertOne({ _id: `visitor:${id}`, ownerId: id, type: 'visitor', code: randomBytes(16).toString('hex'), createdAt: new Date() })
      return send(response, 201, session(visitor))
    }
    if (request.method === 'POST' && path === '/v1/visitors/login') {
      const input = await readJson(request, 8192), email = String(input.email || '').trim().toLowerCase()
      const visitor = await visitors.findOne({ email })
      if (!visitor || !matchesPassword(String(input.password || ''), visitor.passwordHash)) return send(response, 401, { error: 'Email or password is incorrect.' })
      return send(response, 200, session(visitor))
    }
    if (path === '/v1/visitors/me' && request.method === 'GET') {
      const claims = verifyToken(request)
      if (claims?.kind !== 'visitor' || !claims.visitorId) return send(response, 401, { error: 'Sign in to your promoter account.' })
      const visitor = await visitors.findOne({ _id: claims.visitorId })
      if (!visitor) return send(response, 401, { error: 'Promoter account not found.' })
      const referral = await referrals.findOne({ _id: `visitor:${visitor._id}` })
      const commissions = await database.collection('referral_commissions').find({ referrerId: visitor._id, referrerType: 'visitor' }).sort({ createdAt: -1 }).limit(100).toArray()
      const publicUrl = process.env.SUBSCRIPTION_PUBLIC_URL || 'https://stockroom.globalcreest.com/'
      const link = new URL(publicUrl); link.pathname = '/welcome'; link.search = ''; link.searchParams.set('ref', referral.code); link.hash = 'register'
      return send(response, 200, { visitor: { id: visitor._id, name: visitor.name, email: visitor.email }, link: link.href, commissions: commissions.map(({ _id, amount, currency, percent, kind, createdAt }) => ({ reference: _id, amount, currency, percent, kind, createdAt })) })
    }
    return send(response, 404, { error: 'Not found.' })
  }
}
