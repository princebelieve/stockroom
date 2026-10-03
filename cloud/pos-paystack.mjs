import { createHash } from 'node:crypto'

export function paystackShopConfig(businessId, env = process.env) {
  let configurations
  try { configurations = JSON.parse(env.POS_PAYSTACK_CONFIG_JSON || '{}') } catch { throw new Error('Paystack Terminal server configuration is invalid.') }
  const config = configurations?.[businessId]
  return config && /^sk_(test|live)_/.test(config.secretKey || '') && config.terminalId && config.customerCode ? config : null
}
export function terminalFingerprint(input) {
  return createHash('sha256').update(JSON.stringify({ orderId: input.orderId, amount: input.amount, currency: input.currency, branchId: input.branchId })).digest('hex')
}
export function createPaystackClient(config, fetcher = fetch) {
  async function api(path, input) {
    const response = await fetcher(`https://api.paystack.co${path}`, { method: input === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${config.secretKey}`, 'Content-Type': 'application/json' }, ...(input === undefined ? {} : { body: JSON.stringify(input) }), signal: AbortSignal.timeout(20000) })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || result.status !== true) throw new Error(`Paystack could not complete the request (${response.status}). Check the terminal and Paystack dashboard before retrying.`)
    return result.data
  }
  return {
    presence: () => api(`/terminal/${encodeURIComponent(config.terminalId)}/presence`),
    invoice: input => api('/paymentrequest', { customer: config.customerCode, amount: input.amount, currency: input.currency, description: `Stockroom sale ${input.orderId}`, metadata: JSON.stringify({ stockroomOrderId: input.orderId, branchId: input.branchId }), send_notification: false, draft: false }),
    push: invoice => api(`/terminal/${encodeURIComponent(config.terminalId)}/event`, { type: 'invoice', action: 'process', data: { id: invoice.id, reference: invoice.offline_reference } }),
    async verify(request) {
      const invoice = await api(`/paymentrequest/verify/${encodeURIComponent(request.requestCode)}`)
      if (Number(invoice.amount) !== request.amount || invoice.currency !== request.currency || String(invoice.id) !== String(request.invoiceId)) throw new Error('Paystack returned a different invoice, amount, or currency. Payment has not been approved in this app.')
      return { paid: invoice.paid === true && invoice.status === 'success', reference: request.requestCode, status: invoice.status || 'pending' }
    }
  }
}

export async function createPosPaystack({ database, configFor = paystackShopConfig, fetcher = fetch }) {
  const requests = database.collection('pos_paystack_requests')
  await requests.createIndex({ businessId: 1, orderId: 1 }, { unique: true })
  const view = record => ({ orderId: record.orderId, amount: record.amount / 100, currency: record.currency, reference: record.requestCode || '', status: record.status, paid: record.status === 'paid', terminalId: record.terminalId })
  return async function handle({ businessId, path, method, input = {} }) {
    const config = configFor(businessId)
    if (path === '/v1/pos-paystack/config') return { configured: Boolean(config), terminalId: config?.terminalId || '', testMode: config?.secretKey.startsWith('sk_test_') || false }
    if (!config) throw new Error('Paystack Terminal is not connected for this shop. Ask the owner to complete setup.')
    const client = createPaystackClient(config, fetcher)
    if (path === '/v1/pos-paystack/presence') return client.presence()
    if (!/^[a-zA-Z0-9-]{10,100}$/.test(String(input.orderId || ''))) throw new Error('A valid order ID is required.')
    const filter = { businessId, orderId: input.orderId }
    let record = await requests.findOne(filter)
    if (path === '/v1/pos-paystack/start' && method === 'POST') {
      const amount = Math.round(Number(input.amount) * 100)
      if (!Number.isSafeInteger(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(String(input.currency || ''))) throw new Error('Enter a valid payment amount and currency.')
      const fingerprint = terminalFingerprint({ ...input, amount })
      if (record) {
        if (record.fingerprint !== fingerprint) throw new Error('This order already has a different payment request. Resolve it in Paystack before changing the basket.')
        return view(record)
      }
      const presence = await client.presence()
      if (!presence.online || !presence.available) throw new Error('The Paystack terminal is offline or busy.')
      record = { ...filter, amount, currency: input.currency, branchId: String(input.branchId || 'main'), fingerprint, terminalId: config.terminalId, status: 'creating', createdAt: new Date() }
      try { await requests.insertOne(record) } catch (error) {
        if (error.code !== 11000) throw error
        const existing = await requests.findOne(filter)
        if (existing.fingerprint !== fingerprint) throw new Error('A different payment request already exists for this order.')
        return view(existing)
      }
      try {
        const invoice = await client.invoice({ ...input, amount })
        if (!invoice.id || !invoice.offline_reference || !invoice.request_code) throw new Error('Paystack returned an incomplete payment request.')
        Object.assign(record, { invoiceId: invoice.id, requestCode: invoice.request_code, offlineReference: invoice.offline_reference, status: 'pending' })
        await requests.updateOne(filter, { $set: { invoiceId: record.invoiceId, requestCode: record.requestCode, offlineReference: record.offlineReference, status: 'pending' } })
        const event = await client.push(invoice)
        await requests.updateOne(filter, { $set: { eventId: event.id } })
        return view(record)
      } catch (error) {
        await requests.updateOne(filter, { $set: { status: record.requestCode ? 'pending' : 'uncertain' } })
        throw error
      }
    }
    if (path === '/v1/pos-paystack/verify' && method === 'POST') {
      if (!record) return { paid: false, status: 'not-started', orderId: input.orderId }
      if (!record.requestCode) return { ...view(record), message: 'Payment creation is unresolved. Check the Paystack dashboard before taking another payment.' }
      const verified = await client.verify(record)
      await requests.updateOne(filter, { $set: { status: verified.paid ? 'paid' : verified.status, checkedAt: new Date() } })
      return { ...view(record), ...verified, amount: record.amount / 100, currency: record.currency }
    }
    throw new Error('Unknown Paystack Terminal action.')
  }
}
