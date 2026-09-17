import { withBrowserDatabase } from './browserDatabase'
import { handleBrowserApi } from './browserApi'

export function installBrowserApi() {
  const original = window.fetch.bind(window)
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href), init || (input instanceof Request ? input : undefined))
    const url = new URL(request.url)
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return original(input, init)
    const options: RequestInit = { method: request.method, headers: request.headers }
    if (!['GET', 'HEAD'].includes(request.method)) options.body = await request.text()
    try { return await withBrowserDatabase(() => handleBrowserApi(url.pathname, options)) }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Local storage failed.' }, { status: 503 }) }
  }) as typeof window.fetch
}
