// Desktop staff actions use cloud identity, but keep the local API responsible
// for business/role checks and updating the SQLite staff cache.
export function teamSessionFetch(fetcher: typeof fetch, origin: string, prepareSession: () => Promise<string>): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), origin)
    if (url.origin !== origin || !/^\/api\/users(?:\/[^/]+\/(?:role|operational-access|password))?$/.test(url.pathname)) return fetcher(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    try {
      headers.set('X-Cloud-Access-Token', await prepareSession())
    } catch (error) {
      const method = init?.method || (input instanceof Request ? input.method : 'GET')
      // The directory remains available offline. Mutations must be verified
      // online before they can change either cloud or local staff records.
      if (method.toUpperCase() !== 'GET') return Response.json({ error: error instanceof Error ? error.message : 'Could not restore the cloud session.' }, { status: 503 })
      headers.delete('X-Cloud-Access-Token')
    }
    return fetcher(input, { ...init, headers })
  }
}
