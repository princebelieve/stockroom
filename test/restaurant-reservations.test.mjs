import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { handlePos, applyPosRecord, ensurePos } from '../server/pos-service.mjs'
import { reservationInstant, reservationLocalTime } from '../server/reservation-time.mjs'
import { validateReservationBook, validateReservationArchive, checkReservationOpening, requiresReservationSync } from '../server/restaurant-reservations.mjs'

function fixture(timeZone='UTC') {
  const sql=new DatabaseSync(':memory:')
  sql.exec("CREATE TABLE app_settings(id INTEGER PRIMARY KEY,shop_profile TEXT,app_name TEXT,currency TEXT);CREATE TABLE customers(id TEXT,name TEXT,phone TEXT,balance REAL);CREATE TABLE users(id TEXT,organization_id TEXT,name TEXT);CREATE TABLE branches(id TEXT,assigned_user_ids TEXT);")
  sql.prepare('INSERT INTO users VALUES(?,?,?)').run('owner','business','Owner');sql.prepare('INSERT INTO users VALUES(?,?,?)').run('cleaner','business','Cleaner');sql.prepare('INSERT INTO branches VALUES(?,?)').run('main','[]')
  sql.prepare('INSERT INTO app_settings VALUES(1,?,?,?)').run(JSON.stringify({restaurant:true,reportingTimeZone:timeZone,features:{hospitalityOperations:true}}),'Cafe','USD')
  const db={query:(s,p=[])=>({values:sql.prepare(s).all(...p)}),run:(s,p=[])=>sql.prepare(s).run(...p),beginTransaction:()=>sql.exec('BEGIN'),commitTransaction:()=>sql.exec('COMMIT'),rollbackTransaction:()=>sql.exec('ROLLBACK')}
  const published=[]
  const options={db,scope:'business',branchId:'main',tillId:'till',user:{id:'owner',name:'Owner',role:'owner'},sales:()=>[],publish:record=>published.push(record)}
  const call=(input,extra={})=>handlePos({...options,...extra,path:'/api/pos/restaurant/reservations',method:input?'POST':'GET',input:input||{}})
  const hospitality=(input,method='POST')=>handlePos({...options,path:'/api/pos/hospitality',method,input:input||{}})
  const command=(path,input,extra={})=>handlePos({...options,...extra,path:'/api/pos/restaurant/'+path,method:'POST',input:{commandId:crypto.randomUUID(),expectedUpdatedAt:'',...input}})
  const layout={id:'restaurant-layout:main',tables:[{id:'one',name:'Table 1',seats:4},{id:'two',name:'Table 2',seats:4}]}
  const setup=()=>command('layout',layout)
  return {sql,db,call,hospitality,command,setup,layout,published}
}
const create={action:'create',id:'reservation:guest001',commandId:'book001',expectedUpdatedAt:'',name:'Ada',phone:'555',guests:2,tableId:'one',startLocal:'2099-05-01T18:00',endLocal:'2099-05-01T19:30',timeZone:'UTC',occurrence:'earlier',note:'Birthday'}

test('reservation times use business timezone, handle DST gaps and repeated clocks, and reject invalid dates',()=>{
  assert.equal(reservationInstant('2026-10-06T18:00','Africa/Lagos'),'2026-10-06T17:00:00.000Z')
  assert.equal(reservationLocalTime('2026-10-06T17:00:00.000Z','Africa/Lagos'),'2026-10-06T18:00')
  assert.equal(reservationInstant('2026-11-01T01:30','America/New_York','earlier'),'2026-11-01T05:30:00.000Z')
  assert.equal(reservationInstant('2026-11-01T01:30','America/New_York','later'),'2026-11-01T06:30:00.000Z')
  assert.throws(()=>reservationInstant('2026-03-08T02:30','America/New_York'),/does not exist/)
  assert.throws(()=>reservationInstant('2026-02-30T18:00','UTC'),/valid/)
  assert.throws(()=>reservationInstant('2026-01-01T25:00','UTC'),/does not exist/)
})

