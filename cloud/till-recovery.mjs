import { randomUUID } from 'node:crypto'

const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{3,100}$/.test(value)
const failure = message => { throw new Error(message) }

export function createTillRecovery({ database, devices, entityHeads, operations, serialize, verifyToken, ownerIsActive, ownerPasswordIsValid, readJson, send }) {
  const tills = database.collection('checkout_tills')
  const recoveries = database.collection('till_recoveries')

  async function bind(businessId, deviceId, tillId) {
    if (!validId(tillId)) failure('A valid checkout till ID is required.')
    return serialize(businessId, async () => {
      const device = await devices.findOne({ businessId, deviceId })
      if (!device || device.revokedAt || device.recoveryRetiredAt) failure('This device has been revoked. Enroll a replacement device.')
      const filter = { businessId, tillId }
      const existing = await tills.findOne(filter)
      if (existing && existing.deviceId !== deviceId) failure('This till belongs to another device. Use owner-controlled recovery.')
      await tills.updateOne(filter, { $set: { deviceId, updatedAt: new Date() } }, { upsert: true })
      return { tillId, deviceId }
    })
  }

  async function discover(businessId) {
    // Older installations can be identified from their original create events.
    // Never infer ownership from later cross-device preparation updates.
    const history = await operations.find({ businessId, entityType: 'pos_record', 'payload.expectedUpdatedAt': '', 'payload.kind': { $in: ['counter-order', 'restaurant-tab', 'service-job'] } }).toArray()
    const origins = new Map()
    for (const event of history) {
      const tillId = event.payload.tillId
      if (!validId(tillId) || tillId === 'customer-portal') continue
      const set = origins.get(tillId) || new Set(); set.add(event.deviceId); origins.set(tillId, set)
    }
    for (const [tillId, ids] of origins) if (ids.size === 1 && !await tills.findOne({ businessId, tillId })) {
      const deviceId = [...ids][0]
      if (await devices.findOne({ businessId, deviceId })) await tills.updateOne({ businessId, tillId }, { $setOnInsert: { deviceId, updatedAt: new Date() } }, { upsert: true })
    }
    const bindings = await tills.find({ businessId }).toArray()
    const result = []
    for (const binding of bindings) {
      const device = await devices.findOne({ businessId, deviceId: binding.deviceId })
      if (device) result.push({ tillId: binding.tillId, deviceId: binding.deviceId, deviceLabel: device.label || binding.deviceId, retired: Boolean(device.recoveryRetiredAt), revoked: Boolean(device.revokedAt) })
    }
    return result
  }

  async function recover(businessId, staffId, input) {
    const { sourceDeviceId, targetDeviceId, tillId, currentTillId, requestId } = input
    if (![sourceDeviceId, targetDeviceId, tillId, currentTillId, requestId].every(validId) || sourceDeviceId === targetDeviceId || tillId === currentTillId) failure('Choose a lost till and a different enrolled replacement device.')
    if (input.confirmation !== 'RECOVER' || input.sourceStopped !== true || input.activityReviewed !== true) failure('Confirm that the original device is stopped and unsynchronized payments and stock have been reconciled.')
    const fingerprint = JSON.stringify([sourceDeviceId, targetDeviceId, tillId, currentTillId])
    return serialize(businessId, async () => {
      const filter = { businessId, requestId }
      let saved = await recoveries.findOne(filter)
      if (saved && saved.fingerprint !== fingerprint) failure('This recovery request ID already has different details.')
      const target = await devices.findOne({ businessId, deviceId: targetDeviceId })
      if (!target || target.revokedAt || target.recoveryRetiredAt) failure('The replacement device must be actively enrolled.')
      const source = await devices.findOne({ businessId, deviceId: sourceDeviceId })
      const binding = await tills.findOne({ businessId, tillId })
      if (!source || !binding || ![sourceDeviceId, ...(saved ? [targetDeviceId] : [])].includes(binding.deviceId)) failure('The original till ownership changed. Refresh the recovery list.')
      if (saved?.status === 'completed') {
        if (binding.deviceId !== targetDeviceId) failure('This till has since moved to another replacement device.')
        await tills.updateOne({ businessId, tillId, deviceId: targetDeviceId, pendingRecoveryRequestId: requestId }, { $unset: { pendingRecoveryRequestId: '' } })
        return { tillId, deviceId: targetDeviceId, requestId }
      }
      if (binding.pendingRecoveryRequestId && binding.pendingRecoveryRequestId !== requestId) failure('Another recovery is in progress for this till.')
      const current = await tills.findOne({ businessId, tillId: currentTillId })
      if (!current || current.deviceId !== targetDeviceId) failure('Register the replacement checkout before recovering a till.')
      const heads = await entityHeads.find({ businessId, entityType: 'pos_record', 'payload.tillId': currentTillId }).toArray()
      if (heads.some(head => head.payload.kind === 'restaurant-tab' && head.payload.status === 'open' || head.payload.kind === 'counter-order' && !['collected', 'cancelled'].includes(head.payload.status) || head.payload.kind === 'service-job' && !['completed', 'cancelled'].includes(head.payload.status))) failure('Finish or cancel active work on the replacement till before recovery.')
      if (!saved) {
        saved = { ...filter, id: randomUUID(), fingerprint, sourceDeviceId, targetDeviceId, tillId, currentTillId, staffId, status: 'pending', createdAt: new Date() }
        await recoveries.insertOne(saved)
      }
      if (binding.deviceId === sourceDeviceId) {
        const reserved = await tills.updateOne({ businessId, tillId, deviceId: sourceDeviceId, $or: [{ pendingRecoveryRequestId: { $exists: false } }, { pendingRecoveryRequestId: requestId }] }, { $set: { pendingRecoveryRequestId: requestId } })
        if (!reserved.matchedCount) failure('Another recovery changed this till. Refresh before continuing.')
      }
      // Keep this durable pending request before either mutation. A retry can
      // finish a crash between retiring the source and assigning the identity.
      await devices.updateOne({ businessId, deviceId: sourceDeviceId }, { $set: { revokedAt: saved.createdAt, recoveryRetiredAt: saved.createdAt, revokeReason: 'Lost-till recovery', replacementDeviceId: targetDeviceId } })
      await tills.updateOne({ businessId, tillId }, { $set: { deviceId: targetDeviceId, recoveredAt: new Date(), recoveryRequestId: requestId } })
      await recoveries.updateOne(filter, { $set: { status: 'completed', completedAt: new Date() } })
      await tills.updateOne({ businessId, tillId, deviceId: targetDeviceId, pendingRecoveryRequestId: requestId }, { $unset: { pendingRecoveryRequestId: '' } })
      return { tillId, deviceId: targetDeviceId, requestId }
    })
  }

  async function handle(request, response) {
    const path = new URL(request.url, 'http://localhost').pathname
    if (!path.startsWith('/v1/till-recovery/')) return false
    const claims = verifyToken(request)
    try {
      if (path === '/v1/till-recovery/bind' && request.method === 'POST') {
        if (claims?.kind !== 'device' || !claims.businessId || !claims.deviceId) { send(response, 403, { error: 'An enrolled device is required.' }); return true }
        const input = await readJson(request, 4096)
        send(response, 200, await bind(claims.businessId, claims.deviceId, input.tillId)); return true
      }
      if (claims?.kind !== 'access' || claims.role !== 'owner' || !await ownerIsActive(claims)) { send(response, 403, { error: 'Only the owner can recover a lost till.' }); return true }
      if (path === '/v1/till-recovery/tills' && request.method === 'GET') {
        send(response, 200, { tills: await serialize(claims.businessId, () => discover(claims.businessId)) }); return true
      }
      if (path === '/v1/till-recovery/recover' && request.method === 'POST') {
        const input = await readJson(request, 8192)
        if (!await ownerPasswordIsValid(claims, input.ownerPassword)) { send(response, 401, { error: 'Confirm the owner password.' }); return true }
        send(response, 200, await recover(claims.businessId, claims.sub, input)); return true
      }
      send(response, 404, { error: 'Recovery route not found.' })
    } catch (error) { send(response, 409, { error: error.message }) }
    return true
  }
  return { handle, bind, discover, recover }
}
