import { applyRemoteOperations, getPendingSyncOperations, getSyncCursor, getSyncStatus, markKnownLocalOperationsApplied, markSyncFailure, markSyncOperationsSynced, queueInitialSettingsSnapshot, recordSyncConflicts, setSyncCursor } from './repository.mjs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSubscriptionAccess } from './subscription-client.mjs'

let running = false

async function configuration() {
  const fallbackPath = join(fileURLToPath(new URL('.', import.meta.url)), 'data', 'sync-config.json')
  try {
    const saved = JSON.parse(await readFile(process.env.SYNC_CONFIG_PATH || fallbackPath, 'utf8'))
    return { url: String(saved.syncApiUrl || '').replace(/\/$/, ''), token: String(saved.deviceToken || ''), businessId: String(saved.businessId || ''), deviceId: String(saved.deviceId || ''), existingBusiness: saved.existingBusiness === true }
  } catch {
    return { url: process.env.SYNC_API_URL?.replace(/\/$/, ''), token: process.env.SYNC_DEVICE_TOKEN, businessId: process.env.BUSINESS_ID, deviceId: process.env.DEVICE_ID, existingBusiness: false }
  }
}

function configurationPath() {
  return process.env.SYNC_CONFIG_PATH || join(fileURLToPath(new URL('.', import.meta.url)), 'data', 'sync-config.json')
}

export async function saveCloudConfiguration(input) {
  const syncApiUrl = String(input.syncApiUrl || '').trim().replace(/\/$/, '')
  const businessId = String(input.businessId || '').trim()
  const deviceId = String(input.deviceId || '').trim()
  const deviceToken = String(input.deviceToken || '').trim()
  const existingBusiness = input.existingBusiness === true
  if (!/^https:\/\/[^\s]+$/i.test(syncApiUrl)) throw new Error('Enter a valid HTTPS Render URL.')
  if (!/^[a-z0-9][a-z0-9-]{2,80}$/i.test(businessId)) throw new Error('Business ID must use letters, numbers, and hyphens.')
  if (!/^[a-z0-9][a-z0-9-]{2,100}$/i.test(deviceId)) throw new Error('Device ID must use letters, numbers, and hyphens.')
  if (!deviceToken) throw new Error('A cloud device token is required.')
  const filePath = configurationPath()
  await mkdir(join(filePath, '..'), { recursive: true })
  const temporaryPath = `${filePath}.new`
  await writeFile(temporaryPath, `${JSON.stringify({ syncApiUrl, businessId, deviceId, deviceToken, existingBusiness }, null, 2)}\n`, { mode: 0o600 })
  await rename(temporaryPath, filePath)
  return { syncApiUrl, businessId, deviceId, existingBusiness }
}

export async function getCloudConfiguration() {
  const { url, businessId } = await configuration()
  return { url, businessId }
}

export async function getSubscriptionAccess(force = false) {
  const config = await configuration()
  const path = `${configurationPath()}.subscription.json`
  return loadSubscriptionAccess({ config, force,
    read: async key => { try { const saved = JSON.parse(await readFile(path, 'utf8')); return saved.key === key ? saved.value : '' } catch { return '' } },
    write: async (key, value) => { await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, JSON.stringify({ key, value }), { mode: 0o600 }) },
  })
}

export async function syncConfigurationStatus() {
  const config = await configuration()
  return { ...getSyncStatus(), configured: Boolean(config.url && config.token && config.businessId && config.deviceId), existingBusiness: config.existingBusiness }
}

async function pullRemoteChanges({ url, token, businessId, deviceId }) {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  // Include this device's own cloud history. This is essential after its local
  // SQLite database is restored or replaced during deployment; normal local
  // operations are pre-recorded in the inbox and therefore remain idempotent.
  markKnownLocalOperationsApplied()
  let cursor = getSyncCursor()
  while (true) {
  const pulled = await fetch(`${url}/v1/sync/pull?businessId=${encodeURIComponent(businessId)}&deviceId=${encodeURIComponent(deviceId)}&includeOwn=1&cursor=${encodeURIComponent(cursor)}`, { headers })
  if (!pulled.ok) throw new Error(`Cloud pull failed (${pulled.status}).`)
  const result = await pulled.json()
  applyRemoteOperations(result.operations || [])
  if (result.cursor) setSyncCursor(result.cursor)
  if ((result.operations || []).length < 500 || !result.cursor || result.cursor === cursor) break
  cursor = result.cursor
  }
}

// A reset local database can retain its device enrollment but lose its outbox.
// Never let that empty database publish a default settings snapshot over an
// established cloud business. A snapshot is created only after the cloud
// positively confirms that this is a brand-new business.
async function cloudHasBusinessSettings({ url, token, businessId }) {
  const response = await fetch(`${url}/v1/business/settings?businessId=${encodeURIComponent(businessId)}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error(`Cloud settings check failed (${response.status}).`)
  const result = await response.json()
  return Boolean(result?.settings)
}

export async function pullLatest() {
  if (running) return getSyncStatus()
  const config = await configuration()
  if (!config.url || !config.token || !config.businessId || !config.deviceId) return syncConfigurationStatus()
  running = true
  try { await pullRemoteChanges(config) } catch (error) { markSyncFailure(error instanceof Error ? error.message : 'Cloud pull failed.') } finally { running = false }
  return syncConfigurationStatus()
}

export async function syncNow() {
  if (running) return getSyncStatus()
  const { url, token, businessId, deviceId, existingBusiness } = await configuration()
  if (!url || !token || !businessId || !deviceId) return syncConfigurationStatus()
  running = true
  try {
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    if (!existingBusiness && !(await cloudHasBusinessSettings({ url, token, businessId }))) await queueInitialSettingsSnapshot()
    while (true) {
    const pending = getPendingSyncOperations()
    if (!pending.length) break
    if (pending.length) {
      const pushed = await fetch(`${url}/v1/sync/push`, { method: 'POST', headers, body: JSON.stringify({ businessId, deviceId, operations: pending }) })
      if (!pushed.ok) throw new Error(`Cloud push failed (${pushed.status}).`)
      const result = await pushed.json()
      const acknowledged = [...(result.acceptedOperationIds || []), ...(result.conflicts || []).map((conflict) => conflict.operationId)].filter(id => pending.some(operation => operation.operationId === id))
      if (!acknowledged.length) throw new Error('Cloud did not acknowledge any queued changes. Retry sync.')
      markSyncOperationsSynced(acknowledged)
      recordSyncConflicts(result.conflicts)
    }
    }
    await pullRemoteChanges({ url, token, businessId, deviceId })
  } catch (error) {
    markSyncFailure(error instanceof Error ? error.message : 'Sync failed.')
  } finally {
    running = false
  }
  return syncConfigurationStatus()
}

export function startSyncWorker() {
  syncNow().catch(() => undefined)
  return setInterval(() => syncNow().catch(() => undefined), 30_000)
}
