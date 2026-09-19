export function resolveCloudAccessToken(freshToken: string | null | undefined, savedToken: string | null | undefined = ''): string {
  const fresh = String(freshToken || '').trim()
  const saved = String(savedToken || '').trim()
  return fresh || saved
}
