import { useRef, useState } from 'react'
import { AsyncButton, AsyncForm, SubmitButton } from './AsyncControls'
import type { CounterOrder } from './CounterService'

export function DeliveryActions({ order, update }: { order: CounterOrder; update: (input: Record<string, unknown>) => Promise<unknown> }) {
  const [editing, setEditing] = useState(false)
  const commands = useRef(new Map<string, string>())
  if (!order.delivery || ['cancelled', 'collected'].includes(order.status)) return null
  const tracking = order.deliveryTracking
  const send = async (input: Record<string, unknown>) => {
    const key = JSON.stringify([order.id, order.updatedAt, input])
    if (!commands.current.has(key)) commands.current.set(key, crypto.randomUUID())
    await update({ id: order.id, expectedUpdatedAt: order.updatedAt, commandId: commands.current.get(key), status: order.status, ...input })
  }
  return <section><p>{order.delivery.zoneName && <>Delivery area: {order.delivery.zoneName}. </>}{tracking ? <>Agent: {tracking.courierName} / {tracking.courierPhone}. {tracking.status === 'dispatched' ? 'Out for delivery' : 'Assigned'}</> : 'No delivery agent assigned.'}</p>{tracking?.status !== 'dispatched' && <button type="button" className="filter-button" onClick={() => setEditing(!editing)}>{tracking ? 'Change delivery agent' : 'Assign delivery agent'}</button>}{editing && <AsyncForm onSubmit={async event => { const form = new FormData(event.currentTarget); await send({ deliveryAction: 'assign', courierName: form.get('name'), courierPhone: form.get('phone') }); setEditing(false) }}><label>Delivery agent name<input name="name" required maxLength={100} defaultValue={tracking?.courierName} /></label><label>Delivery agent phone<input name="phone" required minLength={6} maxLength={40} defaultValue={tracking?.courierPhone} /></label><SubmitButton className="primary-button">Save delivery agent</SubmitButton><button type="button" className="filter-button" onClick={() => setEditing(false)}>Cancel</button></AsyncForm>}{order.status === 'ready' && tracking?.status === 'assigned' && <AsyncButton className="primary-button" disabled={!order.receiptId} onClick={() => send({ deliveryAction: 'dispatch' })}>Dispatch delivery</AsyncButton>}</section>
}
