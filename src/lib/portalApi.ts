const api = __STOCKROOM_SYNC_API_URL__.replace(/\/$/, '')
type Keys = { access: string; refresh?: string; session?: string }

async function send(path: string, init: RequestInit, token = '') {
  const headers = new Headers(init.headers); headers.set('Content-Type', 'application/json'); if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(`${api}${path}`, { ...init, headers, signal: init.signal || AbortSignal.timeout(20000) })
}

export async function portalRequest<T = any>(path: string, init: RequestInit, keys: Keys): Promise<T> {
  const token = localStorage.getItem(keys.access) || (keys.session ? sessionStorage.getItem(keys.session) : '') || ''
  let response = await send(path, init, token)
  if (response.status === 401 && keys.refresh) {
    const refreshToken = localStorage.getItem(keys.refresh) || ''
    if (refreshToken) {
      const refreshed = await send('/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken }) })
      const session = await refreshed.json().catch(() => ({}))
      if (refreshed.ok && session.accessToken && session.refreshToken) {
        localStorage.setItem(keys.access, session.accessToken)
        localStorage.setItem(keys.refresh, session.refreshToken)
        response = await send(path, init, session.accessToken)
      }
    }
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`)
  return data as T
}

export async function portalSignIn(email: string, password: string) {
  const response = await send('/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Sign in failed.')
  return data as { account: { email: string; name: string; role: string }; accessToken: string; refreshToken: string }
}

export const ownerPortalKeys = { access: 'stockroom-developer-access', refresh: 'stockroom-developer-refresh' }
export const visitorPortalKeys = { access: 'stockroom-visitor-portal-access', session: 'stockroom-visitor-token' }

export function moneyMinor(amount: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount || 0) / 100) }
  catch { return `${currency} ${(Number(amount || 0) / 100).toFixed(2)}` }
}