test('bookings prevent overlap and excess guests, permit adjacent bookings and unassigned requests, and reject stale calendars',async()=>{
  const f=fixture();try{
    await f.setup()
    const first=await f.call(create)
    assert.equal(first.entry.status,'confirmed');assert.equal(first.entry.startAt,'2099-05-01T18:00:00.000Z')
    await f.call(create);assert.equal((await f.call()).book.entries.length,1)
    await assert.rejects(f.call({...create,name:'Other guest'}),/different details/)
    await assert.rejects(f.call({...create,id:'reservation:stale',commandId:'stale'}),/changed/)
    const input={...create,expectedUpdatedAt:first.book.updatedAt,id:'reservation:other001',commandId:'other001'}
    await assert.rejects(f.call(input),/already has a reservation/)
    await assert.rejects(f.call({...input,guests:5}),/enough seats/)
    await assert.rejects(f.call({...input,tableId:'missing'}),/existing table/)
    const adjacent=await f.call({...input,startLocal:create.endLocal,endLocal:'2099-05-01T21:00'})
    const unassigned=await f.call({...input,id:'reservation:request001',commandId:'request001',tableId:'',expectedUpdatedAt:adjacent.book.updatedAt})
    assert.equal(unassigned.entry.tableId,'')
    const originalLayout=(await f.command('layout',{...f.layout,expectedUpdatedAt:f.published[0].updatedAt})).updatedAt
    await assert.rejects(f.command('layout',{...f.layout,expectedUpdatedAt:originalLayout,tables:[f.layout.tables[1]]}),/Reschedule or cancel/)
    const modified=structuredClone(unassigned.book);modified.entries[0].name='Rewritten history'
    assert.throws(()=>validateReservationBook(modified,adjacent.book,false,f.layout),/one reservation|history|changed|preserve/i)
    assert.equal(requiresReservationSync({entityType:'pos_record',payload:first.book}),true)
  }finally{f.sql.close()}
})

test('arrival and seating link a real bill, protect reserved tables, and retain completed history',async()=>{
  const f=fixture();try{
    await f.setup()
    const input={...create,startLocal:reservationLocalTime(new Date(Date.now()-600000).toISOString(),'UTC'),endLocal:reservationLocalTime(new Date(Date.now()+3600000).toISOString(),'UTC')}
    let {book}=await f.call(input)
    await assert.rejects(f.command('open',{id:'restaurant-tab:main:one',tableId:'one',sessionId:'walk-in',guests:2}),/reserved now/)
    await assert.rejects(f.call({action:'seat',id:create.id,commandId:'fake-seat',expectedUpdatedAt:book.updatedAt,billId:'missing',sessionId:'missing'}),/matching reservation bill/)
    book=(await f.call({action:'arrive',id:create.id,commandId:'arrive',expectedUpdatedAt:book.updatedAt})).book
    const bill=await f.command('open',{id:'restaurant-tab:main:one',tableId:'one',sessionId:'guest-bill',guests:2,reservationId:create.id})
    assert.equal(bill.reservationId,create.id)
    book=(await f.call({action:'seat',id:create.id,commandId:'seat',expectedUpdatedAt:book.updatedAt,billId:bill.id,sessionId:bill.sessionId})).book
    assert.equal(book.entries[0].status,'seated');assert.equal(book.entries[0].sessionId,bill.sessionId)
    await assert.rejects(f.call({action:'cancel',id:create.id,commandId:'cancel',expectedUpdatedAt:book.updatedAt,reason:'Changed mind'}),/stages/)
    const finished=await f.call({action:'complete',id:create.id,commandId:'complete',expectedUpdatedAt:book.updatedAt})
    assert.equal(finished.entry.status,'completed');assert.equal(finished.entry.events.length,4)
    checkReservationOpening(finished.book,{},'one',2,new Date().toISOString())
    assert.equal((await f.call()).tabs[0].status,'open','Completing a visit does not erase or close its unpaid bill')
  }finally{f.sql.close()}
})

