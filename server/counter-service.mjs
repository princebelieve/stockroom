import { validateServiceJob } from './service-jobs.mjs'
import { floorId,restaurantTabs,billContains,validateFloorSnapshot } from './restaurant-floor.mjs'
import { restaurantOrderPayment, selectionsForOrder } from './restaurant-payments.mjs'
import { validateRestaurantRecord } from './restaurant-service.mjs'
import { consumeRecipe, consumptionId, recipeRequirements, validateRecipe } from './counter-recipes.mjs'
import { normalizeShopProfile } from './shop-profile.mjs'
import { posSettings, priceOrder, loyaltyBalances } from './pos-pricing.mjs'

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
export const requiresRestaurantSync = operation => ['restaurant-layout','restaurant-tab','restaurant-ledger','restaurant-floor'].includes(operation.payload?.kind) || operation.payload?.id === 'restaurant-menu' || Boolean(operation.payload?.tableService || operation.payload?.restaurantOrder || operation.payload?.paymentDetails?.restaurantBill || operation.payload?.paymentDetails?.counterOrder?.tableService || operation.payload?.shopProfile?.restaurant || operation.payload?.shopProfile?.workflows === 'restaurant')
export const requiresCounterSync = operation => ['counter-menu', 'counter-order', 'counter-consumption'].includes(operation.payload?.kind) || Boolean(operation.payload?.paymentDetails?.counterOrder) || operation.payload?.shopProfile?.fastFood === true
export function counterPaymentFingerprint(sale) {
  return JSON.stringify([sale.id, sale.branchId, sale.total, sale.paymentMethod, sale.paymentReference || '', sale.terminalProvider || '', sale.paymentDetails?.amountReceived, sale.paymentDetails?.allocations, sale.paymentDetails?.cashReceived, sale.paymentDetails?.changeGiven, sale.paymentDetails?.counterOrder, ['tillId','customerId','customerName','discountType','discountValue','loyaltyRedeemed','tax','note','registerId'].map(key => sale.paymentDetails?.pos?.[key])])
}
export function validateCounterRetry(sale, previous) {
  if (counterPaymentFingerprint(sale) !== counterPaymentFingerprint(previous)) throw new Error('This order is already paid with different payment details. Reprint its existing receipt.')
}
export const counterItems = order => order.lines.map(line => ({ productId: line.productId || `service:counter:${line.id}`, productName: [line.name, ...line.options.map(option => option.name)].join(' / '), quantity: line.quantity, price: line.price }))
export function validateCounterPayment(sale, order, tillId) {
  if (!order || order.kind !== 'counter-order' || order.branchId !== sale.branchId) throw new Error('Synchronize this order before taking payment.')
  if (order.status === 'cancelled') throw new Error('Cancelled orders cannot be paid.')
  if (sale.id !== counterSaleId(order.id) || sale.paymentDetails?.counterOrder?.id !== order.id) throw new Error('Use the order payment action to settle this order.')
  if (tillId && tillId !== order.tillId && order.source !== 'customer-portal') throw new Error('Take payment on the till that created this order.')
  if (!order.tableService && (sale.paymentDetails.counterOrder.diningOption || 'Takeaway') !== (order.diningOption || 'Takeaway')) throw new Error('Payment must match the order type.')
  if (sale.paymentDetails.counterOrder.tillId !== order.tillId) throw new Error('Payment till does not match the order.')
  if (JSON.stringify(sale.paymentDetails.counterOrder.tableService) !== JSON.stringify(order.tableService)) throw new Error('Payment must match the table bill and seat.');
  if (sale.currency !== order.currency) throw new Error('Payment currency must match the saved order.')
  const actual = sale.items?.map(({ productId, productName, quantity, price }) => ({ productId, productName, quantity, price }))
  if (JSON.stringify(actual) !== JSON.stringify(counterItems(order)) || money(sale.total) !== order.total) throw new Error('Payment must match the saved order items and total.')
  if (order.pos) {
    const fields = ['tillId','customerId','customerName','discountType','discountValue','loyaltyRedeemed','tax','note']
    if (fields.some(key => JSON.stringify(sale.paymentDetails?.pos?.[key]) !== JSON.stringify(order.pos[key]))) throw new Error('Payment adjustments must match the saved order.')
  } else if (sale.paymentDetails?.pos) throw new Error('This saved order has no payment adjustments.')
  if (!['cash', 'bank-transfer', 'external-pos', 'multiple', 'wallet'].includes(sale.paymentMethod) || sale.paymentDetails?.servicePayment) throw new Error('Choose a supported order payment method.')
}
export function validateCounterRecord(record, previous, snapshot = false) {
  if (!record || !['counter-menu', 'counter-order'].includes(record.kind)) throw new Error('Invalid counter-service record.')
  text(record.id, 'a record ID', 150); text(record.branchId, 'a branch ID')
  if (!Number.isFinite(Date.parse(record.updatedAt)) || record.expectedUpdatedAt === undefined) throw new Error('Invalid counter-service revision.')
  if (record.kind === 'counter-menu') {
    if (!['counter-menu','restaurant-menu'].includes(record.id) || record.branchId !== 'main' || !Array.isArray(record.items) || record.items.length > 200) throw new Error('Invalid menu.')
    const ids = new Set()
    for (const item of record.items) {
      text(item.id, 'a menu item ID'); text(item.name, 'a menu item name', 100); money(item.price)
      if (ids.has(item.id) || typeof item.available !== 'boolean' || !['prepared', 'stock'].includes(item.type) || (item.type === 'stock' && !item.productId) || !Array.isArray(item.options) || item.options.length > 20) throw new Error('Invalid menu item.')
      ids.add(item.id)
      if(item.station !== undefined && !['kitchen','bar'].includes(item.station)) throw new Error('Choose kitchen or bar.');
      validateRecipe(item.recipe)
      if (item.type === 'stock' && item.recipe?.length) throw new Error('Packaged goods cannot also consume a recipe.')
      const options = new Set()
      for (const option of item.options) { text(option.id, 'an option ID'); text(option.name, 'an option name', 60); money(option.price); validateRecipe(option.recipe); if (item.type === 'stock' && option.recipe?.length) throw new Error('Packaged goods cannot consume recipe extras.'); if (options.has(option.id)) throw new Error('Duplicate menu option.'); options.add(option.id) }
    }
    return
  }
  if (!['queued', 'preparing', 'ready', 'collected', 'cancelled'].includes(record.status) || !Array.isArray(record.lines) || !record.lines.length || record.lines.length > 100 || !record.tillId || !Number.isFinite(Date.parse(record.createdAt)) || !/^[A-Z]{3}$/.test(record.currency) || typeof record.businessName !== 'string') throw new Error('Invalid counter order.')
  if(record.diningOption!==undefined && !['Takeaway','Dine in','Delivery'].includes(record.diningOption))throw new Error('Choose a valid order type.')
  if (record.tableService) { const t = record.tableService; text(t.tabId, 'a table bill ID',150); text(t.sessionId,'a bill session'); text(t.name,'a table name'); if (!Number.isInteger(t.seat) || t.seat < 0 || t.seat > 100) throw new Error('Invalid seat.'); }
  const ids = new Set()
  for (const line of record.lines) {
    text(line.id, 'a line ID'); text(line.name, 'an item name'); money(line.price)
    if (ids.has(line.id) || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 999 || !Array.isArray(line.options) || line.options.length > 20) throw new Error('Invalid order line.')
    ids.add(line.id)
    if(line.station!==undefined && !['kitchen','bar'].includes(line.station))throw new Error('Choose kitchen or bar for each line.')
    validateRecipe(line.ingredients)
    for (const option of line.options) { text(option.name, 'an option name', 60); money(option.price) }
    if (counterItems({ lines: [line] })[0].productName.length > 200) throw new Error('Selected options make the item description too long.')
  }
  const pricing = record.pos ? priceOrder(counterItems(record), record.pos) : priceOrder(counterItems(record))
  if (money(record.total) <= 0 || Math.round(pricing.total * 100) !== Math.round(record.total * 100) || (record.pos && JSON.stringify(pricing) !== JSON.stringify(record.pos.pricing))) throw new Error('Invalid order total.')
  if (!previous) { if (!snapshot && record.status !== 'queued') throw new Error('A new order must enter the preparation queue.'); return }
  if (record.action === 'edit' && previous.status === 'queued' && record.status === 'queued') {
    text(record.changeReason, 'an order correction reason', 300)
    if (['id','branchId','tillId','createdAt','currency','businessName'].some(key => record[key] !== previous[key])) throw new Error('Order identity cannot change.')
    if (JSON.stringify(record.tableService) !== JSON.stringify(previous.tableService)) throw new Error('Order table and seat cannot change.');
    return
  }
  const immutable = order => JSON.stringify([order.id, order.branchId, order.lines, order.total, order.tillId, order.createdAt, order.customerName, order.note, order.currency, order.businessName, order.pos, order.tableService, order.diningOption])
  if (immutable(record) !== immutable(previous)) throw new Error('Submitted order details cannot be changed.')
  if (record.status === 'cancelled' && previous.status !== 'cancelled' && (previous.status !== 'collected' || previous.tableService)) { text(record.changeReason, 'a cancellation reason', 300); return }
  if(record.tableService && record.action==='station-ready') {
    const stations=[...new Set(previous.lines.map(line=>line.station||'kitchen'))]
    const changed=stations.filter(station=>Boolean(record.stationReady?.[station])!==Boolean(previous.stationReady?.[station]))
    if(previous.status!=='preparing' || changed.length!==1 || record.stationReady[changed[0]]!==true || Object.keys(record.stationReady).some(station=>!stations.includes(station)) || record.status!==(stations.every(station=>record.stationReady[station])?'ready':'preparing')) throw new Error('Refresh the station progress before marking it ready.')
    return
  }
  const next = { queued: 'preparing', preparing: 'ready', ready: 'collected' }
  if (next[previous.status] !== record.status) throw new Error('Refresh the order and follow its preparation stages.')
}

