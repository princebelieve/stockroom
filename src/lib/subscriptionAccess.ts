import { subscriptionAccess, type SubscriptionAccess } from '../../server/subscription-policy.mjs'

// Used by the desktop offline sale queue as well as the visible POS gate.
export async function readPosAccess(authToken: string, organizationId: string, force = false): Promise<SubscriptionAccess> {
  const key = `stockroom-subscription:${organizationId}`
  try {
    const response = await fetch('/api/subscriptions/access', { headers: { Authorization: `Bearer ${authToken}`, ...(force ? { 'X-Subscription-Refresh': 'true' } : {}) }, signal: AbortSignal.timeout(10000) })
    if (response.status === 401 || response.status === 403) { localStorage.removeItem(key); return subscriptionAccess(null) }
    if (!response.ok) throw new Error('Subscription status unavailable.')
    const snapshot = await response.json() as SubscriptionAccess
    localStorage.setItem(key, JSON.stringify({ session: authToken, snapshot }))
    return subscriptionAccess(snapshot)
  } catch {
    try {
      const cached = JSON.parse(localStorage.getItem(key) || 'null')
      return subscriptionAccess(cached?.session === authToken ? cached.snapshot : null)
    } catch { return subscriptionAccess(null) }
  }
}
