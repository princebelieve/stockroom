import { normalizeShopProfile } from './shop-profile.mjs'
import { counterSaleId } from './counter-service.mjs'
const text = (value, label, max = 100) => { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Enter ${label}.`); return value.trim() }
export const tableTabId = (branch, table) => `restaurant-tab:${branch}:${table}`
export function validateRestaurantRecord(record, previous, snapshot = false) {
  text(record.id, 'a record ID', 150); text(record.branchId, 'a branch');
  if (!Number.isFinite(Date.parse(record.updatedAt)) || record.expectedUpdatedAt === undefined) throw new Error('Invalid restaurant revision.')
  if (record.kind === 'restaurant-layout') {
    if (record.id !== `restaurant-layout:${record.branchId}` || !Array.isArray(record.tables) || record.tables.length > 100) throw new Error('Invalid table setup.')
    const ids = new Set(), names = new Set()
    for (const table of record.tables) {
      text(table.id, 'a table ID', 60); text(table.name, 'a table name', 60)
      if (ids.has(table.id) || names.has(table.name.toLowerCase()) || !Number.isInteger(table.seats) || table.seats < 1 || table.seats > 100) throw new Error('Use unique table names and 1 to 100 seats.')
      ids.add(table.id); names.add(table.name.toLowerCase())
    }
    return
  }
  if (record.kind !== 'restaurant-tab' || !['open','closed'].includes(record.status)) throw new Error('Invalid restaurant bill.')
  text(record.sessionId, 'a bill session'); text(record.name, 'a bill name'); text(record.tillId, 'a bill till')
  if (record.tableId && record.id !== tableTabId(record.branchId, record.tableId)) throw new Error('Invalid table bill ID.')
  if (!/^[A-Z]{3}$/.test(record.currency) || typeof record.businessName !== 'string') throw new Error('Invalid bill currency or business name.');
  if (!record.id.startsWith(`restaurant-tab:${record.branchId}:`) || !Number.isInteger(record.guests) || record.guests < 1 || record.guests > 100 || !Number.isFinite(Date.parse(record.openedAt))) throw new Error('Invalid bill details.')
  if (!previous) { if(!snapshot && record.history?.length) throw new Error('New bills cannot contain past sessions.'); if (!snapshot && record.status !== 'open') throw new Error('Open the bill first.'); return }
  if (record.branchId !== previous.branchId || record.tableId !== previous.tableId) throw new Error('Bill identity cannot change.')
  if (previous.status === 'closed' && record.status === 'open') { if (record.sessionId === previous.sessionId) throw new Error('Use a new bill session.'); const archive={id:previous.id,sessionId:previous.sessionId,name:previous.name,tableId:previous.tableId,guests:previous.guests,tillId:previous.tillId,status:'closed',openedAt:previous.openedAt,closedAt:previous.closedAt,currency:previous.currency,businessName:previous.businessName}; if(JSON.stringify(record.history)!==JSON.stringify([...(previous.history||[]),archive])) throw new Error('Preserve closed bill history.'); return }
  if (previous.status !== 'open' || record.status !== 'closed' || ['sessionId','name','guests','tillId','openedAt','currency','businessName'].some(key=>record[key] !== previous[key])) throw new Error('Refresh the bill before closing it.')
  if(JSON.stringify(record.history)!==JSON.stringify(previous.history)) throw new Error('Preserve bill history.')
}
export function validateRestaurantClose(tab, orders, sales) {
  const matching = orders.filter(order=>order.tableService?.tabId === tab.id && order.tableService?.sessionId === tab.sessionId)
  if (matching.some(order=>!['collected','cancelled'].includes(order.status))) throw new Error('Serve or cancel every order before closing the bill.')
  if (matching.some(order=>order.status !== 'cancelled' && !sales.some(sale=>sale.id === counterSaleId(order.id)))) throw new Error('Settle all unpaid orders before closing the bill.')
}
export async function handleRestaurant({ db, scope, organizationId, branchId, user, method, path, input, tillId, sales, publish, saveRecord }) {
  const profile = (await db.query(`SELECT shop_profile,app_name,currency FROM app_settings WHERE ${organizationId ? 'organization_id=?' : 'id=1'}`, organizationId ? [organizationId] : [])).values[0]
  if (!normalizeShopProfile(profile?.shop_profile).restaurant) throw new Error('The owner must enable Restaurant & bar first.')
  const rows = (await db.query("SELECT payload FROM pos_records WHERE scope=? AND branch_id=? AND kind IN ('restaurant-layout','restaurant-tab','counter-order')", [scope, branchId])).values.map(row=>JSON.parse(row.payload))
  const layout = rows.find(row=>row.kind === 'restaurant-layout') || { id:`restaurant-layout:${branchId}`, updatedAt:'', tables:[] }
  const loadedSales = await sales()
  const orders = rows.filter(row=>row.tableService)
  if (method === 'GET') return { layout, tabs:rows.filter(row=>row.kind === 'restaurant-tab'), orders:orders.map(order=>({...order, receiptId:loadedSales.some(sale=>sale.id === counterSaleId(order.id)) ? counterSaleId(order.id) : ''})) }
  if (method !== 'POST' || !tillId || !input.commandId) throw new Error('A registered till and command ID are required.')
  const existing = rows.find(row=>row.id === input.id)
  const request = JSON.stringify(input)
  if (existing?.lastCommandId === input.commandId) { if(existing.lastRequest !== request) throw new Error('This command has different details.'); return existing }
  if (input.expectedUpdatedAt !== (existing?.updatedAt || '')) throw new Error('This bill changed. Refresh before continuing.')
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(existing?.updatedAt || '') + 1 || 0)).toISOString()
  const stamp = { updatedAt, expectedUpdatedAt:existing?.updatedAt || '', lastCommandId:input.commandId, lastRequest:request, branchId, staffId:user.id, staffName:user.name }
  let record
  if (path.endsWith('/layout')) {
    if (!['owner','admin'].includes(user.role)) throw new Error('Only owner or admin can set up tables.')
    record = {...stamp, id:layout.id, kind:'restaurant-layout', tables:input.tables?.map(table=>({...table, name:typeof table.name === 'string' ? table.name.trim() : table.name}))}
    if (input.id !== layout.id) throw new Error('Invalid layout ID.')
    validateRestaurantRecord(record, existing)
    for (const tab of rows.filter(row=>row.kind === 'restaurant-tab' && row.status === 'open' && row.tableId)) {
      const before = layout.tables.find(table=>table.id === tab.tableId), after = record.tables.find(table=>table.id === tab.tableId)
      if (!after || !before || JSON.stringify(after) !== JSON.stringify(before)) throw new Error('Close the table bill before changing or removing that table.')
    }
  } else if (path.endsWith('/open')) {
    if (existing && (existing.kind !== 'restaurant-tab' || existing.status !== 'closed')) throw new Error('This table already has an open bill.')
    const table = input.tableId ? layout.tables.find(table=>table.id === input.tableId) : null
    if (input.tableId && !table) throw new Error('Choose a configured table.')
    if (table && input.id !== tableTabId(branchId, table.id)) throw new Error('Use the table bill ID.')
    record = {...stamp, id:input.id, kind:'restaurant-tab', status:'open', tableId:table?.id || '', name:table?.name || text(input.name,'a tab name'), guests:Number(input.guests), sessionId:text(input.sessionId,'a new bill session'), tillId, currency:profile.currency, businessName:profile.app_name, openedAt:updatedAt, history:existing ? [...(existing.history||[]),{id:existing.id,sessionId:existing.sessionId,name:existing.name,tableId:existing.tableId,guests:existing.guests,tillId:existing.tillId,status:'closed',openedAt:existing.openedAt,closedAt:existing.closedAt,currency:existing.currency,businessName:existing.businessName}] : [], events:[...(existing?.events || []), {action:'open', sessionId:input.sessionId, at:updatedAt, staffId:user.id}]}
    if(table && record.guests > table.seats) throw new Error('Guest count exceeds the seats available at this table.')
  } else if (path.endsWith('/close')) {
    if (!existing || existing.kind !== 'restaurant-tab' || existing.status !== 'open') throw new Error('Choose an open bill.')
    if(existing.tillId !== tillId) throw new Error('Close this bill on its original till.')
    validateRestaurantClose(existing, orders, loadedSales)
    record = {...existing, ...stamp, status:'closed', closedAt:updatedAt, events:[...existing.events, {action:'close', sessionId:existing.sessionId, at:updatedAt, staffId:user.id}]}
  } else throw new Error('Unknown restaurant action.')
  validateRestaurantRecord(record, existing)
  await db.beginTransaction()
  try {
    const current=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,record.id])).values[0]
    if ((current ? JSON.parse(current.payload).updatedAt : '') !== (existing?.updatedAt || '')) throw new Error('This bill changed. Refresh before continuing.')
    if(record.kind === 'restaurant-tab' && record.status === 'closed') { const freshOrders=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND branch_id=? AND kind='counter-order'",[scope,branchId])).values.map(row=>JSON.parse(row.payload)); validateRestaurantClose(record,freshOrders,await sales()) }
    await saveRecord(db,scope,record); await publish(record); await db.commitTransaction()
  } catch(error) { await db.rollbackTransaction(); throw error }
  return record
}
