import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const keyFromEnv = env => {
  const value = String(env.PAYSTACK_CREDENTIALS_ENCRYPTION_KEY || '').trim()
  const key = Buffer.from(value, 'base64')
  if (key.length !== 32) throw new Error('Paystack credential encryption is not configured. Ask Stockroom support to finish secure payment setup.')
  return key
}

function encrypt(value, env) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFromEnv(env), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return { version: 1, iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') }
}

function decrypt(value, env) {
  const decipher = createDecipheriv('aes-256-gcm', keyFromEnv(env), Buffer.from(value.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8')
}

function validEmail(value) { return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(value || '')) && String(value).length <= 254 }

export function createTenantIntegrations({ database, env = process.env, fetcher = fetch }) {
  const collection = database.collection('business_integrations')
  const legacy = (() => { try { return JSON.parse(env.POS_PAYSTACK_CONFIG_JSON || '{}') } catch { return {} } })()

  async function paystackConfig(businessId) {
    const saved = await collection.findOne({ businessId, provider: 'paystack' })
    if (saved?.active && saved.secret) return { secretKey: decrypt(saved.secret, env), terminalId: saved.terminalId || '', customerCode: saved.customerCode || '' }
    if (saved) return null
    // One-way compatibility during migration from the old Render JSON setting.
    const config = legacy[businessId]
    if (config && /^sk_(test|live)_/.test(config.secretKey || '')) return { secretKey: config.secretKey, terminalId: config.terminalId || '', customerCode: config.customerCode || '' }
    return null
  }

  async function publicPaystack(businessId) {
    const saved = await collection.findOne({ businessId, provider: 'paystack' })
    if (!saved) {
      const old = legacy[businessId]
      return { connected: Boolean(old && /^sk_(test|live)_/.test(old.secretKey || '')), testMode: Boolean(old?.secretKey?.startsWith('sk_test_')), terminalConnected: Boolean(old?.terminalId && old?.customerCode), migrated: false }
    }
    return { connected: saved.active === true, testMode: saved.testMode === true, terminalConnected: Boolean(saved.terminalId && saved.customerCode), updatedAt: saved.updatedAt || null, migrated: true }
  }

  async function connectPaystack(businessId, input) {
    const secretKey = String(input.secretKey || '').trim()
    if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(secretKey)) throw new Error('Enter the Paystack secret key from this business’s Paystack dashboard.')
    const terminalId = String(input.terminalId || '').trim()
    const customerCode = String(input.customerCode || '').trim()
    if ((terminalId && !/^[A-Za-z0-9_-]{2,100}$/.test(terminalId)) || (customerCode && !/^CUS_[A-Za-z0-9]+$/.test(customerCode))) throw new Error('Check the Paystack terminal ID and customer code.')
    if (Boolean(terminalId) !== Boolean(customerCode)) throw new Error('Enter both the terminal ID and customer code, or leave both blank for hosted payments only.')
    const response = await fetcher('https://api.paystack.co/balance', { headers: { Authorization: `Bearer ${secretKey}` }, signal: AbortSignal.timeout(12000) })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || result.status !== true) throw new Error('Paystack could not validate these credentials. Check the key and try again.')
    const now = new Date()
    await collection.updateOne({ businessId, provider: 'paystack' }, { $set: { businessId, provider: 'paystack', secret: encrypt(secretKey, env), testMode: secretKey.startsWith('sk_test_'), terminalId, customerCode, active: true, updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true })
    return { connected: true, testMode: secretKey.startsWith('sk_test_'), terminalConnected: Boolean(terminalId), updatedAt: now }
  }

  async function disconnectPaystack(businessId) {
    await collection.updateOne({ businessId, provider: 'paystack' }, { $set: { active: false, updatedAt: new Date() }, $unset: { secret: '', terminalId: '', customerCode: '' } }, { upsert: true })
    return { connected: false, testMode: false, terminalConnected: false }
  }

  function encryptionReady() { try { keyFromEnv(env); return true } catch { return false } }

  async function emailSettings(businessId) {
    const settings = await collection.findOne({ businessId, provider: 'hospitality-email' })
    return settings?.settings || { replyToEmail: '', replyToName: '', businessDisplayName: '', templates: {} }
  }

  async function saveEmailSettings(businessId, input) {
    const settings = {
      replyToEmail: String(input.replyToEmail || '').trim().toLowerCase(),
      replyToName: String(input.replyToName || '').trim().slice(0, 100),
      businessDisplayName: String(input.businessDisplayName || '').trim().slice(0, 100),
      templates: Object.fromEntries(['confirmation', 'reminder', 'cancelled', 'no-show', 'waitlist-offer'].map(type => [type, String(input.templates?.[type] || '').trim().slice(0, 1000)])),
    }
    if (settings.replyToEmail && !validEmail(settings.replyToEmail)) throw new Error('Enter a valid business reply-to email address.')
    await collection.updateOne({ businessId, provider: 'hospitality-email' }, { $set: { businessId, provider: 'hospitality-email', settings, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true })
    return settings
  }

  return { paystackConfig, publicPaystack, connectPaystack, disconnectPaystack, encryptionReady, emailSettings, saveEmailSettings }
}
