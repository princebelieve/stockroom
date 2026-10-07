import { createHash, randomUUID } from 'node:crypto'
export function preparationTickets(order) {
  if (order.source === 'customer-portal' && !order.acceptedTillId) return []
  const event = [...(order.events || [])].reverse().find(row => ['create', 'edit', 'accept'].includes(row.action))
  const revision = order.status === 'cancelled' ? order.updatedAt : event?.at || order.createdAt
  return [...new Set(order.lines.map(line => line.station || 'kitchen'))].map(station => ({
    id: createHash('sha256').update(JSON.stringify([order.id, revision, station])).digest('hex'), station, revision,
    order: { ...order, note: [order.status === 'cancelled' ? 'CANCEL STATION ITEMS' : event?.action === 'edit' ? 'ORDER CORRECTION: replace earlier ticket' : '', order.note].filter(Boolean).join(' / '), lines: order.lines.filter(line => (line.station || 'kitchen') === station) },
  }))
}
export function createPreparationPrint({ database, devices, entityHeads, verifyToken, ownerIsActive, readJson, send }) {
  const configs = database.collection('preparation_printers'), jobs = database.collection('preparation_print_jobs')
  async function handle(request, response) {
    const url = new URL(request.url, 'http://localhost')
    if (!url.pathname.startsWith('/v1/preparation-print/')) return false
    const claims = verifyToken(request)
    try {
      if (!claims?.businessId) throw new Error('Sign in to this business.')
      if (await database.collection('account_deletion_requests').findOne({ type: 'business', businessId: claims.businessId, status: { $in: ['pending', 'processing'] } })) throw new Error('This business is closed.')
      if (url.pathname === '/v1/preparation-print/configure' && request.method === 'POST') {
        if (claims.kind !== 'access' || claims.role !== 'owner' || !await ownerIsActive(claims)) throw new Error('Owner access is required.')
        const input = await readJson(request, 4096)
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(input.branchId || '')) throw new Error('Choose a branch.')
        const device = await devices.findOne({ businessId: claims.businessId, deviceId: input.deviceId })
        if (!device || device.revokedAt || device.recoveryRetiredAt) throw new Error('Choose an active enrolled Windows device.')
        const filter = { businessId: claims.businessId, branchId: input.branchId }
        const previous = await configs.findOne(filter)
        await configs.updateOne(filter, { $set: { deviceId: input.deviceId, enabled: input.enabled === true, startedAt: previous?.startedAt || new Date().toISOString(), updatedAt: new Date().toISOString() } }, { upsert: true })
        send(response, 200, { configured: true }); return true
      }
      if (claims.kind !== 'device') throw new Error('Enrolled device required.')
      const device = await devices.findOne({ businessId: claims.businessId, deviceId: claims.deviceId })
      if (!device || device.revokedAt || device.recoveryRetiredAt) throw new Error('This device has been revoked.')
      const branchId = url.searchParams.get('branchId') || 'main', filter = { businessId: claims.businessId, branchId }
      const config = await configs.findOne(filter)
      const designated = config?.enabled && config.deviceId === claims.deviceId
      if (url.pathname === '/v1/preparation-print/jobs' && request.method === 'GET') {
        if (!designated) { send(response, 200, { shared: Boolean(config?.enabled), designated: false, lastSeenAt: config?.lastSeenAt || '', jobs: [] }); return true }
        await configs.updateOne(filter, { $set: { lastSeenAt: new Date().toISOString() } })
        const heads = await entityHeads.find({ businessId: claims.businessId, entityType: 'pos_record', 'payload.kind': 'counter-order', 'payload.branchId': branchId, updatedAt: { $gte: config.startedAt } }).toArray()
        for (const head of heads) {
          const tickets = preparationTickets(head.payload)
          const oldJobs = (await jobs.find({ ...filter, 'order.id': head.payload.id }).toArray()).sort((a,b) => String(b.revision).localeCompare(String(a.revision)))
          // A corrected order may remove every item previously sent to a station.
          if (tickets.length) for (const old of oldJobs) if (!tickets.some(row => row.station === old.station)) {
            const [cancel] = preparationTickets({ ...head.payload, lines: old.order.lines, status: 'cancelled', updatedAt: tickets[0].revision })
            if (cancel && !tickets.some(row => row.station === cancel.station)) tickets.push(cancel)
          }
          for (const ticket of tickets) {
          if (ticket.revision < config.startedAt) continue
          await jobs.updateOne({ ...filter, id: ticket.id }, { $setOnInsert: { ...ticket, state: 'pending', createdAt: new Date().toISOString() } }, { upsert: true })
          }
          const currentIds = new Set(tickets.map(row => row.id))
          for (const old of oldJobs) if (old.state === 'pending' && !currentIds.has(old.id)) await jobs.updateOne({ ...filter, id: old.id, state: 'pending' }, { $set: { state: 'superseded' } })
        }
        const pending = await jobs.find({ ...filter, state: { $in: ['pending', 'printing', 'failed'] } }).sort({ createdAt: 1 }).limit(100).toArray()
        send(response, 200, { shared: true, designated: true, jobs: pending }); return true
      }
      if (!designated) throw new Error('Only the designated printer device can handle this queue.')
      const input = await readJson(request, 4096), jobFilter = { ...filter, id: String(input.id || '') }
      if (url.pathname === '/v1/preparation-print/claim' && request.method === 'POST') {
        const attemptId = randomUUID()
        const result = await jobs.updateOne({ ...jobFilter, state: 'pending' }, { $set: { state: 'printing', deviceId: claims.deviceId, attemptId, claimedAt: new Date().toISOString() } })
        send(response, 200, { claimed: Boolean(result.modifiedCount), ...(result.modifiedCount ? { attemptId } : {}) }); return true
      }
      if (url.pathname === '/v1/preparation-print/result' && request.method === 'POST') {
        if (!input.attemptId) throw new Error('Printing attempt identity required.')
        const result = await jobs.updateOne({ ...jobFilter, state: 'printing', deviceId: claims.deviceId, attemptId: input.attemptId }, { $set: { state: input.error ? 'failed' : 'submitted', error: String(input.error || '').slice(0,300), finishedAt: new Date().toISOString() } })
        send(response, 200, { saved: Boolean(result.modifiedCount) }); return true
      }
      if (url.pathname === '/v1/preparation-print/retry' && request.method === 'POST') {
        if (input.confirmDuplicateRisk !== true) throw new Error('Confirm that a retry may print twice.')
        const job = await jobs.findOne(jobFilter)
        if (job?.state === 'printing' && Date.now() - Date.parse(job.claimedAt) < 60000) throw new Error('This ticket may still be printing. Wait at least one minute before reviewing a retry.')
        await jobs.updateOne({ ...jobFilter, state: { $in: ['failed', 'printing'] } }, { $set: { state: 'pending', error: '' } })
        send(response, 200, { saved: true }); return true
      }
      throw new Error('Unknown printing action.')
    } catch (error) { send(response, 400, { error: error.message }); return true }
  }
  return { handle }
}
