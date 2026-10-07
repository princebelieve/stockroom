import { normalizeShopProfile } from './shop-profile.mjs'
import { reportTimeZone } from './report-timezone.mjs'
import { reservationInstant } from './reservation-time.mjs'
import { restaurantTabs } from './restaurant-floor.mjs'

export const reservationBookId=branchId=>`restaurant-reservations:${branchId}`
export const requiresReservationSync=operation=>operation.entityType==='pos_record' && (['restaurant-reservations','restaurant-reservation-archive'].includes(operation.payload?.kind) || operation.payload?.reservationId)
const active=row=>['confirmed','arrived','seated'].includes(row.status)
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
const text=(value,label,max=200,optional=false)=>{if(typeof value!=='string'||value.length>max||(!optional&&!value.trim()))throw new Error(`Enter ${label}.`);return value.trim()}
const states=['confirmed','arrived','seated','completed','cancelled','no-show']
function empty(branchId){return {id:reservationBookId(branchId),kind:'restaurant-reservations',branchId,updatedAt:'',entries:[]}}
function canonical(input) {
  const value={action:text(input.action,'a reservation action',20),id:text(input.id,'a reservation ID',100),commandId:text(input.commandId,'a command ID',100),expectedUpdatedAt:typeof input.expectedUpdatedAt==='string'?input.expectedUpdatedAt:''}
  if(!/^reservation:[a-zA-Z0-9_-]{3,80}$/.test(value.id))throw new Error('Invalid reservation ID.')
  if(['create','update'].includes(value.action))Object.assign(value,{name:text(input.name,'the guest name',100),phone:text(input.phone||'','a phone number',80,true),guests:Number(input.guests),tableId:text(input.tableId||'','a table ID',60,true),startLocal:text(input.startLocal,'the arrival time',16),endLocal:text(input.endLocal,'the departure time',16),timeZone:reportTimeZone(input.timeZone||'UTC'),occurrence:input.occurrence||'earlier',endOccurrence:input.endOccurrence||input.occurrence||'earlier',note:text(input.note||'','a reservation note',1000,true)})
  else if(['cancel','no-show'].includes(value.action))value.reason=text(input.reason,'a cancellation or no-show reason',300)
  else if(value.action==='seat')Object.assign(value,{billId:text(input.billId,'the opened bill',150),sessionId:text(input.sessionId,'the bill session',100)})
  else if(!['arrive','complete','archive'].includes(value.action))throw new Error('Unknown reservation action.')
  return value
}
export function reservationChange(previous,input,{branchId,user,updatedAt,timeZone,layout,tabs=[]}) {
  const book=previous||empty(branchId),request=canonical(input),old=book.entries.find(row=>row.id===request.id)
  if(request.expectedUpdatedAt!==book.updatedAt)throw new Error('Reservations changed. Refresh and review before saving.')
  const history={commandId:request.commandId,input:request,at:updatedAt,staffId:user.id,staffName:user.name}
  if(request.action==='archive') {
    const finished=book.entries.filter(row=>!active(row))
    if(!finished.length)throw new Error('No finished reservations to archive.')
    return {id:book.id,kind:'restaurant-reservations',branchId,expectedUpdatedAt:book.updatedAt,updatedAt,staffId:user.id,staffName:user.name,entries:book.entries.filter(active),archiveIds:[...(book.archiveIds||[]),`reservation-archive:${branchId}:${request.commandId}`],lastArchive:history}
  }
  let row
  if(request.action==='create') {
    if(old)throw new Error('This reservation ID is already used.')
    if(book.entries.length>=1000)throw new Error('Archive finished reservations before adding more. Their history will be preserved.')
    row={id:request.id,createdAt:updatedAt,status:'confirmed',events:[]}
  } else {
    if(!old)throw new Error('Choose a saved reservation.')
    row={...old,events:[...old.events]}
    if(row.events.length>=100)throw new Error('This reservation has reached its history limit.')
  }
  if(['create','update'].includes(request.action)) {
    if(!['confirmed','arrived'].includes(row.status))throw new Error('Only an unseated reservation can be changed.')
    const zone=reportTimeZone(timeZone),startAt=reservationInstant(request.startLocal,zone,request.occurrence),endAt=reservationInstant(request.endLocal,zone,request.endOccurrence)
    if(request.timeZone!==zone)throw new Error('The business timezone changed. Refresh before saving this reservation.')
    if(Date.parse(endAt)<=Date.parse(startAt)||Date.parse(endAt)-Date.parse(startAt)>86400000)throw new Error('Departure must follow arrival within 24 hours.')
    if(!Number.isInteger(request.guests)||request.guests<1||request.guests>100)throw new Error('Enter 1 to 100 guests.')
    const table=request.tableId?layout?.tables.find(table=>table.id===request.tableId):null
    if(request.tableId && (!table||request.guests>table.seats))throw new Error('Choose an existing table with enough seats.')
    Object.assign(row,{name:request.name,phone:request.phone,guests:request.guests,tableId:request.tableId,tableName:table?.name||'',startAt,endAt,timeZone:zone,occurrence:request.occurrence,endOccurrence:request.endOccurrence,note:request.note})
  } else {
    const allowed={arrive:['confirmed'],seat:['confirmed','arrived'],complete:['seated'],cancel:['confirmed','arrived'],'no-show':['confirmed','arrived']}
    if(!allowed[request.action].includes(row.status))throw new Error('Follow the reservation stages.')
    if(request.action==='seat') {
      const bill=tabs.find(tab=>tab.id===request.billId&&tab.sessionId===request.sessionId)
      if(!bill || bill.status!=='open' || bill.mergedInto || bill.branchId!==branchId || bill.displayTableId!==row.tableId || !row.tableId || bill.reservationId!==row.id || bill.guests!==row.guests)throw new Error('Open the matching reservation bill before marking guests seated.')
      Object.assign(row,{billId:bill.id,sessionId:bill.sessionId})
    }
    row.status={arrive:'arrived',seat:'seated',complete:'completed',cancel:'cancelled','no-show':'no-show'}[request.action]
  }
  row.events.push(history)
  const entries=old?book.entries.map(entry=>entry.id===row.id?row:entry):[...book.entries,row]
  const record={id:book.id,kind:'restaurant-reservations',branchId,expectedUpdatedAt:book.updatedAt,updatedAt,staffId:user.id,staffName:user.name,entries}
  if(book.archiveIds)Object.assign(record,{archiveIds:book.archiveIds,lastArchive:book.lastArchive})
  validateReservationBook(record,undefined,true)
  return record
}
export function validateReservationBook(record,previous,snapshot=false,layout,tabs=[],archives=[]) {
  if(record.kind!=='restaurant-reservations'||record.id!==reservationBookId(record.branchId)||typeof record.expectedUpdatedAt!=='string'||!Number.isFinite(Date.parse(record.updatedAt))||!Array.isArray(record.entries)||(!record.entries.length&&!record.archiveIds?.length)||record.entries.length>1000)throw new Error('Invalid reservation book.')
  text(record.branchId,'a branch',100);text(record.staffId,'a staff ID',150);text(record.staffName,'a staff name')
  const ids=new Set(),commands=new Set()
  if(record.archiveIds) {
    if(!Array.isArray(record.archiveIds)||record.archiveIds.length>10000||new Set(record.archiveIds).size!==record.archiveIds.length||record.archiveIds.some(id=>typeof id!=='string'||!id.startsWith(`reservation-archive:${record.branchId}:`))||record.lastArchive?.input?.action!=='archive'||record.lastArchive.commandId!==record.lastArchive.input.commandId)throw new Error('Invalid reservation archive references.')
    canonical(record.lastArchive.input)
  }
  for(const row of record.entries) {
    text(row.name,'a guest name',100);text(row.phone,'a phone number',80,true);text(row.note,'a reservation note',1000,true)
    if(!/^reservation:[a-zA-Z0-9_-]{3,80}$/.test(row.id)||ids.has(row.id)||!states.includes(row.status)||!Number.isInteger(row.guests)||row.guests<1||row.guests>100||!Number.isFinite(Date.parse(row.createdAt))||!Array.isArray(row.events)||!row.events.length||row.events.length>100)throw new Error('Invalid reservation details.')
    ids.add(row.id);reportTimeZone(row.timeZone)
    if(!['earlier','later'].includes(row.occurrence)||!['earlier','later'].includes(row.endOccurrence)||!Number.isFinite(Date.parse(row.startAt))||Date.parse(row.endAt)<=Date.parse(row.startAt)||!Number.isFinite(Date.parse(row.endAt))||Date.parse(row.endAt)-Date.parse(row.startAt)>86400000)throw new Error('Invalid reservation interval.')
    text(row.tableId,'a table ID',60,true);text(row.tableName,'a table name',60,true)
    if(['seated','completed'].includes(row.status)){text(row.billId,'a bill ID',150);text(row.sessionId,'a bill session',100)}
    for(const event of row.events){const request=canonical(event.input);if(!same(event.input,request)||request.id!==row.id||request.commandId!==event.commandId||commands.has(event.commandId)||!Number.isFinite(Date.parse(event.at)))throw new Error('Invalid reservation history.');text(event.staffId,'a staff ID',150);text(event.staffName,'a staff name');commands.add(event.commandId)}
  }
  for(const [index,row] of record.entries.entries())if(active(row)&&row.tableId&&record.entries.slice(index+1).some(other=>active(other)&&other.tableId===row.tableId&&Date.parse(other.startAt)<Date.parse(row.endAt)&&Date.parse(row.startAt)<Date.parse(other.endAt)))throw new Error('This table already has a reservation during that time.')
  if(archives.some(archive=>archive.entries.some(row=>ids.has(row.id))))throw new Error('An archived reservation ID cannot be reused.')
  if(snapshot)return record
  const before=previous||empty(record.branchId)
  if(record.lastArchive && !same(record.lastArchive,before.lastArchive)) {
    const event=record.lastArchive,archive=archives.find(row=>row.id===record.archiveIds?.at(-1))
    if(!archive)throw new Error('Synchronize archived reservation history before updating the book.')
    validateReservationArchive(archive,before)
    if(event.staffId!==record.staffId||event.at!==record.updatedAt||event.staffName!==record.staffName)throw new Error('Invalid reservation archive operator.')
    const expected=reservationChange(previous,event.input,{branchId:record.branchId,user:{id:record.staffId,name:record.staffName},updatedAt:record.updatedAt})
    if(!same(expected,record)||archive.id!==record.archiveIds.at(-1)||archive.updatedAt!==record.updatedAt)throw new Error('Preserve all archived reservation history.')
    return record
  }
  if(record.expectedUpdatedAt!==before.updatedAt||before.entries.some(row=>!ids.has(row.id)))throw new Error('Refresh reservations and preserve their history.')
  const changed=record.entries.filter(row=>!same(row,before.entries.find(old=>old.id===row.id)))
  if(changed.length!==1)throw new Error('Change one reservation at a time.')
  const event=changed[0].events.at(-1)
  if(event.staffId!==record.staffId||event.staffName!==record.staffName||event.at!==record.updatedAt)throw new Error('Invalid reservation operator.')
  const expected=reservationChange(previous,event.input,{branchId:record.branchId,user:{id:record.staffId,name:record.staffName},updatedAt:record.updatedAt,timeZone:changed[0].timeZone,layout,tabs})
  if(!same(expected,record))throw new Error('Preserve reservation details and audit history.')
  return record
}
export function validateReservationArchive(record,book,previous) {
  if(record.kind!=='restaurant-reservation-archive'||record.expectedUpdatedAt!==''||record.id!==`reservation-archive:${record.branchId}:${record.commandId}`||typeof record.sourceUpdatedAt!=='string'||record.id.length>260||!record.entries?.length||record.entries.some(active)||record.event?.commandId!==record.commandId||record.event.input?.action!=='archive'||record.event.input.expectedUpdatedAt!==record.sourceUpdatedAt||record.event.staffId!==record.staffId||record.event.staffName!==record.staffName||record.event.at!==record.updatedAt)throw new Error('Only finished reservations can be archived.')
  canonical(record.event.input)
  validateReservationBook({...record,id:reservationBookId(record.branchId),kind:'restaurant-reservations',expectedUpdatedAt:record.sourceUpdatedAt},undefined,true)
  if(previous&&!same(previous,record))throw new Error('Archived reservation history cannot be changed.')
  if(book&&(record.sourceUpdatedAt!==book.updatedAt||!same(record.entries,book.entries.filter(row=>!active(row)))))throw new Error('Archive must retain the finished reservation history exactly.')
  return record
}
export function checkReservationOpening(book,input,tableId,guests,at) {
  const selected=input.reservationId?book?.entries.find(row=>row.id===input.reservationId):null
  const instant=Date.parse(at)
  if(input.reservationId&&(!selected||!['confirmed','arrived'].includes(selected.status)||selected.tableId!==tableId||selected.guests!==guests||instant<Date.parse(selected.startAt)-1800000||instant>=Date.parse(selected.endAt)))throw new Error('Choose a matching reservation within its seating window (30 minutes before arrival through departure).')
  if(book?.entries.some(row=>row.tableId===tableId&&tableId&&['confirmed','arrived'].includes(row.status)&&row.id!==selected?.id&&Date.parse(row.startAt)<=instant&&instant<Date.parse(row.endAt)))throw new Error('This table is reserved now. Open its reservation bill or choose another table.')
  return selected
}
export async function handleReservations({db,scope,organizationId,branchId,tillId,user,method,input,saveRecord,publish}) {
  const settings=(await db.query(`SELECT shop_profile FROM app_settings WHERE ${organizationId?'organization_id=?':'id=1'}`,organizationId?[organizationId]:[])).values[0]
  const profile=normalizeShopProfile(settings?.shop_profile)
  if(!profile.restaurant)throw new Error('The owner must enable Tables & tabs first.')
  const rows=(await db.query("SELECT payload FROM pos_records WHERE scope=? AND branch_id=? AND kind IN ('restaurant-reservations','restaurant-reservation-archive','restaurant-layout','restaurant-tab','restaurant-floor')",[scope,branchId])).values.map(row=>JSON.parse(row.payload))
  const previous=rows.find(row=>row.kind==='restaurant-reservations'),layout=rows.find(row=>row.kind==='restaurant-layout')||{tables:[]}
  const tabs=restaurantTabs(rows.filter(row=>row.kind==='restaurant-tab'),rows.find(row=>row.kind==='restaurant-floor'))
  const archives=rows.filter(row=>row.kind==='restaurant-reservation-archive'&&previous?.archiveIds?.includes(row.id))
  if(method==='GET')return {book:previous||empty(branchId),archives,timeZone:profile.reportingTimeZone,layout,tabs}
  if(method!=='POST'||!tillId)throw new Error('Use a registered till to save reservations.')
  if(!['owner','admin','cashier'].includes(user.role))throw new Error('Staff access required.')
  const request=canonical(input),event=[...(previous?.entries||[]),...archives.flatMap(row=>row.entries)].flatMap(row=>row.events).find(event=>event.commandId===request.commandId)||(previous?.lastArchive?.commandId===request.commandId?previous.lastArchive:null)||archives.find(row=>row.commandId===request.commandId)?.event
  if(event){if(!same(event.input,request))throw new Error('This reservation command already has different details.');return {book:previous,entry:previous.entries.find(row=>row.id===request.id)}}
  if(request.action==='create'&&archives.some(row=>row.entries.some(entry=>entry.id===request.id)))throw new Error('This reservation ID already exists in archived history.')
  const updatedAt=new Date(Math.max(Date.now(),previous?Date.parse(previous.updatedAt)+1:0)).toISOString(),record=reservationChange(previous,request,{branchId,user,updatedAt,timeZone:profile.reportingTimeZone,layout,tabs})
  let archive
  if(request.action==='archive') {
    if(!['owner','admin'].includes(user.role))throw new Error('Only the owner or admin can archive reservation history.')
    archive={id:record.archiveIds.at(-1),kind:'restaurant-reservation-archive',branchId,expectedUpdatedAt:'',commandId:request.commandId,sourceUpdatedAt:previous.updatedAt,updatedAt,staffId:user.id,staffName:user.name,event:record.lastArchive,entries:previous.entries.filter(row=>!active(row))}
    validateReservationArchive(archive,previous)
    validateReservationBook(record,previous,false,layout,tabs,[archive])
  }
  if(['create','update'].includes(request.action)&&Date.parse(record.entries.find(row=>row.id===request.id).endAt)<=Date.now())throw new Error('Choose a reservation that has not already ended.')
  await db.beginTransaction()
  try{
    const current=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,record.id])).values[0]
    if((current?JSON.parse(current.payload).updatedAt:'')!==record.expectedUpdatedAt)throw new Error('Reservations changed. Refresh and review before saving.')
    if(archive){await saveRecord(db,scope,archive);await publish(archive)}
    await saveRecord(db,scope,record);await publish(record);await db.commitTransaction()
  }catch(error){await db.rollbackTransaction();throw error}
  return {book:record,entry:record.entries.find(row=>row.id===request.id)}
}
