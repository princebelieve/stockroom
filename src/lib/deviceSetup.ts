export type DeviceKind = 'receipt' | 'report' | 'drawer' | 'cutter' | 'terminal' | 'scanner' | 'display'
export type DeviceProfile = { model: string; connection: string; status: 'configured' | 'confirmed' | 'unavailable'; signature: string; updatedAt: string }
export const deviceLabels: Record<DeviceKind, string> = { receipt: 'Receipt printer', report: 'A4 printer', drawer: 'Cash drawer', cutter: 'Paper cutter', terminal: 'POS', scanner: 'Barcode scanner', display: 'Customer display' }
export function configurationSignature(kind: DeviceKind, businessId: string) {
  const key = kind === 'terminal' ? `stockroom-terminal:${businessId}` : kind === 'scanner' ? 'stockroom-scanner' : kind === 'drawer' || kind === 'cutter' ? 'stockroom-hardware' : kind === 'display' ? 'stockroom-display' : 'stockroom-printers'
  return localStorage.getItem(key) || ''
}
export function readDeviceProfile(kind: DeviceKind, businessId: string): DeviceProfile | null {
  try {
    const p = JSON.parse(localStorage.getItem(`stockroom-device:${businessId}:${kind}`) || 'null')
    if (!p || typeof p.model !== 'string' || typeof p.connection !== 'string' || !['configured', 'confirmed', 'unavailable'].includes(p.status)) return null
    return { ...p, status: p.signature === configurationSignature(kind, businessId) ? p.status : 'configured' }
  } catch { return null }
}
export function saveDeviceProfile(kind: DeviceKind, businessId: string, profile: Pick<DeviceProfile, 'model' | 'connection' | 'status'>) {
  if (!businessId) throw new Error('Sign in before setting up a device.')
  localStorage.setItem(`stockroom-device:${businessId}:${kind}`, JSON.stringify({ model: profile.model.trim().slice(0, 200), connection: profile.connection, status: profile.status, signature: configurationSignature(kind, businessId), updatedAt: new Date().toISOString() }))
}
export function scannerSettings(defaultMode: 'keyboard' | 'camera' = 'keyboard'): { suffix: 'Enter' | 'Tab'; mode: 'keyboard' | 'camera'; modeExplicit: boolean } {
  try {
    const s = JSON.parse(localStorage.getItem('stockroom-scanner') || '{}')
    // Camera was an explicit choice in the old format. Keyboard was also the
    // old fallback, so only treat it as deliberate when saved by the new setup.
    const modeExplicit = s.mode === 'camera' || (s.mode === 'keyboard' && s.modeExplicit === true)
    return { suffix: s.suffix === 'Tab' ? 'Tab' : 'Enter', mode: modeExplicit ? s.mode : defaultMode, modeExplicit }
  } catch { return { suffix: 'Enter', mode: defaultMode, modeExplicit: false } }
}