// Preserve rejected edits in the conflict log, but show the accepted cloud
// version of the order/menu even when the rejected local timestamp is newer.
export function counterConflictRecord(conflict) {
  const local = conflict.localPayload, remote = conflict.remotePayload
  if(conflict.entityType==='pos_record' && local?.kind==='service-job' && remote?.kind==='service-job' && remote.id===conflict.entityId)return validateServiceJob(remote,undefined,true)
  if(conflict.entityType==='pos_record' && local?.kind==='restaurant-floor' && remote?.kind===local.kind && remote.id===conflict.entityId && remote.branchId===local.branchId)return validateFloorSnapshot(remote)
  if(conflict.entityType === 'pos_record' && ['restaurant-layout','restaurant-tab'].includes(local?.kind) && remote?.kind === local.kind && remote.id === conflict.entityId) { validateRestaurantRecord(remote,undefined,true); return remote }
  if (conflict.entityType !== 'pos_record' || !['counter-menu', 'counter-order'].includes(local?.kind) || remote?.kind !== local.kind || remote.id !== conflict.entityId) return null
  validateCounterRecord(remote, undefined, true)
  return remote
}

export async function handleCounter({ db, scope, organizationId, branchId, user, method, path, input, tillId, sales, publish, saveRecord }) {
  const restaurant = path.startsWith('/api/pos/restaurant/')
  const menuId = restaurant ? 'restaurant-menu' : 'counter-menu'
  if (restaurant) path = path.replace('/api/pos/restaurant/counter','/api/pos/counter')
  const profile = (await db.query(`SELECT shop_profile,app_name,currency FROM app_settings WHERE ${organizationId ? 'organization_id=?' : 'id=1'}`, organizationId ? [organizationId] : [])).values[0]
  if (!(restaurant ? normalizeShopProfile(profile?.shop_profile).restaurant : normalizeShopProfile(profile?.shop_profile).fastFood)) throw new Error(restaurant ? 'The owner must enable Restaurant & bar first.' : 'The owner must enable the Fast food workspace first.')
  const records = (await db.query("SELECT payload FROM pos_records WHERE scope=? AND kind IN ('counter-menu','counter-order','counter-consumption')", [scope])).values.map(row => JSON.parse(row.payload))
  const floorRow=restaurant ? (await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,floorId(branchId)])).values[0] : null
  const floor=floorRow?JSON.parse(floorRow.payload):undefined
  const decorate=tab=>restaurantTabs([tab],floor)[0]
  const loadedSales = await sales()
  const otherRecords = (await db.query("SELECT payload FROM pos_records WHERE scope=? AND kind IN ('settings','return','register')", [scope])).values.map(row => JSON.parse(row.payload))
  const settings = posSettings(otherRecords.find(record => record.id === 'pos-settings')?.value)
  const returns = otherRecords.filter(record => record.kind === 'return' && record.branchId === branchId)
  const customers = (await db.query(`SELECT id,name,phone,balance FROM customers${organizationId ? ' WHERE organization_id=?' : ''}`, organizationId ? [organizationId] : [])).values
  const legacyRefundTotal = id => Math.round(returns.filter(record => record.saleId === counterSaleId(id)).reduce((sum, record) => sum + record.total, 0) * 100) / 100
  const refundTotal = id => { const order=records.find(record=>record.id===id); return legacyRefundTotal(id) + (order ? returns.reduce((sum,record)=>{const sale=loadedSales.find(sale=>sale.id===record.saleId);if(!sale?.paymentDetails?.restaurantBill)return sum;return sum+record.items.filter(item=>sale.paymentDetails.restaurantBill.selections[item.lineIndex]?.orderId===id).reduce((n,item)=>n+Number(item.amount),0)},0) : 0) }
  const menu = records.find(record => record.kind === 'counter-menu' && record.id === menuId)
  const orders = records.filter(record => record.kind === 'counter-order' && record.branchId === branchId && (Boolean(record.tableService) === restaurant || restaurant && record.restaurantOrder === true))
  if (method === 'GET') return {
    consumptions: records.filter(record => record.kind === 'counter-consumption' && record.branchId === branchId), settings, customers, loyaltyBalances: loyaltyBalances(loadedSales, returns), returns,
    menu: menu || { id: menuId, updatedAt: '', items: [] },
    orders: orders.map(order => ({ ...order, ingredientCost: records.find(record => record.id === consumptionId(order.id))?.totalCost, refundedTotal: refundTotal(order.id), ...restaurantOrderPayment(order,loadedSales) })),
    receipts: loadedSales.filter(sale => orders.some(order => selectionsForOrder(sale,order).length)).map(sale => { const order = orders.find(order => selectionsForOrder(sale,order).length); return { ...sale, items:sale.items.map(item=>({...item,price:item.price ?? item.unitPrice})), branchId, businessName: order.businessName, currency: order.currency, syncStatus: 'synced' } })
  }
  if (method !== 'POST' || !tillId) throw new Error('A registered till is required.')
  const existing = records.find(record => record.id === input.id)
  if (existing?.kind === 'counter-order' && Boolean(existing.tableService) !== restaurant) throw new Error('Use the workspace that created this order.')
  const request = JSON.stringify(input)
  if (existing?.lastCommandId === input.commandId && input.commandId) {
    if (existing.lastRequest !== request) throw new Error('This command ID has different details.')
    return existing
  }
  if (!input.commandId || input.expectedUpdatedAt !== (existing?.updatedAt || '')) throw new Error('This record changed. Refresh before continuing.')
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(existing?.updatedAt || '') + 1 || 0)).toISOString()
  const stamp = { updatedAt, expectedUpdatedAt: existing?.updatedAt || '', lastCommandId: input.commandId, lastRequest: request, staffId: user.id, staffName: user.name }
  let record
  let prepare = false
  if (path === '/api/pos/counter/menu') {
    if (!['owner', 'admin'].includes(user.role)) throw new Error('Only owner or admin can edit the menu.')
    if (input.id !== menuId) throw new Error('Invalid menu ID.')
    record = { ...stamp, id: menuId, kind: 'counter-menu', branchId: 'main', items: input.items }
    validateCounterRecord(record, existing)
    record.items = record.items.map(item => ({ ...item, name: item.name.trim(), price: money(item.price), options: item.options.map(option => ({ ...option, name: option.name.trim(), price: money(option.price) })) }))
    for (const item of record.items) for (const entry of [...(item.recipe || []), ...item.options.flatMap(option => option.recipe || [])]) if (!(await db.query(`SELECT id FROM products WHERE id=?${organizationId ? ' AND organization_id=?' : ''}`, [entry.productId, ...(organizationId ? [organizationId] : [])])).values.length) throw new Error('Choose existing stock products for recipe ingredients.')
    for (const item of record.items.filter(item => item.type === 'stock')) if (!(await db.query(`SELECT id FROM products WHERE id=?${organizationId ? ' AND organization_id=?' : ''}`, [item.productId, ...(organizationId ? [organizationId] : [])])).values.length) throw new Error('Choose an existing stock product for packaged goods.')
  } else if (['/api/pos/counter/orders', '/api/pos/counter/edit'].includes(path)) {
    const editing = path.endsWith('/edit')
    if (editing && (!existing || existing.kind !== 'counter-order' || existing.branchId !== branchId || existing.status !== 'queued' || existing.tillId !== tillId || records.some(record => record.id === consumptionId(existing.id)) || loadedSales.some(sale => selectionsForOrder(sale,existing).length))) throw new Error('Only unpaid queued orders can be corrected on their original till.')
    if (editing) text(input.reason, 'an order correction reason', 300)
    if ((!editing && existing) || !input.id || !Array.isArray(input.lines) || !input.lines.length || input.lines.length > 100) throw new Error('Enter a new order with 1 to 100 lines.')
    if (!editing && (await db.query('SELECT id FROM pos_records WHERE scope=? AND id=?', [scope, input.id])).values.length) throw new Error('This record ID is already in use.')
    if (input.menuUpdatedAt !== menu?.updatedAt) throw new Error('The menu changed. Refresh and review the order before submitting.')
    let tableService = editing ? existing.tableService : undefined
    let billCurrency = profile.currency, billBusinessName = profile.app_name
    if (restaurant && !editing) {
      const row = (await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?', [scope,input.tableService?.tabId || ''])).values[0]
      const tab = row && decorate(JSON.parse(row.payload))
      if (!tab || tab.mergedInto || tab.kind !== 'restaurant-tab' || tab.branchId !== branchId || tab.status !== 'open' || tab.sessionId !== input.tableService?.sessionId) throw new Error('Choose an open table or bar tab.')
      if (tab.tillId !== tillId) throw new Error('Add orders on the till that opened this bill.')
      const seat = Number(input.tableService?.seat || 0)
      if (!Number.isInteger(seat) || seat < 0 || seat > tab.guests) throw new Error('Choose a seat within the guest count on this bill.')
      billCurrency = tab.currency; billBusinessName = tab.businessName
      tableService = { tabId:tab.id, sessionId:tab.sessionId, name:tab.name, seat }
    }
    const lines = await Promise.all(input.lines.map(async line => {
      const item = menu?.items.find(item => item.id === line.menuItemId && item.available)
      if (!item || !Array.isArray(line.optionIds) || new Set(line.optionIds).size !== line.optionIds.length) throw new Error('Choose available menu items and valid options.')
      const options = line.optionIds.map(id => { const option = item.options.find(option => option.id === id); if (!option) throw new Error('Menu options changed. Refresh the menu.'); return { ...option } })
      const ingredients = new Map()
      for (const entry of [...(restaurant && item.type === 'stock' ? [{productId:item.productId,quantity:1}] : item.recipe || []), ...options.flatMap(option => option.recipe || [])]) {
        const product = (await db.query(`SELECT name,unit FROM products WHERE id=?${organizationId ? ' AND organization_id=?' : ''}`, [entry.productId, ...(organizationId ? [organizationId] : [])])).values[0]
        if (!product) throw new Error('A recipe ingredient is missing. Update the menu before ordering.')
        const ingredient = ingredients.get(entry.productId) || { productId: entry.productId, name: product.name, unit: product.unit, quantity: 0 }
        ingredient.quantity = Math.round((ingredient.quantity + Number(entry.quantity)) * 1000) / 1000
        ingredients.set(entry.productId, ingredient)
      }
      return { id: text(line.id, 'a line ID'), menuItemId: item.id, name: item.name, ...(restaurant ? {station:item.station || (item.type === 'stock' ? 'bar' : 'kitchen')} : {}), productId: item.type === 'stock' && !restaurant ? item.productId : '', ingredients: [...ingredients.values()], options, quantity: line.quantity, price: Math.round((Number(item.price) + options.reduce((sum, option) => sum + Number(option.price), 0)) * 100) / 100 }
    }))
    const customer = customers.find(customer => customer.id === input.customerId)
    if (input.customerId && !customer) throw new Error('Choose an existing customer account.')
    if (Number(input.discountValue || 0) && !['owner','admin'].includes(user.role)) throw new Error('Only owner or admin can apply discounts.')
    const pos = { tillId, customerId: customer?.id || '', customerName: customer?.name || '', discountType: input.discountType === 'percent' ? 'percent' : 'amount', discountValue: money(input.discountValue || 0), loyaltyRedeemed: money(input.loyaltyRedeemed || 0), tax: settings, note: String(input.note || '').trim().slice(0,300) }
    if (pos.loyaltyRedeemed > Math.max(0, loyaltyBalances(loadedSales, returns)[pos.customerId] || 0)) throw new Error('Insufficient customer rewards.')
    pos.pricing = priceOrder(counterItems({ lines }), pos)
    record = { ...stamp, ...(!restaurant ? {diningOption:input.diningOption || 'Takeaway'} : {}), ...(tableService ? { tableService } : {}), ...(editing && existing.source ? { source: existing.source, restaurantOrder: existing.restaurantOrder } : {}), id: input.id, kind: 'counter-order', branchId, status: 'queued', tillId, currency: editing ? existing.currency : billCurrency, businessName: editing ? existing.businessName : billBusinessName, createdAt: editing ? existing.createdAt : updatedAt, customerName: String(customer?.name || input.customerName || '').trim().slice(0, 100), note: String(input.note || '').trim().slice(0, 300), lines, pos, total: pos.pricing.total, ...(editing ? { action: 'edit', changeReason: input.reason.trim() } : {}), events: [...(editing ? existing.events : []), { status: 'queued', action: editing ? 'edit' : 'create', reason: editing ? input.reason.trim() : '', ...(editing ? { previousLines: existing.lines, previousTotal: existing.total } : {}), staffId: user.id, at: updatedAt }] }
    validateCounterRecord(record, editing ? existing : undefined)
  } else if (path === '/api/pos/counter/status') {
    if (!existing || existing.kind !== 'counter-order' || existing.branchId !== branchId) throw new Error('Order not found in this branch.')
    if (input.status === 'preparing' && recipeRequirements(existing).length) {
      if (existing.tillId !== tillId && existing.source !== 'customer-portal') throw new Error('Start recipe preparation on the original till to prevent duplicate ingredient use. Other devices can mark it ready after synchronization.')
      if (settings.offlineStockPoolsEnabled && settings.stockPools[tillId] !== branchId) throw new Error("Prepare recipes at this till's assigned stock location.")
      prepare = !records.some(record => record.id === consumptionId(existing.id))
    }
    if(input.status === 'cancelled' && existing.tableService) {
      if(existing.status === 'collected' && !['owner','admin'].includes(user.role)) throw new Error('Only owner or admin can cancel served unpaid rounds.');
      const tabRow=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,existing.tableService.tabId])).values[0]; let tab=tabRow && decorate(JSON.parse(tabRow.payload));
      if(tab?.mergedInto){const parent=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,tab.mergedInto.tabId])).values[0];tab=parent&&decorate(JSON.parse(parent.payload))}
      if(!tab || tab.status !== 'open' || !billContains(tab,existing)) throw new Error('Closed bill orders cannot be cancelled. Record a refund against their receipt instead.');
    }
    if (input.status === 'cancelled' && loadedSales.some(sale => selectionsForOrder(sale,existing).length) && refundTotal(existing.id) < restaurantOrderPayment(existing,loadedSales).paidAmount-0.000001) throw new Error('Refund the paid order in full before cancelling it.')
    if (input.status !== 'cancelled' && refundTotal(existing.id) >= existing.total) throw new Error('Cancel a fully refunded order instead of preparing or handing it over.')
    if (input.status === 'collected' && !existing.tableService && !loadedSales.some(sale => selectionsForOrder(sale,existing).length)) throw new Error('Take payment before handing over the order.')
    if(input.station && (!existing.tableService || input.status!=='ready' || existing.status!=='preparing' || !existing.lines.some(line=>(line.station||'kitchen')===input.station) || existing.stationReady?.[input.station])) throw new Error('Choose an unfinished preparation station.')
    const stationReady=existing.tableService && input.status==='ready' ? {...existing.stationReady,...Object.fromEntries((input.station?[input.station]:[...new Set(existing.lines.map(line=>line.station||'kitchen'))]).map(station=>[station,true]))} : existing.stationReady
    const status=input.station && !existing.lines.every(line=>stationReady[line.station||'kitchen'])?'preparing':input.status
    record = { ...existing, ...stamp, ...(stationReady?{stationReady}:{}), action: input.station?'station-ready':'status', changeReason: input.status === 'cancelled' ? text(input.reason, 'a cancellation reason', 300) : '', status, events: [...existing.events, { status, ...(input.station?{station:input.station}:{}), reason: input.status === 'cancelled' ? input.reason.trim() : '', staffId: user.id, at: updatedAt }] }
    validateCounterRecord(record, existing)
  } else throw new Error('Unknown counter-service action.')
  await db.beginTransaction()
  try {
    const current = (await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?', [scope, record.id])).values[0]
    if ((current ? JSON.parse(current.payload).updatedAt : '') !== (existing?.updatedAt || '')) throw new Error('This record changed. Refresh before continuing.')
    if(record.tableService && record.status === 'queued') { const tabRow=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,record.tableService.tabId])).values[0]; const tab=tabRow && decorate(JSON.parse(tabRow.payload)); if(!tab || tab.mergedInto || tab.status !== 'open' || tab.sessionId !== record.tableService.sessionId) throw new Error('This table bill has closed. Open a new bill before adding orders.'); }
    const consumed = record.kind === 'counter-order' ? (await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?', [scope, consumptionId(record.id)])).values[0] : null
    if (record.action === 'edit' && consumed) throw new Error('Ingredients have already been consumed. Cancel this order instead of correcting it.')
    if (prepare && !consumed) {
      const consumption = await consumeRecipe(db, record, updatedAt, organizationId)
      await saveRecord(db, scope, consumption)
      await publish(consumption)
    }
    await saveRecord(db, scope, record)
    await publish(record)
    await db.commitTransaction()
  } catch (error) { await db.rollbackTransaction(); throw error }

  return record
}
