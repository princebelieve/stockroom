const renewals = new Map<string, Promise<{ accessToken: string; refreshToken: string }>>()

export class CloudAuthenticationError extends Error {}

export async function cloudRequest(apiUrl: string, path: string, init: RequestInit = {}, onToken: (token: string, refresh: string) => void, fallbackToken = ''): Promise<any> {
  const send = (token: string) => fetch(`${apiUrl}${path}`, {
    ...init, signal: init.signal || AbortSignal.timeout(10_000),
    headers: { ...Object.fromEntries(new Headers(init.headers)), 'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
      ...(apiUrl === '/api/cloud' ? { 'X-Local-Session': localStorage.getItem('stockroom-token') || '' } : {}) },
  })
  const originalToken = localStorage.getItem('stockroom-cloud-access-token') || fallbackToken
  let response = await send(originalToken)
  const latestToken = localStorage.getItem('stockroom-cloud-access-token') || fallbackToken
  if ((response.status === 401 || response.status === 403) && latestToken !== originalToken) response = await send(latestToken)
  if (response.status === 401 || response.status === 403) {
    const refreshToken = localStorage.getItem('stockroom-cloud-refresh-token') || ''
    if (refreshToken) {
      let renewal = renewals.get(apiUrl)
      if (!renewal) {
        const localSession = localStorage.getItem('stockroom-token')
        renewal = (async () => {
          const result = await fetch(`${apiUrl}/v1/auth/refresh`, { method: 'POST', signal: AbortSignal.timeout(10_000), headers: { 'Content-Type': 'application/json', ...(apiUrl === '/api/cloud' ? { 'X-Local-Session': localStorage.getItem('stockroom-token') || '' } : {}) }, body: JSON.stringify({ refreshToken }) })
          const data = await result.json().catch(() => ({}))
          if (!result.ok) {
            if (result.status === 401 || result.status === 403) throw new CloudAuthenticationError(data.error || 'Sign in with your cloud owner account.')
            throw new Error(data.error || 'Cloud session renewal is unavailable.')
          }
          if (!data.accessToken || !data.refreshToken) throw new Error('Cloud session renewal returned an invalid response.')
          if (localStorage.getItem('stockroom-token') !== localSession) throw new Error('The signed-in user changed.')
          localStorage.setItem('stockroom-cloud-access-token', data.accessToken)
          localStorage.setItem('stockroom-cloud-refresh-token', data.refreshToken)
          return data
        })()
        renewals.set(apiUrl, renewal)
      }
      try {
        const session = await renewal
        onToken(session.accessToken, session.refreshToken)
        response = await send(session.accessToken)
      } finally { if (renewals.get(apiUrl) === renewal) renewals.delete(apiUrl) }
    }
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401 || (response.status === 403 && /sign in|owner account not found/i.test(data.error || ''))) throw new CloudAuthenticationError(data.error || 'Sign in with your cloud owner account.')
    throw new Error(data.error || 'Cloud request failed.')
  }
  return data
}