test('cancellation and no-show keep reasons; archives preserve history and roll back together',async()=>{
  const f=fixture(),remote=fixture();try{
    await f.setup()
    let {book}=await f.call(create)
    const cancel={action:'cancel',id:create.id,commandId:'cancel',expectedUpdatedAt:book.updatedAt,reason:'Guest cancelled'}
    book=(await f.call(cancel)).book
    const archiveRequest={action:'archive',id:'reservation:archive001',commandId:'archive001',expectedUpdatedAt:book.updatedAt}
    await assert.rejects(f.call(archiveRequest,{publish:()=>{throw new Error('outbox failed')}}),/outbox/)
    assert.equal((await f.call()).book.entries.length,1)
    await assert.rejects(f.call(archiveRequest,{user:{id:'staff',name:'Cashier',role:'cashier'}}),/owner or admin/)
    const archived=await f.call(archiveRequest)
    const loaded=await f.call()
    assert.equal(archived.book.entries.length,0);assert.equal(loaded.archives[0].entries[0].events.at(-1).input.reason,'Guest cancelled')
    await f.call(archiveRequest);await f.call(cancel)
    assert.equal((await f.call()).archives.length,1)
    await assert.rejects(f.call({...create,commandId:'reused-id',expectedUpdatedAt:archived.book.updatedAt}),/archived history/)
    validateReservationBook(archived.book,book,false,f.layout,[],loaded.archives)
    assert.throws(()=>validateReservationArchive({...loaded.archives[0],entries:[{...loaded.archives[0].entries[0],name:'Rewritten'}]},book),/exactly/)
    await ensurePos(remote.db);await applyPosRecord(remote.db,'business',loaded.archives[0]);await applyPosRecord(remote.db,'business',archived.book)
    await applyPosRecord(remote.db,'business',loaded.archives[0])
    assert.equal(remote.sql.prepare("SELECT COUNT(*) AS n FROM pos_records WHERE kind='restaurant-reservation-archive'").get().n,1)
    let next=(await f.call({...create,id:'reservation:next001',commandId:'next001',expectedUpdatedAt:archived.book.updatedAt})).book
    const noShow=await f.call({action:'no-show',id:'reservation:next001',commandId:'no-show',expectedUpdatedAt:next.updatedAt,reason:'Did not arrive'})
    assert.equal(noShow.entry.status,'no-show')
    validateReservationBook(noShow.book,next,false,f.layout)
  }finally{f.sql.close();remote.sql.close()}
})

test('business timezone changes require review and failed saves do not create reservations',async()=>{
  const f=fixture('Africa/Lagos');try{
    await f.setup()
    await assert.rejects(f.call(create),/timezone changed/)
    await assert.rejects(f.call({...create,timeZone:'Africa/Lagos'},{publish:()=>{throw new Error('outbox failed')}}),/outbox/)
    assert.equal((await f.call()).book.entries.length,0)
    const result=await f.call({...create,timeZone:'Africa/Lagos'})
    assert.equal(result.entry.startAt,'2099-05-01T17:00:00.000Z')
  }finally{f.sql.close()}
})

test('hotel guests can link their restaurant reservation and the opened table bill keeps the stay link',async()=>{
  const f=fixture();try{
    await f.setup()
    const arrival=new Date(Date.now()+20*60000),departure=new Date(Date.now()+90*60000)
    const startLocal=reservationLocalTime(arrival.toISOString(),'UTC'),endLocal=reservationLocalTime(departure.toISOString(),'UTC')
    const stay={id:'hotel-stay:guest001',kind:'hotel-stay',branchId:'main',roomName:'Room 4',guestName:'Ada',guestPhone:'555',checkIn:startLocal.slice(0,10),checkOut:new Date(Date.parse(startLocal.slice(0,10)+'T00:00:00Z')+86400000).toISOString().slice(0,10),nightlyRate:100,status:'checked-in',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}
    await ensurePos(f.db);await f.db.run('INSERT INTO pos_records(scope,id,kind,branch_id,payload,updated_at) VALUES(?,?,?,?,?,?)',['business',stay.id,stay.kind,'main',JSON.stringify(stay),stay.updatedAt])
    const request={...create,id:'reservation:hotelguest',commandId:'book-hotelguest',startLocal,endLocal,name:'Ada',phone:'555',hotelStayId:stay.id}
    await assert.rejects(f.call({...request,name:'Different guest'}),/match the hotel guest/)
    let {book,entry}=await f.call(request)
    assert.equal(entry.hotelStayId,stay.id)
    book=(await f.call({action:'arrive',id:entry.id,commandId:'hotel-arrive',expectedUpdatedAt:book.updatedAt})).book
    const bill=await f.command('open',{id:'restaurant-tab:main:one',tableId:'one',sessionId:'hotel-guest-bill',guests:2,reservationId:entry.id})
    assert.equal(bill.hotelStayId,stay.id)
    assert.equal((await f.call()).hotelStays[0].id,stay.id)
  }finally{f.sql.close()}
})

