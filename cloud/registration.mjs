import { createHash, randomBytes, randomUUID } from 'node:crypto'

export const registrationKeyHash = key => createHash('sha256').update(String(key || '').trim()).digest('hex')
export async function canIssueRegistrationKey(claims, developerEmail, accounts) {
  const developer = String(developerEmail || '').trim().toLowerCase()
  return Boolean(developer && claims?.kind === 'access' && claims.role === 'owner' && String(claims.email).toLowerCase() === developer && await accounts.findOne({ email: developer, businessId: claims.businessId, role: 'owner' }))
}
export function registrationInput(input) {
  const email = String(input.email || '').trim().toLowerCase()
  const businessName = String(input.businessName || '').trim()
  const slug = businessName.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'business'
  const businessId = `${slug}-${randomBytes(5).toString('hex')}`
  const expiresInDays = Number(input.expiresInDays ?? 7)
  if (!/^[a-z0-9][a-z0-9-]{2,80}$/.test(businessId) || !/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || !businessName || businessName.length > 60 || !Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 30) throw new Error('Enter a business ID, business name, owner email, and validity of 1–30 days.')
  return { businessId, email, businessName, expiresInDays }
}

export async function createRegistration({ database, client, accounts, hashPassword }) {
  const keys = database.collection('business_registration_keys')
  await keys.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
  return {
    async issue(input) {
      const details = registrationInput(input)
      if (await accounts.findOne({ email: details.email })) throw new Error('This owner email is already registered. Use existing-business sign-in.')
      const prefix = details.businessId.slice(0, details.businessId.lastIndexOf('-'))
      let uniqueId = false
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = `${prefix}-${randomBytes(5).toString('hex')}`
        if (!(await accounts.findOne({ businessId: candidate })) && !(await keys.findOne({ businessId: candidate }))) {
          details.businessId = candidate
          uniqueId = true
          break
        }
      }
      if (!uniqueId) throw new Error('Could not generate a unique business ID. Please try again.')
      const key = `SBIT-${randomBytes(24).toString('hex')}`
      const expiresAt = new Date(Date.now() + details.expiresInDays * 86400000)
      await keys.insertOne({ _id: registrationKeyHash(key), ...details, expiresAt, createdAt: new Date(), usedAt: null })
      return { key, ...details, expiresAt }
    },
    async redeem(input) {
      const ownerName = String(input.ownerName || '').trim()
      const email = String(input.email || '').trim().toLowerCase()
      const password = String(input.password || '')
      const code = String(input.referralCode || '').trim()
      const currency = String(input.currency || 'USD')
      if (!['NGN', 'USD', 'GHS', 'ZAR', 'KES', 'XOF'].includes(currency)) throw new Error('Choose a supported currency.')
      if (!ownerName || ownerName.length > 100 || password.length < 10 || password.length > 256 || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter your name, registered owner email, and a password of 10–256 characters.')
      if (!/^SBIT-[a-f0-9]{48}$/.test(String(input.key || '').trim())) throw new Error('Registration key is invalid or expired.')
      const passwordHash = hashPassword(password)
      return client.withSession(session => session.withTransaction(async () => {
        const grant = await keys.findOneAndUpdate({ _id: registrationKeyHash(input.key), email, usedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } }, { session, returnDocument: 'after' })
        if (!grant) throw new Error('Registration key is invalid, expired, already used, or issued to another email.')
        let referrer = null
        if (code) {
          referrer = await database.collection('subscription_referrals').findOne({ code }, { session })
          if (!referrer || referrer._id === grant.businessId) throw new Error('The referral code is invalid.')
        }
        const accountCreatedAt = new Date()
        const account = { businessId: grant.businessId, ownerName, name: ownerName, email, role: 'owner', passwordHash, createdAt: accountCreatedAt }
        await accounts.insertOne(account, { session })
        const settings = { appName: grant.businessName, currency, updatedAt: new Date().toISOString() }
        await database.collection('business_settings').updateOne({ businessId: grant.businessId }, { $set: { businessId: grant.businessId, settings } }, { upsert: true, session })
        // Every client hydrates its new local workspace through the sync log.
        await database.collection('sync_operations').insertOne({ businessId: grant.businessId, deviceId: 'registration', operationId: randomUUID(), entityType: 'settings', entityId: 'business', action: 'upsert', payload: settings, createdAt: settings.updatedAt, receivedAt: new Date() }, { session })
        const plan = await database.collection('subscription_settings').findOne({ _id: 'plan' }, { session })
        const trialDays = Number(plan?.freeTrialDays ?? 0)
        const trialEndsAt = trialDays > 0 ? new Date(accountCreatedAt.getTime() + trialDays * 86400000) : null
        await database.collection('subscriptions').updateOne({ _id: grant.businessId }, { $setOnInsert: { ...(referrer ? { referrerId: referrer._id } : {}), expiresAt: null, trialEndsAt, trialConfigured: true, planId: trialEndsAt ? 'trial' : null, references: [], commissionEvents: [], createdAt: accountCreatedAt } }, { upsert: true, session })
        return { businessId: grant.businessId, businessName: grant.businessName, email, trialEndsAt }
      }))
    },
  }
}
