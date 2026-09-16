// Append-only events must always be retained. Mutable records may be edited on
// different devices; the newest ISO-8601 timestamp wins and the older edit is
// returned for human review.
export const mutableEntities = new Set(['product', 'customer', 'settings', 'user'])
export function operationUpdatedAt(operation) {
  return String(operation.payload?.updatedAt || operation.createdAt || '')
}
export function isNewerMutableOperation(incoming, currentHead) {
  return !currentHead || operationUpdatedAt(incoming) > currentHead.updatedAt
}
