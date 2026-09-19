export function resolveCloudAccessToken(freshToken, savedToken = '') {
  const fresh = String(freshToken || '').trim()
  const saved = String(savedToken || '').trim()
  return fresh || saved
}
