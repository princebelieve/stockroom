import { normalizeShopProfile } from './shop-profile.mjs'

const text = (value, label, max = 100) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`Enter ${label} (up to ${max} characters).`)
  return value.trim()
}
const money = value => {
  const n = Number(value)
  if (value === '' || value == null || !Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 100)) || Math.abs(n * 100 - Math.round(n * 100)) > 0.000001) throw new Error('Enter a price with at most two decimals.')
  return n
}
export const counterSaleId = id => `counter-payment:${id}`
export const requiresCounterSync = operation => ['counter-menu', 'counter-order'].includes(operation.payload?.kind) || Boolean(operation.payload?.paymentDetails?.counterOrder) || operation.payload?.shopProfile?.fastFood === true
export function counterPaymentFingerprint(sale) {
  return JSON.stringify([sale.id, sale.branchId, sale.total, sale.paymentMethod, sale.paymentReference || '', sale.terminalProvider || '', sale.paymentDetails?.amountReceived, sale.paymentDetails?.counterOrder])
}
export function validateCounterRetry(sale, previous) {
  if (counterPaymentFingerprint(sale) !== counterPaymentFingerprint(previous)) throw new Error('This order is already paid with different payment details. Reprint its existing receipt.')
}
export const counterItems = order => order.lines.map(line => ({ productId: line.productId || `service:counter:${line.id}`, productName: [line.name, ...line.options.map(option => option.name)].join(' / '), quantity: line.quantity, price: line.price }))
export function validateCounterPayment(sale, order, tillId) {
  if (!order || order.kind !== 'counter-order' || order.branchId !== sale.branchId) throw new Error('Synchronize this order before taking payment.')
  if (sale.id !== counterSaleId(order.id) || sale.paymentDetails?.counterOrder?.id !== order.id) throw new Error('Use the order payment action to settle this order.')
  if (tillId && tillId !== order.tillId) throw new Error('Take payment on the till that created this order.')
  if (sale.paymentDetails.counterOrder.tillId !== order.tillId) throw new Error('Payment till does not match the order.')
  if (sale.currency !== order.currency) throw new Error('Payment currency must match the saved order.')
  const actual = sale.items?.map(({ productId, productName, quantity, price }) => ({ productId, productName, quantity, price }))
  if (JSON.stringify(actual) !== JSON.stringify(counterItems(order)) || money(sale.total) !== order.total) throw new Error('Payment must match the saved order items and total.')
  if (!['cash', 'bank-transfer', 'external-pos'].includes(sale.paymentMethod) || sale.paymentDetails?.pos || sale.paymentDetails?.servicePayment) throw new Error('Choose a supported order payment method.')
}
export function validateCounterRecord(record, previous, snapshot = false) {
  if (!record || !['counter-menu', 'counter-order'].includes(record.kind)) throw new Error('Invalid counter-service record.')
  text(record.id, 'a record ID', 150); text(record.branchId, 'a branch ID')
  if (!Number.isFinite(Date.parse(record.updatedAt)) || record.expectedUpdatedAt === undefined) throw new Error('Invalid counter-service revision.')
  if (record.kind === 'counter-menu') {
    if (record.id !== 'counter-menu' || record.branchId !== 'main' || !Array.isArray(record.items) || record.items.length > 200) throw new Error('Invalid menu.')
    const ids = new Set()
    for (const item of record.items) {
      text(item.id, 'a menu item ID'); text(item.name, 'a menu item name', 100); money(item.price)
      if (ids.has(item.id) || typeof item.available !== 'boolean' || !['prepared', 'stock'].includes(item.type) || (item.type === 'stock' && !item.productId) || !Array.isArray(item.options) || item.options.length > 20) throw new Error('Invalid menu item.')
      ids.add(item.id)
      const options = new Set()
      for (const option of item.options) { text(option.id, 'an option ID'); text(option.name, 'an option name', 60); money(option.price); if (options.has(option.id)) throw new Error('Duplicate menu option.'); options.add(option.id) }
    }
    return
  }
  if (!['queued', 'preparing', 'ready', 'collected'].includes(record.status) || !Array.isArray(record.lines) || !record.lines.length || record.lines.length > 100 || !record.tillId || !Number.isFinite(Date.parse(record.createdAt)) || !/^[A-Z]{3}$/.test(record.currency) || typeof record.businessName !== 'string') throw new Error('Invalid counter order.')
  const ids = new Set()
  for (const line of record.lines) {
    text(line.id, 'a line ID'); text(line.name, 'an item name'); money(line.price)
    if (ids.has(line.id) || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 999 || !Array.isArray(line.options) || line.options.length > 20) throw new Error('Invalid order line.')
    ids.add(line.id)
    for (const option of line.options) { text(option.name, 'an option name', 60); money(option.price) }
    if (counterItems({ lines: [line] })[0].productName.length > 200) throw new Error('Selected options make the item description too long.')
  }
  if (money(record.total) <= 0 || Math.round(record.lines.reduce((sum, line) => sum + line.quantity * line.price, 0) * 100) !== Math.round(record.total * 100)) throw new Error('Invalid order total.')
  if (!previous) { if (!snapshot && record.status !== 'queued') throw new Error('A new order must enter the preparation queue.'); return }
  const immutable = order => JSON.stringify([order.id, order.branchId, order.lines, order.total, order.tillId, order.createdAt, order.customerName, order.note, order.currency, order.businessName])
  if (immutable(record) !== immutable(previous)) throw new Error('Submitted order details cannot be changed.')
  const next = { queued: 'preparing', preparing: 'ready', ready: 'collected' }
  if (next[previous.status] !== record.status) throw new Error('Refresh the order and follow its preparation stages.')
}

