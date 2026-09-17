export type TerminalSettings = {
  provider: string
  model: string
  terminalId: string
  connection: 'manual' | 'network' | 'usb' | 'bluetooth' | 'sdk'
  host: string
  port: string
  manualFallback: boolean
}
const connections = ['manual', 'network', 'usb', 'bluetooth', 'sdk']
export function normalizeTerminalSettings(value: unknown): TerminalSettings {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const text = (key: string) => typeof input[key] === 'string' ? (input[key] as string).trim().slice(0, 200) : ''
  return {
    provider: text('provider'), model: text('model'), terminalId: text('terminalId'),
    connection: connections.includes(String(input.connection)) ? input.connection as TerminalSettings['connection'] : 'manual',
    host: text('host'), port: text('port'), manualFallback: input.manualFallback !== false,
  }
}
export function readTerminalSettings(businessId: string): TerminalSettings {
  try { return normalizeTerminalSettings(JSON.parse(localStorage.getItem(`stockroom-terminal:${businessId}`) || '{}')) }
  catch { return normalizeTerminalSettings({}) }
}
export function saveTerminalSettings(businessId: string, value: TerminalSettings) {
  if (!businessId) throw new Error('Sign in to a business before configuring a terminal.')
  const settings = normalizeTerminalSettings(value)
  if (settings.port && (!/^\d+$/.test(settings.port) || Number(settings.port) < 1 || Number(settings.port) > 65535)) throw new Error('Port must be a number from 1 to 65535.')
  if (settings.host && !/^[a-zA-Z0-9.:[\]-]+$/.test(settings.host)) throw new Error('Enter a hostname or IP address without a URL, path, or credentials.')
  localStorage.setItem(`stockroom-terminal:${businessId}`, JSON.stringify(settings))
  return settings
}
export function canRecordTerminalPayment(settings: TerminalSettings) {
  // No payment adapters are registered yet. Never interpret a saved profile as a connection.
  return settings.connection === 'manual' || settings.manualFallback
}
