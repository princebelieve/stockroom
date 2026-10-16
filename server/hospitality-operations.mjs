const text=(value,max=200)=>{if(typeof value!=='string'||value.trim().length>max)throw new Error('Enter valid operation details.');return value.trim()}
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))
const date=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;const parsed=new Date(`${value}T00:00:00.000Z`);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value}
export function validateHospitalityRecord(record, previous) {
  if(!record||!['hotel-stay','nightclub-event','nightclub-entry'].includes(record.kind)||!record.id||!record.branchId||!iso(record.updatedAt)||!iso(record.createdAt))throw new Error('Invalid hospitality operation.')
  if(previous&&(record.expectedUpdatedAt||'')!==previous.updatedAt)throw new Error('This record changed. Refresh before continuing.')
  if(record.kind==='hotel-stay'){
    if(!String(record.id).startsWith('hotel-stay:')||!text(record.roomName,80)||!text(record.guestName)||!['booked','checked-in','checked-out','cancelled'].includes(record.status)||!date(record.checkIn)||!date(record.checkOut)||record.checkOut<=record.checkIn)throw new Error('Enter a guest, room and valid multi-night stay dates.')
    text(record.guestPhone||'',80);text(record.note||'',500)
    if(previous){for(const field of ['id','kind','branchId','roomName','guestName','guestPhone','checkIn','checkOut','note','createdAt'])if(record[field]!==previous[field])throw new Error('Saved booking details are fixed; cancel it and create a replacement.');const allowed={booked:['checked-in','cancelled'],'checked-in':['checked-out'], 'checked-out':[],cancelled:[]};if(record.status!==previous.status&&!allowed[previous.status].includes(record.status))throw new Error('Follow the hotel stay stages.')}
  } else if(record.kind==='nightclub-event'){
    if(!String(record.id).startsWith('nightclub-event:')||!text(record.name)||!iso(record.startsAt)||!['scheduled','closed','cancelled'].includes(record.status)||!Number.isInteger(record.capacity)||record.capacity<0||record.capacity>100000)throw new Error('Enter a named event, start time and valid capacity.')
    if(previous&&['name','startsAt','capacity','createdAt','id','branchId'].some(field=>record[field]!==previous[field]))throw new Error('Event details cannot be overwritten after creation.')
    if(previous&&record.status!==previous.status&&!({scheduled:['closed','cancelled'],closed:[],cancelled:[]})[previous.status]?.includes(record.status))throw new Error('Follow the event stages.')
  } else {
    if(!String(record.id).startsWith('nightclub-entry:')||!String(record.eventId||'').startsWith('nightclub-event:')||!text(record.guestName)||!['expected','checked-in','cancelled'].includes(record.status))throw new Error('Enter a valid event guest.')
    if(previous&&['eventId','guestName','guestPhone','createdAt','id','branchId'].some(field=>record[field]!==previous[field]))throw new Error('Guest entry details cannot be overwritten.')
    if(previous&&record.status!==previous.status&&!({expected:['checked-in','cancelled'],'checked-in':[],cancelled:[]})[previous.status]?.includes(record.status))throw new Error('Follow the guest entry stages.')
  }
  return record
}
export const requiresHospitalitySync=operation=>['hotel-stay','nightclub-event','nightclub-entry'].includes(operation.payload?.kind)
export async function handleHospitality({db,scope,branchId,user,method,input,publish,saveRecord}){
  const kinds=['hotel-stay','nightclub-event','nightclub-entry']
  const records=(await db.query(`SELECT payload FROM pos_records WHERE scope=? AND branch_id=? AND kind IN (${kinds.map(()=>'?').join(',')}) ORDER BY updated_at DESC`,[scope,branchId,...kinds])).values.map(row=>JSON.parse(row.payload))
  if(method==='GET')return {stays:records.filter(row=>row.kind==='hotel-stay'),events:records.filter(row=>row.kind==='nightclub-event'),entries:records.filter(row=>row.kind==='nightclub-entry')}
  const action=String(input.action||'')
  const randomUUID=()=>globalThis.crypto.randomUUID()
  const now=new Date().toISOString(),id=String(input.id||`${action}:${randomUUID()}`)
  const previousRow=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,id])).values[0]
  const previous=previousRow?JSON.parse(previousRow.payload):null
  if(previous&&previous.branchId!==branchId)throw new Error('Manage this record in its original branch.')
  if(input.expectedUpdatedAt!==(previous?.updatedAt||''))throw new Error('This record changed. Refresh before continuing.')
  let record
  if(action==='book-stay'&&!previous)record={id:`hotel-stay:${randomUUID()}`,kind:'hotel-stay',branchId,createdAt:now,updatedAt:now,status:'booked',roomName:text(input.roomName,80),guestName:text(input.guestName),guestPhone:text(input.guestPhone||'',80),checkIn:text(input.checkIn,10),checkOut:text(input.checkOut,10),note:text(input.note||'',500),staffId:user.id}
  else if(action==='create-event'&&!previous)record={id:`nightclub-event:${randomUUID()}`,kind:'nightclub-event',branchId,createdAt:now,updatedAt:now,status:'scheduled',name:text(input.name),startsAt:text(input.startsAt,40),capacity:Number(input.capacity||0),staffId:user.id}
  else if(action==='add-guest'&&!previous){const event=records.find(row=>row.id===input.eventId&&row.kind==='nightclub-event');if(!event||event.status!=='scheduled')throw new Error('Choose a scheduled event.');record={id:`nightclub-entry:${randomUUID()}`,kind:'nightclub-entry',branchId,eventId:event.id,createdAt:now,updatedAt:now,status:'expected',guestName:text(input.guestName),guestPhone:text(input.guestPhone||'',80),staffId:user.id}}
  else if(action==='status'&&previous){record={...previous,status:text(input.status,30),updatedAt:now,expectedUpdatedAt:previous.updatedAt,staffId:user.id}}
  else throw new Error('Unknown hospitality operation.')
  validateHospitalityRecord(record,previous)
  if(record.kind==='hotel-stay'&&record.status==='booked'&&records.some(row=>row.kind==='hotel-stay'&&row.id!==record.id&&row.roomName.toLocaleLowerCase()===record.roomName.toLocaleLowerCase()&&['booked','checked-in'].includes(row.status)&&record.checkIn<row.checkOut&&record.checkOut>row.checkIn))throw new Error('That room already has an overlapping booking.')
  if(record.kind==='nightclub-entry'&&record.status==='expected'){const event=records.find(row=>row.id===record.eventId);if(event?.capacity&&records.filter(row=>row.kind==='nightclub-entry'&&row.eventId===event.id&&row.status!=='cancelled').length>=event.capacity)throw new Error('This event has reached its guest capacity.')}
  await db.beginTransaction()
  try{const current=(await db.query('SELECT payload FROM pos_records WHERE scope=? AND id=?',[scope,record.id])).values[0];if((current?JSON.parse(current.payload).updatedAt:'')!==(previous?.updatedAt||''))throw new Error('This record changed. Refresh before continuing.');await saveRecord(db,scope,record);await publish(record);await db.commitTransaction()}catch(error){await db.rollbackTransaction();throw error}
  return record
}
