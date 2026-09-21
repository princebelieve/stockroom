import { subscriptionAccess } from './subscription-policy.mjs'

// Shared by desktop, Android and PWA. Cache only within the enrolled business.
export async function loadSubscriptionAccess({ config, read, write, fetcher = fetch, force = false }) {
  if (!config?.url || !config?.token || !config?.businessId) return subscriptionAccess(null)
  const key = `subscription:${config.url}:${config.businessId}`
  let cached = null
  try { cached = JSON.parse(await read(key) || 'null') } catch { /* No usable cached entitlement. */ }
  const now = Date.now()
  if (!force && cached?.businessId === config.businessId && cached.checkedAt <= now && now - cached.checkedAt < 60000) return subscriptionAccess(cached)
  try {
    const response = await fetcher(`${config.url.replace(/\/$/, '')}/v1/subscriptions/access`, { headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(8000) })
    if (response.status === 401 || response.status === 403) { await write(key, 'null'); return subscriptionAccess(null) }
    if (!response.ok) throw new Error('Subscription service unavailable.')
    const data = await response.json()
    if (data.businessId !== config.businessId || typeof data.testMode !== 'boolean') throw new Error('Invalid subscription response.')
    const snapshot = { businessId: data.businessId, testMode: data.testMode, expiresAt: data.expiresAt, graceMonths: data.graceMonths, portalUrl: data.portalUrl, checkedAt: now }
    await write(key, JSON.stringify(snapshot))
    return subscriptionAccess(snapshot)
  } catch {
    return subscriptionAccess(cached?.businessId === config.businessId ? cached : null)
  }
}
