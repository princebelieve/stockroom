import type { Stocktake } from '../types'
import { openMobileDatabase } from './mobileDatabase'

type Session = Stocktake & { approvedAt?: string }
type Queue = (entity: string, id: string, action: string, payload: Record<string, unknown>) => Promise<void>

export async function mobileStocktake(path: string, init: RequestInit | undefined, allowed: boolean, queue: Queue): Promise<Response | null> {
  if (!path.startsWith('/api/stocktakes')) return null
  const fail = (error: string, status = 400) => new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json' } })
  if (!allowed) return fail('Operational access is required.', 403)
  const db = await openMobileDatabase()
  const method = (init?.method || 'GET').toUpperCase()
  const all = async () => (await db.query('SELECT payload FROM mobile_stocktakes ORDER BY created_at DESC, rowid DESC')).values?.map(row => JSON.parse(String(row.payload)) as Session) || []
  const save = (session: Session) => db.run('INSERT INTO mobile_stocktakes (id, created_at, payload) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload', [session.id, session.createdAt, JSON.stringify(session)])
  if (path === '/api/stocktakes' && method === 'GET') {
    const sessions = await all()
    return new Response(JSON.stringify({ stocktake: sessions.find(session => session.status === 'draft') || sessions[0] || null, stocktakes: sessions }), { headers: { 'Content-Type': 'application/json' } })
  }
  if (path === '/api/stocktakes' && method === 'POST') {
    const draft = (await all()).find(session => session.status === 'draft')
    if (draft) return new Response(JSON.stringify(draft), { headers: { 'Content-Type': 'application/json' } })
    const products = (await db.query('SELECT id, name, sku, stock FROM products ORDER BY name')).values || []
    if (!products.length) return fail('Add or synchronize inventory before starting a stocktake.')
    const session: Session = { id: crypto.randomUUID(), status: 'draft', createdAt: new Date().toISOString(), counts: products.map(product => ({ id: crypto.randomUUID(), productId: String(product.id), name: String(product.name), sku: String(product.sku), expected: Number(product.stock), counted: Number(product.stock), variance: 0 })), history: [] }
    await save(session)
    return new Response(JSON.stringify(session), { status: 201, headers: { 'Content-Type': 'application/json' } })
  }
  const match = path.match(/^\/api\/stocktakes\/([^/]+)(?:\/(approve|counts\/([^/]+)))?$/)
  if (!match) return fail('Stocktake route not found.', 404)
  const row = (await db.query('SELECT payload FROM mobile_stocktakes WHERE id = ?', [match[1]])).values?.[0]
  if (!row) return fail('Stocktake not found.', 404)
  const session = JSON.parse(String(row.payload)) as Session
  if (!match[2] && method === 'GET') return new Response(JSON.stringify(session), { headers: { 'Content-Type': 'application/json' } })
  const input = JSON.parse(String(init?.body || '{}')) as { counted?: unknown; reason?: unknown }
  if (match[3] && method === 'PUT') {
    if (session.status !== 'draft') return fail('Approved stocktakes cannot be edited.', 409)
    if (!Number.isInteger(input.counted) || Number(input.counted) < 0) return fail('Count must be a whole number zero or greater.')
    const count = session.counts.find(item => item.id === match[3])
    if (!count) return fail('Stocktake item not found.', 404)
    count.counted = Number(input.counted); count.variance = count.counted - count.expected
    await save(session)
    return new Response(JSON.stringify(session), { headers: { 'Content-Type': 'application/json' } })
  }
  if (match[2] === 'approve' && method === 'POST') {
    if (session.status === 'approved') return new Response(JSON.stringify(session), { headers: { 'Content-Type': 'application/json' } })
    const reason = String(input.reason || '').trim()
    if (!reason || reason.length > 500) return fail('Enter an approval reason of 1-500 characters.')
    const approvedAt = new Date().toISOString()
    for (const count of session.counts) {
      if (!count.variance) continue
      const product = (await db.query('SELECT stock FROM products WHERE id = ?', [count.productId])).values?.[0]
      if (!product || Number(product.stock) + count.variance < 0) return fail(`Cannot approve: insufficient current stock for ${count.name}. Review the count.`)
    }
    for (const count of session.counts) {
      if (!count.variance) continue
      await db.run('UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?', [count.variance, approvedAt, count.productId])
      const movementId = crypto.randomUUID()
      await db.run('INSERT INTO inventory_movements (id, product_id, quantity, reason, created_at) VALUES (?, ?, ?, ?, ?)', [movementId, count.productId, count.variance, reason, approvedAt]);
      (session.history ||= []).push({ ...count, id: movementId, reason, createdAt: approvedAt })
    }
    session.status = 'approved'; session.approvalReason = reason; session.approvedAt = approvedAt
    await save(session)
    await queue('stocktake', session.id, 'approved', { ...session })
    return new Response(JSON.stringify(session), { headers: { 'Content-Type': 'application/json' } })
  }
  return fail('Method not allowed.', 405)
}
