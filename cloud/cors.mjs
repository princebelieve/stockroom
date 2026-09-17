export function corsHeadersFor(origin, configured = '') {
  const allowed = new Set(['https://localhost', ...configured.split(',').map(value => value.trim()).filter(Boolean)])
  return {
    ...(allowed.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
    Vary: 'Origin',
  }
}
