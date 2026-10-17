import { floorId,restaurantTabs,billContains,floorChange,validateRestaurantFloor } from './restaurant-floor.mjs'
import { recordPayment } from './payment.mjs'
import { receiptSettings } from './receipts.mjs'
import { validateLoyaltyBalance } from './pos-pricing.mjs'
import { restaurantLedgerId, restaurantOrderPayment, restaurantPortion, restaurantReceiptHash, restaurantRoomChargeSales, saveRestaurantSale } from './restaurant-payments.mjs'
import { normalizeShopProfile } from './shop-profile.mjs'
import { reservationBookId, checkReservationOpening } from './restaurant-reservations.mjs'
import { hasPermission } from './staff-permissions.mjs'
import { hotelFolios } from './hotel-folios.mjs'
import { handleServiceJobs } from './service-jobs.mjs'
const text = (value, label, max = 100) => { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Enter ${label}.`); return value.trim() }
const validRoomCharge = charge => Boolean(charge && /^service-job:[A-Za-z0-9:_-]{3,150}$/.test(charge.invoiceId) && (charge.folioId === 'guest' || /^hotel-folio:[A-Za-z0-9_-]{20,80}$/.test(charge.folioId)) && Number.isFinite(charge.total) && charge.total > 0 && Math.abs(charge.total*100-Math.round(charge.total*100)) < 0.000001 && Array.isArray(charge.selections) && charge.selections.length > 0 && charge.selections.length <= 1000 && charge.selections.every(part => part && /^[A-Za-z0-9:_-]{1,150}$/.test(part.orderId) && typeof part.lineId === 'string' && part.lineId.length > 0 && part.lineId.length <= 150 && Number.isFinite(part.quantity) && part.quantity > 0 && Number.isFinite(part.total) && part.total > 0) && Math.abs(charge.selections.reduce((sum,part)=>sum+Number(part.total),0)-charge.total) < 0.005 && Number.isFinite(Date.parse(charge.createdAt)) && typeof charge.staffId === 'string' && charge.staffId.length > 0 && charge.staffId.length <= 100)
export const tableTabId = (branch, table) => `restaurant-tab:${branch}:${table}`
// Preparation progress does not alter the amount a cashier reviewed.
export function restaurantBillFingerprint(tab, orders) {
  return JSON.stringify([tab.id,tab.sessionId,tab.currency,tab.tillId,tab.floorRevision||'',tab.billMembers||[],tab.roomCharges||[],
    orders.filter(order=>billContains(tab,order) && order.status!=='cancelled' && !order.receiptId)
      .sort((a,b)=>a.id.localeCompare(b.id))
      .map(order=>[order.id,order.currency,order.tillId,order.total,order.lines,order.pos,order.tableService,order.paidAmount||0,order.receiptIds||[]])])
}
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

  if (!/^[A-Z]{3}$/.test(record.currency) || typeof record.businessName !== 'string') throw new Error('Invalid bill currency or business name.');
  if (!record.id.startsWith(`restaurant-tab:${record.branchId}:`) || !Number.isInteger(record.guests) || record.guests < 1 || record.guests > 100 || !Number.isFinite(Date.parse(record.openedAt))) throw new Error('Invalid bill details.')
  if(record.hotelStayId!==undefined&&!/^hotel-stay:[a-zA-Z0-9_-]{3,100}$/.test(record.hotelStayId))throw new Error('Invalid hotel stay link.')
  if(record.roomCharges!==undefined&&(!Array.isArray(record.roomCharges)||record.roomCharges.length>100||new Set(record.roomCharges.map(charge=>charge?.invoiceId)).size!==record.roomCharges.length||record.roomCharges.some(charge=>!validRoomCharge(charge))))throw new Error('Invalid hotel folio bill transfer.')
  if(record.nightlifeEventId!==undefined&&(!/^nightclub-event:[a-zA-Z0-9_-]{3,100}$/.test(record.nightlifeEventId)||typeof record.nightlifeEventName!=='string'||!record.nightlifeEventName.trim()))throw new Error('Invalid nightlife event link.')
  if(record.minimumSpend!==undefined&&(!Number.isFinite(record.minimumSpend)||record.minimumSpend<0||Math.abs(record.minimumSpend*100-Math.round(record.minimumSpend*100))>0.000001)||record.tablePackageId!==undefined&&(!/^[a-z0-9_-]{1,40}$/.test(record.tablePackageId)||typeof record.tablePackageName!=='string'||!record.tablePackageName.trim())||record.tablePackageItems!==undefined&&(!Array.isArray(record.tablePackageItems)||record.tablePackageItems.length>20||record.tablePackageItems.some(item=>!item.menuItemId||!item.productId||!item.name||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>999)))throw new Error('Invalid bottle-service package or minimum spend.')
  if (!previous) { if(!snapshot && record.history?.length) throw new Error('New bills cannot contain past sessions.'); if (!snapshot && record.status !== 'open') throw new Error('Open the bill first.'); return }
  if (record.branchId !== previous.branchId || record.tableId !== previous.tableId) throw new Error('Bill identity cannot change.')
  if (previous.status === 'closed' && record.status === 'open') { if (record.sessionId === previous.sessionId) throw new Error('Use a new bill session.'); const archive={id:previous.id,sessionId:previous.sessionId,name:previous.name,tableId:previous.tableId,guests:previous.guests,tillId:previous.tillId,status:'closed',openedAt:previous.openedAt,closedAt:previous.closedAt,currency:previous.currency,businessName:previous.businessName,...(previous.roomCharges?.length?{roomCharges:previous.roomCharges}:{})}; if(JSON.stringify(record.history)!==JSON.stringify([...(previous.history||[]),archive])) throw new Error('Preserve closed bill history.'); return }
  if (previous.status !== 'open' || !['open','closed'].includes(record.status) || ['sessionId','name','tillId','openedAt','currency','businessName','reservationId','hotelStayId','nightlifeEventId','nightlifeEventName','tablePackageId','tablePackageName','minimumSpend','tablePackageItems'].some(key=>record[key] !== previous[key])) throw new Error('Refresh the bill before continuing.')
  const oldRoomCharges=previous.roomCharges||[],nextRoomCharges=record.roomCharges||[]
  if(nextRoomCharges.length<oldRoomCharges.length||nextRoomCharges.length>oldRoomCharges.length+1||JSON.stringify(nextRoomCharges.slice(0,oldRoomCharges.length))!==JSON.stringify(oldRoomCharges))throw new Error('Preserve hotel folio bill transfers.')
  if(record.status==='open'&&nextRoomCharges.length!==oldRoomCharges.length+1||record.status==='closed'&&nextRoomCharges.length!==oldRoomCharges.length)throw new Error('Refresh the bill before continuing.')
  if(JSON.stringify(record.history)!==JSON.stringify(previous.history)) throw new Error('Preserve bill history.')
}
export function validateRestaurantClose(tab, orders, sales) {
  const matching = orders.filter(order=>billContains(tab,order))
  const settledSales=[...sales,...restaurantRoomChargeSales(tab)]
  const billTotal = matching.filter(order=>order.status!=='cancelled').reduce((sum,order)=>sum+Number(order.total||0),0)
  if(tab.minimumSpend>0&&billTotal+0.000001<tab.minimumSpend)throw new Error(`${tab.tablePackageName||'This table package'} requires a minimum spend of ${tab.currency} ${Number(tab.minimumSpend).toFixed(2)}. Add orders totalling at least ${tab.currency} ${Number(tab.minimumSpend).toFixed(2)} before closing the bill.`)
  if (matching.some(order=>!['collected','cancelled'].includes(order.status))) throw new Error('Serve or cancel every order before closing the bill.')
  if (matching.some(order=>order.status !== 'cancelled' && !restaurantOrderPayment(order,settledSales).receiptId)) throw new Error('Settle all unpaid orders before closing the bill.')
}
export async function handleRestaurant({ db, scope, organizationId, branchId, user, method, path, input, tillId, sales, publish, saveRecord }) {
  const profile = (await db.query(`SELECT shop_profile,app_name,currency FROM app_settings WHERE ${organizationId ? 'organization_id=?' : 'id=1'}`, organizationId ? [organizationId] : [])).values[0]
  if (!normalizeShopProfile(profile?.shop_profile).restaurant) throw new Error('The owner must enable Restaurant & bar first.')
  const rows = (await db.query("SELECT payload FROM pos_records WHERE scope=? AND branch_id=? AND kind IN ('restaurant-layout','restaurant-tab','counter-order','restaurant-ledger','restaurant-floor','restaurant-reservations','nightclub-event','hotel-stay')", [scope, branchId])).values.map(row=>JSON.parse(row.payload))
  const layout = rows.find(row=>row.kind === 'restaurant-layout') || { id:`restaurant-layout:${branchId}`, updatedAt:'', tables:[] }
  const floor=rows.find(row=>row.kind==='restaurant-floor')
  const tabs=restaurantTabs(rows.filter(row=>row.kind==='restaurant-tab'),floor)
  const loadedSales = await sales()
  const orders = rows.filter(row=>row.tableService)
  const paymentState=orders.map(order=>{const tab=tabs.find(item=>billContains(item,order));return {...order,...restaurantOrderPayment(order,[...loadedSales,...restaurantRoomChargeSales(tab)])}})
  const receipts=loadedSales.filter(sale=>sale.paymentDetails?.restaurantBill || sale.paymentDetails?.counterOrder?.tableService).map(sale=>{
    const order=orders.find(order=>order.id===sale.paymentDetails?.counterOrder?.id),bill=sale.paymentDetails?.restaurantBill
    return {...sale,branchId,currency:bill?.currency||order?.currency,businessName:bill?.businessName||order?.businessName,items:sale.items.map(item=>({...item,price:item.price??item.unitPrice})),syncStatus:'synced'}
  })
  if (method === 'GET') {const hotelAccess=hasPermission(user,'hotelOperations')&&hasPermission(user,'serviceJobs'),linkedStays=new Set(tabs.map(tab=>tab.hotelStayId).filter(Boolean));return {reservations:rows.find(row=>row.kind==='restaurant-reservations')?.entries||[],reservationTimeZone:normalizeShopProfile(profile?.shop_profile).reportingTimeZone,layout,floor:floor||{id:floorId(branchId),updatedAt:'',bindings:[]},tabs,ledgers:rows.filter(row=>row.kind==='restaurant-ledger'),orders:paymentState,receipts,returns:(await db.query("SELECT payload FROM pos_records WHERE scope=? AND branch_id=? AND kind='return'",[scope,branchId])).values.map(row=>JSON.parse(row.payload)),hotelStays:hotelAccess?rows.filter(row=>row.kind==='hotel-stay'&&linkedStays.has(row.id)).map(stay=>({id:stay.id,roomName:stay.roomName,guestName:stay.guestName,status:stay.status,folios:hotelFolios(stay)})):[]}}
  if (path.endsWith('/charge-to-room')) {
    if(method!=='POST'||!tillId||!input.commandId||!hasPermission(user,'hotelOperations')||!hasPermission(user,'serviceJobs'))throw new Error('Hotel operations, Jobs & invoices, and the original restaurant till are required to charge a bill to a room.')
    const tab=tabs.find(row=>row.id===input.tabId&&row.sessionId===input.sessionId&&row.status==='open'&&!row.mergedInto)
    if(!tab||tab.tillId!==tillId||!tab.hotelStayId)throw new Error('Open the restaurant bill from a reservation linked to a hotel stay before charging the room.')
    if(tab.updatedAt!==input.expectedUpdatedAt||input.billFingerprint!==restaurantBillFingerprint(tab,paymentState))throw new Error('This bill changed. Refresh it before charging the room.')
    const stay=rows.find(row=>row.kind==='hotel-stay'&&row.id===tab.hotelStayId&&row.branchId===branchId)
    if(!stay||stay.status!=='checked-in')throw new Error('The linked hotel guest must be checked in before restaurant charges can be added to the folio.')
    const folioId=String(input.folioId||'guest'),folio=hotelFolios(stay).find(row=>row.id===folioId)
    if(!folio)throw new Error('Choose a folio on the linked hotel stay.')
    const portion=restaurantPortion(tab,orders,loadedSales,input.selections,{allowMultipleCustomers:true})
    const alreadyCharged=(tab.roomCharges||[]).flatMap(charge=>charge.selections.map(part=>`${part.orderId}:${part.lineId}`)),selectedKeys=portion.parts.map(part=>`${part.orderId}:${part.lineId}`)
    if(selectedKeys.some(key=>alreadyCharged.includes(key)))throw new Error('Some selected bill items were already transferred to a hotel folio.')
    const billTaxModes=new Set(portion.parts.map(part=>part.taxIncluded))
    if(billTaxModes.size>1)throw new Error('This bill mixes included-tax and added-tax items. Settle those items separately before transferring them to a hotel folio.')
    const taxIncluded=billTaxModes.has(true),tax=Number(portion.pricing.tax||0),base=taxIncluded?portion.pricing.total:portion.pricing.total-tax
    if(base<=0||tax>0&&base<=(taxIncluded?tax:0))throw new Error('This bill cannot be represented as one valid folio charge.')
    const taxRate=tax<=0?0:taxIncluded?tax/(base-tax)*100:tax/base*100
    const invoiceId=String(input.invoiceId||'')
    if(!/^service-job:[A-Za-z0-9:_-]{3,150}$/.test(invoiceId))throw new Error('Start a new room-charge command and try again.')
    const existingJobs=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND branch_id=? AND kind='service-job'",[scope,branchId])).values.map(row=>JSON.parse(row.payload))
    const overlap=existingJobs.find(job=>job.hospitality?.restaurantBill?.tabId===tab.id&&job.hospitality.restaurantBill.sessionId===tab.sessionId&&job.hospitality.restaurantBill.selections.some(part=>selectedKeys.includes(`${part.orderId}:${part.lineId}`))&&job.status!=='cancelled')
    if(overlap&&overlap.id!==invoiceId)throw new Error('Some selected restaurant items are already on a hotel folio invoice.')
    const invoiceInput={id:invoiceId,commandId:input.commandId,expectedUpdatedAt:'',estimate:false,title:`Restaurant / bar - ${tab.name}`.slice(0,200),lines:[{id:`restaurant:${tab.sessionId}:${input.commandId}`.slice(0,100),description:`Restaurant / bar bill ${tab.sessionId.slice(-8).toUpperCase()}`,quantity:1,price:Math.round(base*100)/100}],hospitality:{recordId:stay.id,recordKind:'hotel-stay',chargeType:'extra',folioId,restaurantBill:{tabId:tab.id,sessionId:tab.sessionId,folioId,selections:portion.parts}}}
    const jobResult=await handleServiceJobs({db,scope,organizationId,branchId,user,path:'/api/pos/service-jobs',method:'POST',input:invoiceInput,tillId,sales,publish,saveRecord,restaurantBillContext:{taxEnabled:tax>0,taxIncluded,taxRate,taxLabel:portion.pricing.taxSettings.taxLabel||'Tax'}})
    const job=jobResult.job
    if(Math.abs(Number(job.pricing.total)-Number(portion.pricing.total))>0.005||Math.abs(Number(job.pricing.tax)-tax)>0.005)throw new Error('The folio tax settings could not match this restaurant bill. Review tax setup before transferring the items.')
    const updatedAt=new Date(Math.max(Date.now(),Date.parse(tab.updatedAt||'')+1||0)).toISOString(),roomCharge={invoiceId:job.id,folioId,total:job.pricing.total,selections:portion.parts,createdAt:updatedAt,staffId:user.id},record={...tab,updatedAt,expectedUpdatedAt:tab.updatedAt,roomCharges:[...(tab.roomCharges||[]),roomCharge],staffId:user.id,staffName:user.name}
    validateRestaurantRecord(record,tab)
    await db.beginTransaction()
    try {
      const current=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,tab.id])).values[0],freshOrders=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND branch_id=? AND kind='counter-order'",[scope,branchId])).values.map(row=>JSON.parse(row.payload)),freshSales=await sales()
      const currentTab=current&&JSON.parse(current.payload)
      if(!currentTab||currentTab.updatedAt!==tab.updatedAt||input.billFingerprint!==restaurantBillFingerprint(currentTab,freshOrders.map(order=>({...order,...restaurantOrderPayment(order,freshSales)}))))throw new Error('This bill changed while its folio invoice was being created. Refresh the bill; the invoice is saved for review.')
      const freshPortion=restaurantPortion(currentTab,freshOrders,freshSales,input.selections,{allowMultipleCustomers:true})
      if(JSON.stringify(freshPortion.parts)!==JSON.stringify(portion.parts))throw new Error('This bill changed while its folio invoice was being created. Refresh and review the invoice.')
      await saveRecord(db,scope,record);await publish(record);await db.commitTransaction()
    } catch(error) { await db.rollbackTransaction(); throw error }
    return {tab:record,job}
  }
  if (path.endsWith('/settle')) {
    if(method!=='POST' || !tillId) throw new Error('A registered payment till is required.')
    text(input.id,'a payment ID',150)
    if(!input.id.startsWith('restaurant-payment:')) throw new Error('Invalid bill receipt ID.')
    const command=JSON.stringify(input)
    const old=receipts.find(sale=>sale.id===input.id)
    if(old) { if(old.paymentDetails.restaurantBill.command!==command || old.paymentDetails.restaurantBill.tillId!==tillId) throw new Error('This payment ID already has different details. Reprint its saved receipt.'); return old }
    const tab=tabs.find(row=>row.id===input.tabId && !row.mergedInto && row.status==='open' && row.sessionId===input.sessionId)
    if(!tab || tab.tillId!==tillId) throw new Error('Settle this open bill on its original till.')
    const ledger=rows.find(row=>row.id===restaurantLedgerId(tab.sessionId))
    if(input.expectedUpdatedAt!==(ledger?.updatedAt||'') || input.billFingerprint!==restaurantBillFingerprint(tab,paymentState)) throw new Error('This bill changed. Cancel payment entry, review the bill and start payment again.')
    const portion=restaurantPortion(tab,orders,loadedSales,input.selections,{allowMultipleCustomers:true})
    const registers=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND branch_id=? AND kind='register'",[scope,branchId])).values.map(row=>JSON.parse(row.payload))
    const register=registers.find(row=>!row.closedAt && row.staffId===user.id)
    if(register) portion.pos.registerId=register.id
    const updatedAt=new Date(Math.max(Date.now(),Date.parse(ledger?.updatedAt||'')+1||0)).toISOString()
    const policy=(await db.query(`SELECT payment_policy FROM app_settings WHERE ${organizationId?'organization_id=?':'id=1'}`,organizationId?[organizationId]:[])).values[0]?.payment_policy
    const savedProfile=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND id='receipt-settings'",[scope])).values[0]
    const profile=receiptSettings(savedProfile?JSON.parse(savedProfile.payload).value:undefined)
    const sale=recordPayment({id:input.id,branchId,businessName:tab.businessName,currency:tab.currency,createdAt:updatedAt,staffId:user.id,staffName:user.name,total:portion.pricing.total,items:portion.items,paymentMethod:input.method,terminalProvider:String(input.provider||'').trim(),paymentReference:String(input.reference||'').trim(),paymentDetails:{amountReceived:input.method==='cash'?input.cash||portion.pricing.total:portion.pricing.total,allocations:input.allocations,cashReceived:input.cashReceived||undefined,pos:portion.pos,receipt:{...profile,number:input.id,transactionType:'Restaurant / bar payment',cardType:''},restaurantBill:{tabId:tab.id,sessionId:tab.sessionId,name:tab.name,tillId,currency:tab.currency,businessName:tab.businessName,selections:portion.parts,command}}},policy)
    const rewardReturns=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND branch_id=? AND kind='return'",[scope,branchId])).values.map(row=>JSON.parse(row.payload))
    validateLoyaltyBalance(sale,loadedSales,rewardReturns)
    const record={id:restaurantLedgerId(tab.sessionId),kind:'restaurant-ledger',branchId,tabId:tab.id,sessionId:tab.sessionId,expectedUpdatedAt:ledger?.updatedAt||'',updatedAt,payments:[...(ledger?.payments||[]),{id:sale.id,selections:portion.parts,receiptHash:await restaurantReceiptHash(sale)}],latestSale:sale,staffId:user.id,staffName:user.name}
    await db.beginTransaction()
    try {
      const latest=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,record.id])).values[0]
      if((latest?JSON.parse(latest.payload).updatedAt:'')!==(ledger?.updatedAt||'')) throw new Error('This bill changed. Refresh before paying.')
      const freshOrders=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND branch_id=? AND kind='counter-order'",[scope,branchId])).values.map(row=>JSON.parse(row.payload))
      const freshSales=await sales()
      const currentTab=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,tab.id])).values[0]
      const freshFloor=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,floorId(branchId)])).values[0]
      const validTab=currentTab&&restaurantTabs([JSON.parse(currentTab.payload)],freshFloor?JSON.parse(freshFloor.payload):undefined)[0]
      if(!validTab || validTab.status!=='open' || validTab.sessionId!==tab.sessionId || input.billFingerprint!==restaurantBillFingerprint(validTab,freshOrders.map(order=>({...order,...restaurantOrderPayment(order,freshSales)})))) throw new Error('This bill changed. Refresh before paying.')
      await saveRestaurantSale(db,sale,organizationId,true)
      await saveRecord(db,scope,record)
      await publish(record)
      await publish(sale,'sale')
      await db.commitTransaction()
    }catch(error){await db.rollbackTransaction();throw error}
    return {...sale,syncStatus:'pending'}
  }
  if(path.endsWith('/arrange')) {
    if(method!=='POST'||!tillId||!input.commandId) throw new Error('A registered till and command ID are required.')
    if(floor?.lastCommandId===input.commandId){if(floor.lastRequest!==JSON.stringify(input))throw new Error('This command has different details.');return floor}
    if(input.expectedUpdatedAt!==(floor?.updatedAt||'')) throw new Error('The tables changed. Refresh before moving or merging.')
    const command={...input,tillId},updatedAt=new Date(Math.max(Date.now(),Date.parse(floor?.updatedAt||'')+1||0)).toISOString()
    if(command.action==='move') {
      const savedBook=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,reservationBookId(branchId)])).values[0]
      const source=tabs.find(tab=>tab.id===command.tabId&&tab.sessionId===command.sessionId)
      if(source?.displayTableId!==command.tableId)checkReservationOpening(savedBook?JSON.parse(savedBook.payload):null,{},command.tableId,source?.guests||1,updatedAt)
    }
    const record={id:floorId(branchId),kind:'restaurant-floor',branchId,expectedUpdatedAt:floor?.updatedAt||'',updatedAt,command,bindings:floorChange(floor,command,rows.filter(row=>row.kind==='restaurant-tab'),layout,loadedSales),lastCommandId:input.commandId,lastRequest:JSON.stringify(input),staffId:user.id,staffName:user.name}
    await db.beginTransaction()
    try {
      const current=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,record.id])).values[0]
      const fresh=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND branch_id=? AND kind IN ('restaurant-tab','restaurant-layout')",[scope,branchId])).values.map(row=>JSON.parse(row.payload))
      validateRestaurantFloor(record,current?JSON.parse(current.payload):undefined,fresh.filter(row=>row.kind==='restaurant-tab'),fresh.find(row=>row.kind==='restaurant-layout')||layout,await sales())
      await saveRecord(db,scope,record);await publish(record);await db.commitTransaction()
    }catch(error){await db.rollbackTransaction();throw error}
    return record
  }
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
    const savedBook=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,reservationBookId(branchId)])).values[0]
    for(const reservation of savedBook?JSON.parse(savedBook.payload).entries:[])if(['confirmed','arrived'].includes(reservation.status)&&reservation.tableId&&Date.parse(reservation.endAt)>Date.now()) {
      const before=layout.tables.find(table=>table.id===reservation.tableId),after=record.tables?.find(table=>table.id===reservation.tableId)
      if(!after || JSON.stringify(before)!==JSON.stringify(after))throw new Error('Reschedule or cancel upcoming reservations before changing their table.')
    }
    validateRestaurantRecord(record, existing)
    for (const tab of tabs.filter(row=>row.status === 'open' && !row.mergedInto && row.displayTableId)) {
      const before = layout.tables.find(table=>table.id === tab.displayTableId), after = record.tables.find(table=>table.id === tab.displayTableId)
      if (!after || !before || JSON.stringify(after) !== JSON.stringify(before)) throw new Error('Close the table bill before changing or removing that table.')
    }
  } else if (path.endsWith('/open')) {
    if (existing && (existing.kind !== 'restaurant-tab' || existing.status !== 'closed')) throw new Error('This table already has an open bill.')
    const allTabs=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND kind='restaurant-tab'",[scope])).values.map(row=>JSON.parse(row.payload))
    if(allTabs.some(tab=>tab.sessionId===input.sessionId || tab.history?.some(history=>history.sessionId===input.sessionId)))throw new Error('Use a new unique bill session.')
    const table = input.tableId ? layout.tables.find(table=>table.id === input.tableId) : null
    if (input.tableId && !table) throw new Error('Choose a configured table.')
    const savedBook=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,reservationBookId(branchId)])).values[0]
    const reservation=checkReservationOpening(savedBook?JSON.parse(savedBook.payload):null,input,table?.id||'',Number(input.guests),updatedAt)
    if(table && tabs.some(tab=>tab.status==='open' && !tab.mergedInto && tab.displayTableId===table.id)) throw new Error('This table already has an open bill.')
    record = {...stamp, id:input.id, kind:'restaurant-tab', status:'open', tableId:table?.id || '', name:table?.name || text(input.name,'a tab name'), guests:Number(input.guests), sessionId:text(input.sessionId,'a new bill session'), tillId, currency:profile.currency, businessName:profile.app_name, openedAt:updatedAt, history:existing ? [...(existing.history||[]),{id:existing.id,sessionId:existing.sessionId,name:existing.name,tableId:existing.tableId,guests:existing.guests,tillId:existing.tillId,status:'closed',openedAt:existing.openedAt,closedAt:existing.closedAt,currency:existing.currency,businessName:existing.businessName,...(existing.roomCharges?.length?{roomCharges:existing.roomCharges}:{})}] : [], events:[...(existing?.events || []), {action:'open', sessionId:input.sessionId, at:updatedAt, staffId:user.id}]}
    if(table && record.guests > table.seats) throw new Error('Guest count exceeds the seats available at this table.')
    if(reservation){record.reservationId=reservation.id;if(reservation.hotelStayId)record.hotelStayId=reservation.hotelStayId;if(reservation.tablePackageId){record.tablePackageId=reservation.tablePackageId;record.tablePackageName=reservation.tablePackageName;record.minimumSpend=Number(reservation.minimumSpend||0);record.tablePackageItems=reservation.tablePackageItems||[]}if(reservation.nightlifeEventId){const linkedEvent=rows.find(row=>row.kind==='nightclub-event'&&row.id===reservation.nightlifeEventId);if(!linkedEvent||linkedEvent.status!=='scheduled')throw new Error('This nightlife event is no longer accepting table bookings.');record.nightlifeEventId=linkedEvent.id;record.nightlifeEventName=linkedEvent.name}}
  } else if (path.endsWith('/close')) {
    if (!existing || existing.kind !== 'restaurant-tab' || existing.status !== 'open') throw new Error('Choose an open bill.')
    if(existing.tillId !== tillId) throw new Error('Close this bill on its original till.'); if(tabs.find(tab=>tab.id===existing.id)?.mergedInto)throw new Error('Close the combined destination bill instead.')
    validateRestaurantClose(tabs.find(tab=>tab.id===existing.id), orders, loadedSales)
    record = {...existing, ...stamp, status:'closed', closedAt:updatedAt, events:[...existing.events, {action:'close', sessionId:existing.sessionId, at:updatedAt, staffId:user.id}]}
  } else throw new Error('Unknown restaurant action.')
  validateRestaurantRecord(record, existing)
  await db.beginTransaction()
  try {
    const current=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,record.id])).values[0]
    if ((current ? JSON.parse(current.payload).updatedAt : '') !== (existing?.updatedAt || '')) throw new Error('This bill changed. Refresh before continuing.')
    if(record.kind==='restaurant-tab'&&record.status==='open') {
      const book=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,reservationBookId(branchId)])).values[0]
      checkReservationOpening(book?JSON.parse(book.payload):null,record,record.tableId,record.guests,record.openedAt)
    }
    if(record.kind === 'restaurant-tab' && record.status === 'closed') { const freshOrders=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND branch_id=? AND kind='counter-order'",[scope,branchId])).values.map(row=>JSON.parse(row.payload)); validateRestaurantClose(restaurantTabs([record],floor)[0],freshOrders,await sales()) }
    await saveRecord(db,scope,record); await publish(record); await db.commitTransaction()
  } catch(error) { await db.rollbackTransaction(); throw error }
  return record
}
