import { subscriptionAccess } from './subscription-policy.mjs'

function evaluate(snapshot) {
  const access = subscriptionAccess(snapshot)
  if (typeof snapshot?.blocked !== 'boolean' || typeof snapshot?.status !== 'string') return access
  return { ...access, blocked: snapshot.blocked, status: snapshot.status, reason: snapshot.reason || access.reason, ...(snapshot.workspacePricing ? { workspacePricing: snapshot.workspacePricing } : {}), ...(Number.isInteger(snapshot.entitledWorkspaces) ? { entitledWorkspaces: snapshot.entitledWorkspaces } : {}), ...(Array.isArray(snapshot.entitledWorkspaceKeys) ? { entitledWorkspaceKeys: snapshot.entitledWorkspaceKeys } : {}) }
}

// Shared by desktop, Android and PWA. Cache only within the enrolled business.
export async function loadSubscriptionAccess({ config, read, write, fetcher = fetch, force = false, cacheOnly = false }) {
  if (!config?.url || !config?.token || !config?.businessId) return subscriptionAccess(null)
  const key = `subscription:${config.url}:${config.businessId}`
  let cached = null
  try { cached = JSON.parse(await read(key) || 'null') } catch { /* No usable cached entitlement. */ }
  if (cacheOnly) return evaluate(cached?.businessId === config.businessId ? cached : null)
  const now = Date.now()
  if (!force && cached?.businessId === config.businessId && cached.checkedAt <= now && now - cached.checkedAt < 60000) return evaluate(cached)
  try {
    const response = await fetcher(`${config.url.replace(/\/$/, '')}/v1/subscriptions/access`, { headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(8000) })
    if (response.status === 401 || response.status === 403) { await write(key, 'null'); return subscriptionAccess(null) }
    if (!response.ok) throw new Error('Subscription service unavailable.')
    const data = await response.json()
    if (data.businessId !== config.businessId || typeof data.testMode !== 'boolean') throw new Error('Invalid subscription response.')
    const snapshot = { businessId: data.businessId, testMode: data.testMode, expiresAt: data.expiresAt, trialEndsAt: data.trialEndsAt, isTrial: data.isTrial, planId: data.planId, graceMonths: data.graceMonths, graceDays: data.graceDays, suspended: data.suspended === true, suspensionReason: data.suspensionReason || '', portalUrl: data.portalUrl, blocked: data.blocked, status: data.status, reason: data.reason, workspacePricing: data.workspacePricing, entitledWorkspaces: data.entitledWorkspaces, entitledWorkspaceKeys: data.entitledWorkspaceKeys, checkedAt: now }
    await write(key, JSON.stringify(snapshot))
    return evaluate(snapshot)
  } catch {
    return evaluate(cached?.businessId === config.businessId ? cached : null)
  }
}