test('nightlife event reservations validate the event and keep it linked to the open venue tab',async()=>{
  const f=fixture();try{
    await f.setup()
    await ensurePos(f.db)
    const eventStart=new Date(Date.now()+10*60000),arrival=new Date(Date.now()+20*60000),departure=new Date(Date.now()+80*60000)
    const startLocal=reservationLocalTime(arrival.toISOString(),'UTC'),endLocal=reservationLocalTime(departure.toISOString(),'UTC')
    const event={id:'nightclub-event:event001',kind:'nightclub-event',branchId:'main',name:'Friday Live',status:'scheduled',startsAt:eventStart.toISOString(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),capacity:100,admissionPrice:20}
    await f.db.run('INSERT INTO pos_records(scope,id,kind,branch_id,payload,updated_at) VALUES(?,?,?,?,?,?)',['business',event.id,event.kind,'main',JSON.stringify(event),event.updatedAt])
    const request={...create,id:'reservation:eventguest',commandId:'book-eventguest',startLocal,endLocal,nightlifeEventId:event.id}
    const saved=await f.call(request)
    assert.equal(saved.entry.nightlifeEventName,event.name)
    assert.equal((await f.call()).nightlifeEvents[0].id,event.id)
    await assert.rejects(f.call({...request,id:'reservation:wrongdate',commandId:'wrongdate',startLocal:reservationLocalTime(new Date(arrival.getTime()+86400000).toISOString(),'UTC'),endLocal:reservationLocalTime(new Date(departure.getTime()+86400000).toISOString(),'UTC'),expectedUpdatedAt:saved.book.updatedAt}),/event date/)
    const arrived=await f.call({action:'arrive',id:saved.entry.id,commandId:'event-arrive',expectedUpdatedAt:saved.book.updatedAt})
    const bill=await f.command('open',{id:'restaurant-tab:main:one',tableId:'one',sessionId:'event-guest-bill',guests:2,reservationId:saved.entry.id})
    assert.equal(bill.nightlifeEventId,event.id)
    assert.equal(bill.nightlifeEventName,event.name)
    assert.equal(arrived.entry.status,'arrived')
  }finally{f.sql.close()}
})

test('hotel check-in requires a ready room and occupied rooms cannot be put into cleaning',async()=>{
  const f=fixture();try{
    const room=await f.hospitality({action:'add-room',roomName:'Room 12',nightlyRate:120,expectedUpdatedAt:'',commandId:'add-room'})
    assert.equal(room.housekeepingStatus,'ready')
    const stay=await f.hospitality({action:'book-stay',roomId:room.id,guestName:'Ada',guestPhone:'555',checkIn:'2099-05-01',checkOut:'2099-05-03',note:'',expectedUpdatedAt:'',commandId:'book-stay'})
    const dirty=await f.hospitality({action:'update-room',id:room.id,status:'active',housekeepingStatus:'cleaning',nightlyRate:120,expectedUpdatedAt:room.updatedAt,commandId:'start-clean'})
    const scheduled=await f.hospitality({action:'update-room',id:room.id,status:'active',housekeepingStatus:'cleaning',housekeepingAssignedTo:'cleaner',housekeepingScheduledAt:'2099-05-01T08:00',nightlyRate:120,expectedUpdatedAt:dirty.updatedAt,commandId:'schedule-clean'})
    assert.equal(scheduled.housekeepingAssignedTo,'cleaner');assert.equal(scheduled.housekeepingScheduledAt,'2099-05-01T08:00')
    await assert.rejects(f.hospitality({action:'status',id:stay.id,status:'checked-in',expectedUpdatedAt:stay.updatedAt,commandId:'blocked-check-in'}),/mark the room ready/)
    const ready=await f.hospitality({action:'update-room',id:room.id,status:'active',housekeepingStatus:'ready',housekeepingAssignedTo:'',housekeepingScheduledAt:'',nightlyRate:120,expectedUpdatedAt:scheduled.updatedAt,commandId:'finish-clean'})
    const checkedIn=await f.hospitality({action:'status',id:stay.id,status:'checked-in',expectedUpdatedAt:stay.updatedAt,commandId:'check-in'})
    assert.equal(checkedIn.status,'checked-in')
    await assert.rejects(f.hospitality({action:'update-room',id:room.id,status:'active',housekeepingStatus:'dirty',nightlyRate:120,expectedUpdatedAt:ready.updatedAt,commandId:'dirty-occupied'}),/Check out the guest/)
    await assert.rejects(f.hospitality({action:'update-room',id:room.id,status:'active',housekeepingStatus:'ready',housekeepingAssignedTo:'intruder',housekeepingScheduledAt:'2099-05-01T08:00',nightlyRate:120,expectedUpdatedAt:ready.updatedAt,commandId:'invalid-cleaner'}),/active staff member/)
  }finally{f.sql.close()}
})
