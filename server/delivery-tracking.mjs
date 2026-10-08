const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
export function deliveryProgress(order, input, at) {
  if (!order.delivery || ['cancelled', 'collected'].includes(order.status)) throw new Error('Choose an open delivery order.')
  const current = order.deliveryTracking
  if (input.deliveryAction === 'assign') {
    if (current?.status === 'dispatched') throw new Error('A dispatched delivery cannot be reassigned.')
    const courierName = String(input.courierName || '').trim(), courierPhone = String(input.courierPhone || '').trim()
    if (!courierName || courierName.length > 100 || courierPhone.length < 6 || courierPhone.length > 40) throw new Error('Enter the delivery agent name and phone number.')
    return { status: 'assigned', courierName, courierPhone, assignedAt: at }
  }
  if (input.deliveryAction === 'dispatch' && order.status === 'ready' && current?.status === 'assigned') return { ...current, status: 'dispatched', dispatchedAt: at }
  throw new Error('Assign a delivery agent and mark the order ready before dispatching it.')
}
export function validateDeliveryTracking(record, previous) {
  const tracking = record.deliveryTracking
  if (tracking) {
    if (!record.delivery || !['assigned', 'dispatched', 'delivered'].includes(tracking.status) || typeof tracking.courierName !== 'string' || !tracking.courierName.trim() || tracking.courierName.length > 100 || typeof tracking.courierPhone !== 'string' || tracking.courierPhone.length < 6 || tracking.courierPhone.length > 40 || !Number.isFinite(Date.parse(tracking.assignedAt))) throw new Error('Invalid delivery assignment.')
    if (tracking.status !== 'assigned' && !Number.isFinite(Date.parse(tracking.dispatchedAt))) throw new Error('Invalid delivery dispatch.')
    if (tracking.status === 'delivered' && (record.status !== 'collected' || !Number.isFinite(Date.parse(tracking.deliveredAt)))) throw new Error('Invalid delivery completion.')
    if (tracking.status === 'dispatched' && !['ready', 'cancelled'].includes(record.status)) throw new Error('Dispatched orders must remain ready until delivered.')
  }
  if (!previous) { if (!record.expectedUpdatedAt && tracking) throw new Error('A new order cannot include a delivery assignment.'); return }
  if (record.action === 'delivery') {
    if (record.status !== previous.status || !same(tracking, deliveryProgress(previous, { deliveryAction: record.deliveryAction, courierName: tracking?.courierName, courierPhone: tracking?.courierPhone }, record.updatedAt))) throw new Error('Invalid delivery progress.')
    return
  }
  if (record.status === 'collected' && previous.status !== 'collected' && previous.delivery && !previous.deliveryTracking) throw new Error('Assign and dispatch the delivery before completing it.')
  if (record.status === 'collected' && previous.deliveryTracking) {
    if (previous.deliveryTracking.status !== 'dispatched' || !same(tracking, { ...previous.deliveryTracking, status: 'delivered', deliveredAt: record.updatedAt })) throw new Error('Dispatch the delivery before completing it.')
  } else if (!same(tracking, previous.deliveryTracking)) throw new Error('Use the delivery action to change its assignment or progress.')
}
