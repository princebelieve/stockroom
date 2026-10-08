import { randomBytes } from 'node:crypto'

export function authorizeCustomerOrder(order, customerId) {
  if ((order.customerPortalId || order.pos?.customerId) !== customerId) {
    const error = new Error('This order belongs to another customer session.')
    error.statusCode = 403
    throw error
  }
}

// Match counter-service recipe snapshots, including packaged restaurant drinks.
export async function customerOrderLines(menu, requestedLines, restaurant, productFor, retail = false) {
  if (!Array.isArray(requestedLines) || !requestedLines.length || requestedLines.length > 50) throw new Error('Choose between 1 and 50 menu items.')
  return Promise.all(requestedLines.map(async requested => {
    const item = menu.items.find(row => row.id === requested.menuItemId && row.available)
    const quantity = Number(requested.quantity)
    const optionIds = Array.isArray(requested.optionIds) ? requested.optionIds.map(String) : []
    if (!item || !(retail ? Number.isFinite(quantity) && Math.abs(quantity*1000-Math.round(quantity*1000))<0.000001 : Number.isSafeInteger(quantity)) || quantity < (retail ? 0.001 : 1) || quantity > 99 || new Set(optionIds).size !== optionIds.length) throw new Error('A menu item or quantity is no longer available.')
    const options = optionIds.map(id => {
      const option = item.options.find(row => row.id === id && row.available !== false)
      if (!option) throw new Error('A selected option is no longer available. Refresh the menu.')
      return { ...option }
    })
    const ingredients = new Map()
    const recipe = restaurant && item.type === 'stock' ? [{ productId: item.productId, quantity: 1 }] : item.recipe || []
    for (const entry of [...recipe, ...options.flatMap(option => option.recipe || [])]) {
      const product = await productFor(String(entry.productId))
      if (!product) throw new Error('The business needs to update this menu item before it can be ordered online.')
      const ingredient = ingredients.get(entry.productId) || { productId: String(entry.productId), name: product.name, unit: product.unit || '', quantity: 0 }
      ingredient.quantity = Math.round((ingredient.quantity + Number(entry.quantity)) * 1000) / 1000
      ingredients.set(entry.productId, ingredient)
    }
    return { id: randomBytes(12).toString('hex'), menuItemId: item.id, name: item.name, ...(restaurant ? { station: item.station || (item.type === 'stock' ? 'bar' : 'kitchen') } : {}), productId: item.type === 'stock' && !restaurant ? item.productId : '', ingredients: [...ingredients.values()], options, quantity, price: Math.round((Number(item.price) + options.reduce((sum, option) => sum + Number(option.price), 0)) * 100) / 100 }
  }))
}

// Idempotent publication repairs a crash between the head and operation writes.
export async function publishCustomerOrder(operations, head) {
  await operations.updateOne({ businessId: head.businessId, operationId: head.operationId }, { $setOnInsert: {
    businessId: head.businessId, operationId: head.operationId, deviceId: 'customer-portal', entityType: 'pos_record', entityId: head.entityId, action: 'upsert', payload: head.payload, createdAt: head.updatedAt, receivedAt: new Date(),
  } }, { upsert: true })
}

export async function acceptCustomerOrder({ entityHeads, operations, serialize, businessId, orderId, tillId, staffId }) {
  if (!/^[a-zA-Z0-9_-]{12,100}$/.test(tillId)) throw new Error('A valid checkout till is required.')
  return serialize(businessId, async () => {
    const filter = { businessId, entityType: 'pos_record', entityId: orderId }
    const head = await entityHeads.findOne(filter)
    if (!head || head.payload.source !== 'customer-portal') throw new Error('Online order not found.')
    if (head.payload.acceptedTillId) {
      if (head.payload.acceptedTillId !== tillId) throw new Error('Another till has already accepted this order. Synchronize to see its progress.')
      await publishCustomerOrder(operations, head)
      return head.payload
    }
    if (head.payload.status !== 'queued') throw new Error('This order has already entered preparation or closed.')
    const now = new Date().toISOString()
    const payload = { ...head.payload, tillId, ...(head.payload.pos ? { pos: { ...head.payload.pos, tillId } } : {}), acceptedTillId: tillId, updatedAt: now, expectedUpdatedAt: head.updatedAt, events: [...head.payload.events, { status: 'queued', action: 'accept', staffId, at: now }] }
    const accepted = { ...head, payload, updatedAt: now, operationId: `customer-accept:${orderId}`, deviceId: 'customer-portal' }
    const result = await entityHeads.updateOne({ ...filter, operationId: head.operationId }, { $set: { payload, updatedAt: now, operationId: accepted.operationId, deviceId: accepted.deviceId } })
    if (!result.modifiedCount) throw new Error('This order changed. Synchronize before accepting it.')
    await publishCustomerOrder(operations, accepted)
    return payload
  })
}
