import { applyRemoteOperations, getPendingSyncOperations, getSyncCursor, getSyncStatus, markSyncFailure, markSyncOperationsSynced, setSyncCursor } from './repository.mjs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

let running = false

async function configuration() {
  const fallbackPath = join(fileURLToPath(new URL('.', import.meta.url)), 'data', 'sync-config.json')
  try {
    const saved = JSON.parse(await readFile(process.env.SYNC_CONFIG_PATH || fallbackPath, 'utf8'))
    return { url: String(saved.syncApiUrl || '').replace(/\/$/, ''), token: String(saved.deviceToken || ''), businessId: String(saved.businessId || ''), deviceId: String(saved.deviceId || '') }
  } catch {
    return { url: process.env.SYNC_API_URL?.replace(/\/$/, ''), token: process.env.SYNC_DEVICE_TOKEN, businessId: process.env.BUSINESS_ID, deviceId: process.env.DEVICE_ID }
  }
}

export async function syncConfigurationStatus() {
  const config = await configuration()
  return { ...getSyncStatus(), configured: Boolean(config.url && config.token && config.businessId && config.deviceId) }
}

export async function syncNow() {
  if (running) return getSyncStatus()
  const { url, token, businessId, deviceId } = await configuration()
  if (!url || !token || !businessId || !deviceId) return syncConfigurationStatus()
  running = true
  try {
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    const pending = getPendingSyncOperations()
    if (pending.length) {
      const pushed = await fetch(`${url}/v1/sync/push`, { method: 'POST', headers, body: JSON.stringify({ businessId, deviceId, operations: pending }) })
      if (!pushed.ok) throw new Error(`Cloud push failed (${pushed.status}).`)
      const result = await pushed.json()
      markSyncOperationsSynced(result.acceptedOperationIds || pending.map((operation) => operation.operationId))
    }
    const cursor = getSyncCursor()
    const pulled = await fetch(`${url}/v1/sync/pull?businessId=${encodeURIComponent(businessId)}&deviceId=${encodeURIComponent(deviceId)}&cursor=${encodeURIComponent(cursor)}`, { headers })
    if (!pulled.ok) throw new Error(`Cloud pull failed (${pulled.status}).`)
    const result = await pulled.json()
    applyRemoteOperations(result.operations || [])
    if (result.cursor) setSyncCursor(result.cursor)
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
