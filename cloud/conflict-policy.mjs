// Append-only events must always be retained. Mutable records may be edited on
// different devices; the newest ISO-8601 timestamp wins and the older edit is
// returned for human review.
export const mutableEntities = new Set(['product', 'customer', 'settings', 'user', 'branch', 'pos_record'])
export function operationUpdatedAt(operation) {
  return String(operation.payload?.updatedAt || operation.createdAt || '')
}
export function isNewerMutableOperation(incoming, currentHead) {
  return !currentHead || operationUpdatedAt(incoming) > currentHead.updatedAt ||
    (incoming.entityType === 'settings' && incoming.deviceId && incoming.deviceId === currentHead.deviceId && operationUpdatedAt(incoming) === currentHead.updatedAt)
}

export function identicalSettings(incoming, currentHead) {
  if (incoming.entityType !== 'settings' || !currentHead?.payload) return false
  const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])) : value
  const content = value => Object.fromEntries(Object.entries(value).filter(([key])=>key!=='updatedAt'))
  return JSON.stringify(stable(content(incoming.payload))) === JSON.stringify(stable(content(currentHead.payload)))
}
