import { ObjectId } from 'mongodb'

// Removal retains the profile for attribution; it is not personal-data deletion.
export function createStaffRemoval({ accounts, refreshTokens, operations, verifyToken, ownerPasswordIsValid, readJson, send }) {
  async function blocked(request) {
    const claims = verifyToken(request)
    if (claims?.kind !== 'access' || !claims.businessId) return false
    const account = await accounts.findOne({ businessId: claims.businessId, ...(ObjectId.isValid(claims.sub || '') ? { _id: new ObjectId(claims.sub) } : claims.role === 'owner' ? { email: claims.email, role: 'owner' } : { username: claims.username }) })
    return Boolean(account?.removedAt)
  }
  async function handle(request, response) {
    const match = request.url?.match(/^\/v1\/staff\/([^/]+)\/remove$/)
    if (!match || request.method !== 'POST') return false
    const claims = verifyToken(request)
    if (claims?.kind !== 'access' || claims.role !== 'owner') { send(response, 403, { error: 'Owner access required.' }); return true }
    if (!ObjectId.isValid(match[1])) { send(response, 400, { error: 'Invalid staff account.' }); return true }
    const input = await readJson(request)
    if (input.confirmation !== 'REMOVE' || !await ownerPasswordIsValid(claims, input.ownerPassword)) { send(response, 401, { error: 'Confirm removal and enter your owner password.' }); return true }
    const account = await accounts.findOne({ _id: new ObjectId(match[1]), businessId: claims.businessId, role: { $in: ['admin', 'cashier'] } })
    if (!account) { send(response, 404, { error: 'Staff account not found.' }); return true }
    const removedAt = account.removedAt || new Date()
    await accounts.updateOne({ _id: account._id, businessId: claims.businessId }, { $set: { removedAt, operationalAccess: false, removedBy: claims.sub || claims.email } })
    await refreshTokens.deleteMany({ accountId: account._id })
    // Stable operation ID makes a retry repair incomplete propagation safely.
    const id = String(account._id), operationId = `staff-removal:${id}`
    await operations.updateOne({ businessId: claims.businessId, operationId }, { $setOnInsert: { businessId: claims.businessId, operationId, deviceId: 'cloud', entityType: 'staff_removal', entityId: id, action: 'remove', payload: { id, removedAt: new Date(removedAt).toISOString() }, createdAt: new Date(removedAt).toISOString(), receivedAt: new Date() } }, { upsert: true })
    send(response, 200, { id, removedAt, name: account.name, removed: true }); return true
  }
  return { handle, blocked }
}