// Preserve rejected edits in the conflict log, but show the accepted cloud
// version of the order/menu even when the rejected local timestamp is newer.
export function counterConflictRecord(conflict) {
  const local = conflict.localPayload, remote = conflict.remotePayload
  if (conflict.entityType !== 'pos_record' || !['counter-menu', 'counter-order'].includes(local?.kind) || remote?.kind !== local.kind || remote.id !== conflict.entityId) return null
  validateCounterRecord(remote, undefined, true)
  return remote
}

export async function handleCounter({ db, scope, organizationId, branchId, user, method, path, input, tillId, sales, publish, saveRecord }) {
  const profile = (await db.query(`SELECT shop_profile,app_name,currency FROM app_settings WHERE ${organizationId ? 'organization_id=?' : 'id=1'}`, organizationId ? [organizationId] : [])).values[0]
  if (!normalizeShopProfile(profile?.shop_profile).fastFood) throw new Error('The owner must enable the Fast food workspace first.')
  const records = (await db.query("SELECT payload FROM pos_records WHERE scope=? AND kind IN ('counter-menu','counter-order')", [scope])).values.map(row => JSON.parse(row.payload))
  const loadedSales = await sales()
  const menu = records.find(record => record.kind === 'counter-menu')
  const orders = records.filter(record => record.kind === 'counter-order' && record.branchId === branchId)
  if (method === 'GET') return {
    menu: menu || { id: 'counter-menu', updatedAt: '', items: [] },
    orders: orders.map(order => ({ ...order, receiptId: loadedSales.find(sale => sale.id === counterSaleId(order.id))?.id || '' })),
    receipts: loadedSales.filter(sale => orders.some(order => sale.id === counterSaleId(order.id))).map(sale => { const order = orders.find(order => counterSaleId(order.id) === sale.id); return { ...sale, branchId, businessName: order.businessName, currency: order.currency, syncStatus: 'synced' } })
  }
  if (method !== 'POST' || !tillId) throw new Error('A registered till is required.')
  const existing = records.find(record => record.id === input.id)
  const request = JSON.stringify(input)
  if (existing?.lastCommandId === input.commandId && input.commandId) {
    if (existing.lastRequest !== request) throw new Error('This command ID has different details.')
    return existing
  }
  if (!input.commandId || input.expectedUpdatedAt !== (existing?.updatedAt || '')) throw new Error('This record changed. Refresh before continuing.')
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(existing?.updatedAt || '') + 1 || 0)).toISOString()
  const stamp = { updatedAt, expectedUpdatedAt: existing?.updatedAt || '', lastCommandId: input.commandId, lastRequest: request, staffId: user.id, staffName: user.name }
  let record
  if (path === '/api/pos/counter/menu') {
    if (!['owner', 'admin'].includes(user.role)) throw new Error('Only owner or admin can edit the menu.')
    if (input.id !== 'counter-menu') throw new Error('Invalid menu ID.')
    record = { ...stamp, id: 'counter-menu', kind: 'counter-menu', branchId: 'main', items: input.items }
    validateCounterRecord(record, existing)
    record.items = record.items.map(item => ({ ...item, name: item.name.trim(), price: money(item.price), options: item.options.map(option => ({ ...option, name: option.name.trim(), price: money(option.price) })) }))
    for (const item of record.items.filter(item => item.type === 'stock')) if (!(await db.query(`SELECT id FROM products WHERE id=?${organizationId ? ' AND organization_id=?' : ''}`, [item.productId, ...(organizationId ? [organizationId] : [])])).values.length) throw new Error('Choose an existing stock product for packaged goods.')
  } else if (path === '/api/pos/counter/orders') {
    if (existing || !input.id || !Array.isArray(input.lines) || !input.lines.length || input.lines.length > 100) throw new Error('Enter a new order with 1 to 100 lines.')
    if ((await db.query('SELECT id FROM pos_records WHERE scope=? AND id=?', [scope, input.id])).values.length) throw new Error('This record ID is already in use.')
    if (input.menuUpdatedAt !== menu?.updatedAt) throw new Error('The menu changed. Refresh and review the order before submitting.')
    const lines = input.lines.map(line => {
      const item = menu?.items.find(item => item.id === line.menuItemId && item.available)
      if (!item || !Array.isArray(line.optionIds) || new Set(line.optionIds).size !== line.optionIds.length) throw new Error('Choose available menu items and valid options.')
      const options = line.optionIds.map(id => { const option = item.options.find(option => option.id === id); if (!option) throw new Error('Menu options changed. Refresh the menu.'); return { ...option } })
      return { id: text(line.id, 'a line ID'), menuItemId: item.id, name: item.name, productId: item.type === 'stock' ? item.productId : '', options, quantity: line.quantity, price: Math.round((Number(item.price) + options.reduce((sum, option) => sum + Number(option.price), 0)) * 100) / 100 }
    })
    record = { ...stamp, id: input.id, kind: 'counter-order', branchId, status: 'queued', tillId, currency: profile.currency, businessName: profile.app_name, createdAt: updatedAt, customerName: String(input.customerName || '').trim().slice(0, 100), note: String(input.note || '').trim().slice(0, 300), lines, total: Math.round(lines.reduce((sum, line) => sum + line.quantity * line.price, 0) * 100) / 100, events: [{ status: 'queued', staffId: user.id, at: updatedAt }] }
    validateCounterRecord(record)
  } else if (path === '/api/pos/counter/status') {
    if (!existing || existing.kind !== 'counter-order' || existing.branchId !== branchId) throw new Error('Order not found in this branch.')
    if (input.status === 'collected' && !loadedSales.some(sale => sale.id === counterSaleId(existing.id))) throw new Error('Take payment before handing over the order.')
    record = { ...existing, ...stamp, status: input.status, events: [...existing.events, { status: input.status, staffId: user.id, at: updatedAt }] }
    validateCounterRecord(record, existing)
  } else throw new Error('Unknown counter-service action.')
  await db.beginTransaction()
  try { await saveRecord(db, scope, record); await publish(record); await db.commitTransaction() } catch (error) { await db.rollbackTransaction(); throw error }
  return record
}
