// Desktop uses HTTP for its local database; APK/PWA resolve identity inside
// their database adapters. Supply the shared session at this transport boundary.
export function localSessionFetch(fetcher: typeof fetch, origin: string, readToken: () => string): typeof fetch {
  return (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), origin)
    if (url.origin !== origin || !url.pathname.startsWith('/api/')) return fetcher(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    const token = readToken()
    if (!headers.has('Authorization') && token) headers.set('Authorization', `Bearer ${token}`)
    return fetcher(input, { ...init, headers })
  }
}
