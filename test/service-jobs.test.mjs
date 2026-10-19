import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { handlePos,ensurePos,applyPosRecord } from '../server/pos-service.mjs'
import { validateServiceJob,serviceJobBalance } from '../server/service-jobs.mjs'
import { stockSchema } from '../server/stock-ledger.mjs'
function fixture() {
 const sql=new DatabaseSync(':memory:')
 sql.exec(vm.runInNewContext(readFileSync('src/lib/browserSchema.ts','utf8').split('export const browserSchema = ')[1].trim()))
 if(!sql.prepare('PRAGMA table_info(users)').all().some(row=>row.name==='permissions'))sql.exec('ALTER TABLE users ADD COLUMN permissions TEXT')
 if(!sql.prepare('PRAGMA table_info(users)').all().some(row=>row.name==='operational_access'))sql.exec('ALTER TABLE users ADD COLUMN operational_access INTEGER NOT NULL DEFAULT 0')
 sql.exec("INSERT INTO app_settings(id,app_name,currency,updated_at) VALUES(1,'Print Shop','USD','2026-01-01');")
 const db={query:(s,p=[])=>({values:sql.prepare(s).all(...p)}),run:(s,p=[])=>sql.prepare(s).run(...p),beginTransaction:()=>sql.exec('BEGIN'),commitTransaction:()=>sql.exec('COMMIT'),rollbackTransaction:()=>sql.exec('ROLLBACK')}
 let fail=false;const published=[]
 const options={db,scope:'business',branchId:'main',user:{id:'owner',name:'Owner',role:'owner'},tillId:'till1',publish:async record=>{if(fail)throw new Error('outbox failed');published.push(record)},sales:()=>[]}
 const call=(path,input,extra={})=>handlePos({...options,...extra,path:'/api/pos/service-jobs'+path,method:input?'POST':'GET',input:input||{}})
 const create={id:'service-job:test',commandId:'create',expectedUpdatedAt:'',title:'200 flyers',customerName:'Ada',customerPhone:'555',lines:[{id:'flyers',description:'Flyers',quantity:200,price:0.5}]}
 return {sql,db,call,pos:(path,input)=>handlePos({...options,path,method:input?'POST':'GET',input:input||{},sales:()=>sql.prepare('SELECT id,total,payment_method AS paymentMethod,payment_details AS paymentDetails FROM sales').all().map(row=>({...row,paymentDetails:JSON.parse(row.paymentDetails),items:sql.prepare('SELECT product_id AS productId,product_name AS productName,quantity,unit_price AS price FROM sale_items WHERE sale_id=?').all(row.id)}))}),create,published,setFail:value=>fail=value}
}

test('split invoice payment validates totals, retries once and counts only net cash in the till',async()=>{
 const f=fixture();try{
 const register=await f.pos('/api/pos/registers',{action:'open',amount:0})
 const {job}=await f.call('',f.create)
 const request={id:job.id,commandId:'split',expectedUpdatedAt:job.updatedAt,amount:'100',method:'multiple',cash:'50',parts:[{method:'cash',amount:'40',cashReceived:'50'},{method:'bank-transfer',amount:'60',provider:'Bank',reference:'bank-confirmed'}]}
 await assert.rejects(f.call('/pay',{...request,parts:[{method:'cash',amount:'30'},{method:'bank-transfer',amount:'60',provider:'Bank',reference:'bank-confirmed'}]}),/total|sum|match|equal/i)
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sales').get().n,0)
 const result=await f.call('/pay',request)
 assert.equal(serviceJobBalance(result.job).due,0)
 assert.equal(result.sale.paymentDetails.changeGiven,10)
 await f.call('/pay',request)
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sales').get().n,1)
 const closing=await f.pos('/api/pos/registers',{id:register.id,action:'close',amount:40})
 assert.equal(closing.expectedCash,40);assert.equal(closing.difference,0)
 }finally{f.sql.close()}
})
test('invoice snapshots, deposits, retry safety, balances and non-stock accounting',async()=>{
 const f=fixture();try{
 const register=await f.pos('/api/pos/registers',{action:'open',amount:0})
 let {job}=await f.call('',f.create)
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sales').get().n,0)
 const request={id:job.id,commandId:'deposit',expectedUpdatedAt:job.updatedAt,amount:'30',method:'cash'}
 let result=await f.call('/pay',request);job=result.job
 assert.equal(result.sale.total,30);assert.equal(result.sale.paymentDetails.serviceJob.balanceDue,70)
 await f.call('/pay',request)
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sales').get().n,1)
 await assert.rejects(f.call('/pay',{...request,amount:'35'}),/different details/)
 await assert.rejects(f.call('/pay',{...request,commandId:'stale'}),/changed/)
 await assert.rejects(f.call('/pay',{...request,commandId:'wrong-till',expectedUpdatedAt:job.updatedAt},{tillId:'till2'}),/original till/)
 await assert.rejects(f.call('/pay',{...request,commandId:'too-much',expectedUpdatedAt:job.updatedAt,amount:'71'}),/remaining balance/)
 result=await f.call('/pay',{...request,commandId:'balance',expectedUpdatedAt:job.updatedAt,amount:'70'});job=result.job
 assert.equal(serviceJobBalance(job).due,0)
 assert.equal(f.sql.prepare('SELECT SUM(total) AS total FROM sales').get().total,100)
 const closing=await f.pos('/api/pos/registers',{id:register.id,action:'close',amount:100})
 assert.equal(closing.expectedCash,100);assert.equal(closing.difference,0)
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM inventory_movements').get().n,0)
 assert.throws(()=>validateServiceJob({...job,lines:[{...job.lines[0],price:1}]},job),/pricing/)
 const replay={...job};await applyPosRecord(f.db,'business',replay);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sales').get().n,2)
 const remote=fixture();try{await ensurePos(remote.db);await applyPosRecord(remote.db,'business',replay);await applyPosRecord(remote.db,'business',replay);assert.equal(remote.sql.prepare('SELECT COUNT(*) AS n,SUM(total) AS total FROM sales').get().n,2);assert.equal(remote.sql.prepare('SELECT SUM(total) AS total FROM sales').get().total,100)}finally{remote.sql.close()}
 }finally{f.sql.close()}
})
test('estimates, progress, refund balance, permissions and cancellation',async()=>{
 const f=fixture();try{
 let {job}=await f.call('',{...f.create,estimate:true})
 await assert.rejects(f.call('/pay',{id:job.id,commandId:'no',expectedUpdatedAt:job.updatedAt,amount:'10',method:'cash'}),/Issue/)
 job=(await f.call('/status',{id:job.id,commandId:'accept',expectedUpdatedAt:job.updatedAt,status:'new'})).job
 job=(await f.call('/status',{id:job.id,commandId:'start',expectedUpdatedAt:job.updatedAt,status:'in-progress'})).job
 job=(await f.call('/pay',{id:job.id,commandId:'deposit',expectedUpdatedAt:job.updatedAt,amount:'30',method:'cash'})).job
 await assert.rejects(f.call('/status',{id:job.id,commandId:'cancel',expectedUpdatedAt:job.updatedAt,status:'cancelled'}),/refund/)
 assert.equal(serviceJobBalance(job,[{saleId:job.payments[0].sale.id,total:10}]).due,80)
 const returned=await f.pos('/api/pos/returns',{id:'refund-deposit',saleId:job.payments[0].sale.id,reason:'Partial refund',method:'cash',items:[{lineIndex:0,amount:10}]})
 assert.equal(returned.total,10)
 assert.equal((await f.call('')).jobs[0].balance.due,80)
 await assert.rejects(f.pos('/api/pos/returns',{id:'refund-too-much',saleId:job.payments[0].sale.id,reason:'Over refund',method:'cash',items:[{lineIndex:0,amount:21}]}),/remaining/)
 await f.pos('/api/pos/returns',{id:'refund-rest',saleId:job.payments[0].sale.id,reason:'Remaining deposit',method:'cash',items:[{lineIndex:0,amount:20}]})
 job=(await f.call('/status',{id:job.id,commandId:'cancel-refunded',expectedUpdatedAt:job.updatedAt,status:'cancelled'})).job
 assert.equal(job.status,'cancelled');assert.equal(serviceJobBalance(job).due,0)

 await assert.rejects(f.call('/status',{id:job.id,commandId:'cashier-cancel',expectedUpdatedAt:job.updatedAt,status:'cancelled'},{user:{id:'staff',name:'Cashier',role:'cashier'}}),/owner or admin/)
 }finally{f.sql.close()}
})
test('failed payment persistence rolls back receipt and job, and saved tax allocates across payments',async()=>{
 const f=fixture();try{
 await ensurePos(f.db)
 f.sql.prepare("INSERT INTO pos_records(scope,id,kind,branch_id,payload,updated_at) VALUES('business','receipt-settings','receipt-settings','main',?,'2026-01-01')").run(JSON.stringify({value:{taxEnabled:true,taxIncluded:true,taxRate:7}}))
 let {job}=await f.call('',{...f.create,lines:[{id:'small',description:'Small job',quantity:1,price:1}]})
 f.setFail(true)
 const input={id:job.id,commandId:'one',expectedUpdatedAt:job.updatedAt,amount:'0.30',method:'cash'}
 await assert.rejects(f.call('/pay',input),/outbox/)
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sales').get().n,0)
 f.setFail(false);job=(await f.call('/pay',input)).job
 job=(await f.call('/pay',{...input,commandId:'two',expectedUpdatedAt:job.updatedAt,amount:'0.70'})).job
 assert.equal(job.payments.reduce((n,p)=>n+Math.round(p.sale.paymentDetails.pos.pricing.tax*100),0),Math.round(job.pricing.tax*100))
 assert.equal(serviceJobBalance(job).due,0)
 }finally{f.sql.close()}
})


test('wallet invoice deposits are linked, atomic, idempotent, replay-safe and refundable',async()=>{
 const f=fixture();try{
 f.sql.exec("INSERT INTO customers(id,name,phone,balance) VALUES('ada','Ada','555',150); UPDATE app_settings SET payment_policy='{\"allowWallet\":true}';")
 const {job}=await f.call('',{...f.create,customerId:'ada'})
 const request={id:job.id,commandId:'wallet-deposit',expectedUpdatedAt:job.updatedAt,amount:'30',method:'wallet',customerId:'ada'}
 await assert.rejects(f.call('/pay',{...request,customerId:'other'}),/invoice-linked/)
 f.setFail(true);await assert.rejects(f.call('/pay',request),/outbox failed/);f.setFail(false)
 assert.equal(f.sql.prepare("SELECT balance FROM customers WHERE id='ada'").get().balance,150)
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sales').get().n,0)
 const result=await f.call('/pay',request);assert.equal(result.sale.paymentMethod,'wallet');assert.equal(serviceJobBalance(result.job).due,70)
 await f.call('/pay',request);await applyPosRecord(f.db,'business',result.job)
 assert.equal(f.sql.prepare("SELECT balance FROM customers WHERE id='ada'").get().balance,120)
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM wallet_transactions').get().n,1)
 f.sql.exec("UPDATE customers SET balance=5 WHERE id='ada'")
 await assert.rejects(f.call('/pay',{...request,commandId:'too-poor',expectedUpdatedAt:result.job.updatedAt}),/insufficient/)
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sales').get().n,1)
 const refund=await f.pos('/api/pos/returns',{id:'wallet-invoice-refund',saleId:result.sale.id,reason:'Deposit returned',method:'wallet',items:[{lineIndex:0,quantity:1,restock:false}]})
 assert.equal(refund.total,30);assert.equal(f.sql.prepare("SELECT balance FROM customers WHERE id='ada'").get().balance,35)
 await f.pos('/api/pos/returns',{id:'wallet-invoice-refund',saleId:result.sale.id,reason:'Deposit returned',method:'wallet',items:[{lineIndex:0,quantity:1,restock:false}]})
 assert.equal(f.sql.prepare("SELECT balance FROM customers WHERE id='ada'").get().balance,35)
 }finally{f.sql.close()}
})

test('hotel folio stock charges snapshot the item, deduct once, and replay idempotently',async()=>{
 const f=fixture();try{
  const stay={id:'hotel-stay:guest001',kind:'hotel-stay',branchId:'main',roomName:'Room 4',guestName:'Ada',guestPhone:'555',checkIn:'2099-05-01',checkOut:'2099-05-03',nightlyRate:100,status:'checked-in',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'}
  const addStay=target=>target.sql.prepare("INSERT INTO pos_records(scope,id,kind,branch_id,payload,updated_at) VALUES('business',?,'hotel-stay','main',?,?)").run(stay.id,JSON.stringify(stay),stay.updatedAt)
  const addStock=target=>{target.sql.prepare("INSERT INTO products(id,name,sku,category,price,cost_price,unit,updated_at) VALUES('water','Water','WATER','Drinks',3,1,'bottle','2026-01-01')").run();target.sql.prepare("INSERT INTO branch_inventory(branch_id,product_id,stock,reorder_point,updated_at) VALUES('main','water',5,0,'2026-01-01')").run()}
  await ensurePos(f.db);f.sql.exec(stockSchema);addStay(f);addStock(f)
  const input={...f.create,id:'service-job:folio',commandId:'folio',hospitality:{recordId:stay.id,recordKind:'hotel-stay',chargeType:'extra'},hospitalityStock:{productId:'water',quantity:2}}
  const {job}=await f.call('',input)
  assert.equal(job.lines[0].description,'Room service: Water');assert.equal(job.lines[0].quantity,2);assert.equal(job.lines[0].price,3)
  assert.equal(f.sql.prepare("SELECT stock FROM branch_inventory WHERE product_id='water'").get().stock,3)
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM inventory_movements WHERE id LIKE '%hospitality-stock%'").get().n,1)
  const synced=fixture();try{await ensurePos(synced.db);synced.sql.exec(stockSchema);addStay(synced);addStock(synced);await applyPosRecord(synced.db,'business',job);await applyPosRecord(synced.db,'business',job);assert.equal(synced.sql.prepare("SELECT stock FROM branch_inventory WHERE product_id='water'").get().stock,3);assert.equal(synced.sql.prepare('SELECT COUNT(*) AS n FROM inventory_movements').get().n,1)}finally{synced.sql.close()}
  const failed=fixture();try{await ensurePos(failed.db);failed.sql.exec(stockSchema);addStay(failed);addStock(failed);failed.setFail(true);await assert.rejects(failed.call('',input),/outbox/);assert.equal(failed.sql.prepare("SELECT stock FROM branch_inventory WHERE product_id='water'").get().stock,5);assert.equal(failed.sql.prepare('SELECT COUNT(*) AS n FROM pos_records').get().n,1)}finally{failed.sql.close()}
 }finally{f.sql.close()}
})

test('unpaid hotel invoices can move folios with a reason and append-only transfer history',async()=>{
 const f=fixture();try{
  await ensurePos(f.db)
  const stay={id:'hotel-stay:guest001',kind:'hotel-stay',branchId:'main',roomName:'Room 4',guestName:'Ada',guestPhone:'555',checkIn:'2099-05-01',checkOut:'2099-05-03',nightlyRate:100,status:'booked',folios:[{id:'guest',name:'Guest',payerName:'Ada',payerPhone:'555'},{id:'hotel-folio:company12345678901234567890',name:'Company',payerName:'Acme Ltd',payerPhone:'555-2000'}],createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'}
  f.sql.prepare("INSERT INTO pos_records(scope,id,kind,branch_id,payload,updated_at) VALUES('business',?,'hotel-stay','main',?,?)").run(stay.id,JSON.stringify(stay),stay.updatedAt)
  const created=await f.pos('/api/pos/hospitality/invoice',{id:'service-job:move-folio',commandId:'create',expectedUpdatedAt:'',estimate:false,hospitality:{recordId:stay.id,recordKind:'hotel-stay',folioId:'guest'}})
  const move={id:created.job.id,commandId:'move-to-company',expectedUpdatedAt:created.job.updatedAt,folioId:'hotel-folio:company12345678901234567890',reason:'Company accepts the accommodation charges'}
  const moved=await f.call('/transfer-folio',move)
  assert.equal(moved.job.hospitality.folioId,move.folioId)
  assert.equal(moved.job.customerName,'Acme Ltd')
  assert.equal(moved.job.folioTransferHistory.length,1)
  assert.equal(serviceJobBalance(moved.job).due,created.job.pricing.total)
  await f.call('/transfer-folio',move)
  assert.equal(f.published.filter(row=>row.id===created.job.id).length,2)
  await assert.rejects(f.call('/transfer-folio',{...move,commandId:'missing-reason',expectedUpdatedAt:moved.job.updatedAt,folioId:'guest',reason:''}),/reason/)
  await assert.rejects(f.call('/transfer-folio',{...move,commandId:'no-hotel-access',expectedUpdatedAt:moved.job.updatedAt},{user:{id:'cashier',name:'Cashier',role:'cashier',permissions:{serviceJobs:true}}}),/Hotel operations access/)
  const paid=await f.call('/pay',{id:moved.job.id,commandId:'company-payment',expectedUpdatedAt:moved.job.updatedAt,amount:String(moved.job.pricing.total),method:'cash'})
  await assert.rejects(f.call('/transfer-folio',{...move,commandId:'paid-invoice-move',expectedUpdatedAt:paid.job.updatedAt}),/payment or refund history/)
 }finally{f.sql.close()}
})

test('fully refunded hotel folio invoices can be corrected by an auditable replacement without changing original receipts',async()=>{
 const f=fixture();try{
  await ensurePos(f.db)
  const stay={id:'hotel-stay:correct001',kind:'hotel-stay',branchId:'main',roomName:'Room 21',guestName:'Ada',guestPhone:'555',checkIn:'2099-05-01',checkOut:'2099-05-03',nightlyRate:100,status:'checked-in',folios:[{id:'guest',name:'Guest',payerName:'Ada',payerPhone:'555'},{id:'hotel-folio:company12345678901234567890',name:'Company',payerName:'Acme Ltd',payerPhone:'555-2000'}],createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'}
  f.sql.prepare("INSERT INTO pos_records(scope,id,kind,branch_id,payload,updated_at) VALUES('business',?,'hotel-stay','main',?,?)").run(stay.id,JSON.stringify(stay),stay.updatedAt)
  const created=await f.pos('/api/pos/hospitality/invoice',{id:'service-job:correction-original',commandId:'create-correction-original',expectedUpdatedAt:'',estimate:false,title:'Hotel folio charge',lines:[{id:'conference-charge',description:'Conference meal',quantity:1,price:80}],hospitality:{recordId:stay.id,recordKind:'hotel-stay',chargeType:'extra',folioId:'guest'}})
  const paid=await f.call('/pay',{id:created.job.id,commandId:'pay-original',expectedUpdatedAt:created.job.updatedAt,amount:'80',method:'cash'})
  const refund=await f.pos('/api/pos/returns',{id:'refund-original-correction',saleId:paid.sale.id,reason:'Wrong payer selected',method:'cash',items:[{lineIndex:0,amount:80}]})
  assert.equal(refund.total,80)
  const cancelled=await f.call('/status',{id:paid.job.id,commandId:'cancel-refunded-original',expectedUpdatedAt:paid.job.updatedAt,status:'cancelled'})
  const request={id:cancelled.job.id,replacementId:'service-job:correction-replacement',folioId:'hotel-folio:company12345678901234567890',reason:'Conference company is responsible for this guest folio charge',expectedUpdatedAt:cancelled.job.updatedAt,commandId:'correct-original-001'}
  await assert.rejects(f.call('/correct-hotel-folio',{...request,reason:''}),/correction reason/)
  await assert.rejects(f.call('/correct-hotel-folio',request,{user:{id:'cashier',name:'Cashier',role:'cashier',permissions:{serviceJobs:true,hotelOperations:true}}}),/owner or admin/)
  const corrected=await f.call('/correct-hotel-folio',request)
  assert.equal(corrected.job.id,request.replacementId)
  assert.equal(corrected.job.customerName,'Acme Ltd')
  assert.equal(corrected.job.hospitality.folioId,request.folioId)
  assert.equal(corrected.job.hospitality.groupId,undefined)
  assert.equal(corrected.job.correctionOf.originalJobId,cancelled.job.id)
  assert.equal(corrected.job.pricing.total,paid.job.pricing.total)
  assert.equal(corrected.job.lines[0].description,paid.job.lines[0].description)
  assert.equal(corrected.job.balance,undefined)
  assert.equal(corrected.original.folioCorrection.replacementJobId,request.replacementId)
  assert.equal(corrected.original.cancelledAt,cancelled.job.cancelledAt)
  assert.equal(corrected.original.payments[0].sale.id,paid.sale.id)
  assert.equal(serviceJobBalance(corrected.job).due,80)
  const retry=await f.call('/correct-hotel-folio',request)
  assert.equal(retry.alreadyProcessed,true)
  assert.equal(f.published.filter(row=>[request.id,request.replacementId].includes(row.id)).length,5)
  await assert.rejects(f.call('/correct-hotel-folio',{...request,commandId:'another-correction',replacementId:'service-job:correction-second'}),/uncorrected, cancelled/)
  const cloud=fixture();try{await ensurePos(cloud.db);cloud.sql.prepare("INSERT INTO pos_records(scope,id,kind,branch_id,payload,updated_at) VALUES('business',?,'hotel-stay','main',?,?)").run(stay.id,JSON.stringify(stay),stay.updatedAt);await assert.rejects(applyPosRecord(cloud.db,'business',corrected.job),/sync with its cancelled original/);await applyPosRecord(cloud.db,'business',corrected.original);await applyPosRecord(cloud.db,'business',corrected.job);assert.equal(cloud.sql.prepare("SELECT COUNT(*) AS n FROM pos_records WHERE kind='service-job'").get().n,2)}finally{cloud.sql.close()}
 }finally{f.sql.close()}
})

test('folio-wide split settlement allocates tenders across invoices atomically and idempotently',async()=>{
 const f=fixture();try{
  await ensurePos(f.db)
  const register=await f.pos('/api/pos/registers',{action:'open',amount:0})
  const stay={id:'hotel-stay:settle001',kind:'hotel-stay',branchId:'main',roomName:'Room 9',guestName:'Ada',guestPhone:'555',checkIn:'2099-05-01',checkOut:'2099-05-03',nightlyRate:100,status:'checked-in',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'}
  f.sql.prepare("INSERT INTO pos_records(scope,id,kind,branch_id,payload,updated_at) VALUES('business',?,'hotel-stay','main',?,?)").run(stay.id,JSON.stringify(stay),stay.updatedAt)
  const first=await f.pos('/api/pos/hospitality/invoice',{id:'service-job:settle1',commandId:'invoice-1',expectedUpdatedAt:'',estimate:false,title:'Hotel folio - Room 9',lines:[{id:'charge-1',description:'Laundry',quantity:1,price:35}],hospitality:{recordId:stay.id,recordKind:'hotel-stay',chargeType:'extra',folioId:'guest'}})
  const second=await f.pos('/api/pos/hospitality/invoice',{id:'service-job:settle2',commandId:'invoice-2',expectedUpdatedAt:'',estimate:false,title:'Hotel folio - Room 9',lines:[{id:'charge-2',description:'Dinner',quantity:1,price:65}],hospitality:{recordId:stay.id,recordKind:'hotel-stay',chargeType:'extra',folioId:'guest'}})
  const request={commandId:'settle-all-001',stayId:stay.id,folioId:'guest',method:'multiple',parts:[{method:'cash',amount:50},{method:'bank-transfer',amount:50,provider:'Bank',reference:'BANK-SETTLE-001'}]}
  const settled=await f.pos('/api/pos/service-jobs/settle-folio',request)
  assert.equal(settled.jobs.length,2)
  assert.equal(settled.jobs.reduce((sum,job)=>sum+serviceJobBalance(job).due,0),0)
  assert.ok(settled.jobs.every(job=>job.payments?.[0]?.sale?.paymentDetails?.serviceSettlement?.id===request.commandId),JSON.stringify(settled))
  const recordedParts=settled.jobs.flatMap(job=>{const sale=job.payments[0].sale;return sale.paymentMethod==='multiple'?sale.paymentDetails.allocations:[{method:sale.paymentMethod,amount:sale.total}]})
  assert.equal(recordedParts.filter(part=>part.method==='cash').reduce((sum,part)=>sum+part.amount,0),50)
  assert.equal(recordedParts.filter(part=>part.method==='bank-transfer').reduce((sum,part)=>sum+part.amount,0),50)
  const replay=await f.pos('/api/pos/service-jobs/settle-folio',request)
  assert.equal(replay.alreadyProcessed,true)
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sales').get().n,2)
  const closed=await f.pos('/api/pos/registers',{id:register.id,action:'close',amount:50})
  assert.equal(closed.expectedCash,50);assert.equal(closed.difference,0)
  assert.equal(serviceJobBalance(first.job).due,35);assert.equal(serviceJobBalance(second.job).due,65)
 }finally{f.sql.close()}
})

test('group master folio settles invoices across all member stays, including checked-out guests',async()=>{
 const f=fixture();try{
  await ensurePos(f.db)
  const register=await f.pos('/api/pos/registers',{action:'open',amount:0})
  const groupId='hotel-group:11111111-1111-4111-8111-111111111111',folioId='hotel-folio:11111111-1111-4111-8111-111111111111'
  const stays=[1,2].map((number)=>({id:`hotel-stay:masterfolio000000000000000${number}`,kind:'hotel-stay',branchId:'main',roomId:`hotel-room:${number}`,roomName:`Room ${number}`,guestName:`Guest ${number}`,guestPhone:'555',checkIn:'2099-05-01',checkOut:'2099-05-03',nightlyRate:100,status:'checked-in',groupId,groupName:'Acme conference',groupSequence:number,groupSize:2,folios:[{id:'guest',name:'Guest',payerName:`Guest ${number}`,payerPhone:'555'},{id:folioId,name:'Group master',payerName:'Acme conference',payerPhone:'555',groupMaster:true}],createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'}))
  for(const stay of stays)f.sql.prepare("INSERT INTO pos_records(scope,id,kind,branch_id,payload,updated_at) VALUES('business',?,'hotel-stay','main',?,?)").run(stay.id,JSON.stringify(stay),stay.updatedAt)
  for(const [index,amount] of [35,65].entries())await f.pos('/api/pos/hospitality/invoice',{id:`service-job:masterfolio${index}`,commandId:`master-invoice-${index}`,expectedUpdatedAt:'',estimate:false,title:'Hotel group folio',lines:[{id:`group-charge-${index}`,description:'Accommodation',quantity:1,price:amount}],hospitality:{recordId:stays[index].id,recordKind:'hotel-stay',chargeType:'extra',folioId}})
  const groupInvoices=f.sql.prepare("SELECT payload FROM pos_records WHERE kind='service-job'").all().map(row=>JSON.parse(row.payload))
  assert.ok(groupInvoices.every(job=>job.hospitality.groupId===groupId))
  const checkedOut={...stays[1],status:'checked-out',updatedAt:'2026-01-02T00:00:00.000Z'}
  f.sql.prepare("UPDATE pos_records SET payload=?,updated_at=? WHERE id=?").run(JSON.stringify(checkedOut),checkedOut.updatedAt,checkedOut.id)
  const request={commandId:'group-master-settle-001',groupId,folioId,method:'external-pos',provider:'Visa terminal',reference:'AUTH-12345'}
  const result=await f.pos('/api/pos/service-jobs/settle-folio',request)
  assert.equal(result.jobs.length,2)
  assert.ok(result.jobs.every(job=>serviceJobBalance(job).due===0))
  assert.ok(result.jobs.every(job=>job.payments?.[0]?.sale?.paymentDetails?.serviceSettlement?.request===JSON.stringify({groupId,folioId,method:'external-pos',provider:'Visa terminal',reference:'AUTH-12345'})))
  assert.ok(result.jobs.every(job=>job.payments?.[0]?.sale?.terminalProvider==='Visa terminal'&&job.payments?.[0]?.sale?.paymentReference==='AUTH-12345'))
  assert.equal((await f.pos('/api/pos/service-jobs/settle-folio',request)).alreadyProcessed,true)
  const closed=await f.pos('/api/pos/registers',{id:register.id,action:'close',amount:0,reason:'Checking group folio tender tally'})
  assert.equal(closed.expectedCash,0);assert.equal(closed.difference,0)
 }finally{f.sql.close()}
})

test('folio-wide settlement rolls back all invoice payments if saving a later receipt fails',async()=>{
 const f=fixture();try{
  await ensurePos(f.db)
  const stay={id:'hotel-stay:settle002',kind:'hotel-stay',branchId:'main',roomName:'Room 10',guestName:'Ada',guestPhone:'555',checkIn:'2099-05-01',checkOut:'2099-05-03',nightlyRate:100,status:'checked-in',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'}
  f.sql.prepare("INSERT INTO pos_records(scope,id,kind,branch_id,payload,updated_at) VALUES('business',?,'hotel-stay','main',?,?)").run(stay.id,JSON.stringify(stay),stay.updatedAt)
  for(const [id,amount] of [['service-job:settle3',20],['service-job:settle4',30]])await f.pos('/api/pos/hospitality/invoice',{id,commandId:id,expectedUpdatedAt:'',estimate:false,title:'Hotel folio - Room 10',lines:[{id:`charge-${id}`,description:'Charge',quantity:1,price:amount}],hospitality:{recordId:stay.id,recordKind:'hotel-stay',chargeType:'extra',folioId:'guest'}})
  f.setFail(true)
  await assert.rejects(f.pos('/api/pos/service-jobs/settle-folio',{commandId:'settle-fail-001',stayId:stay.id,folioId:'guest',method:'cash'}),/outbox failed/)
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM sales').get().n,0)
  const rows=f.sql.prepare("SELECT payload FROM pos_records WHERE kind='service-job'").all().map(row=>JSON.parse(row.payload))
  assert.ok(rows.every(job=>job.payments.length===0))
 }finally{f.sql.close()}
})

test('hotel checkout collects the stay balance atomically and returns the room to housekeeping',async()=>{
 const f=fixture();try{
  const room=await f.pos('/api/pos/hospitality',{action:'add-room',roomName:'Room 8',nightlyRate:120,expectedUpdatedAt:'',commandId:'room-add'})
  const stay=await f.pos('/api/pos/hospitality',{action:'book-stay',roomId:room.id,guestName:'Ada',guestPhone:'555',checkIn:'2099-05-01',checkOut:'2099-05-03',note:'',expectedUpdatedAt:'',commandId:'stay-book'})
  const checkedIn=await f.pos('/api/pos/hospitality',{action:'status',id:stay.id,status:'checked-in',expectedUpdatedAt:stay.updatedAt,commandId:'stay-checkin'})
  const invoice=await f.pos('/api/pos/hospitality/invoice',{id:'service-job:hotel-checkout',commandId:'hotel-invoice',expectedUpdatedAt:'',estimate:false,hospitality:{recordId:stay.id,recordKind:'hotel-stay'}})
  assert.equal(invoice.job.pricing.total,240)
  await assert.rejects(f.pos('/api/pos/hospitality',{action:'status',id:stay.id,status:'checked-out',expectedUpdatedAt:checkedIn.updatedAt,commandId:'early-checkout'}),/collect every stay charge/)
  const paid=await f.pos('/api/pos/service-jobs/pay',{id:invoice.job.id,commandId:'hotel-payment',expectedUpdatedAt:invoice.job.updatedAt,amount:'240',method:'cash'})
  const checkedOut=await f.pos('/api/pos/hospitality',{action:'status',id:stay.id,status:'checked-out',expectedUpdatedAt:checkedIn.updatedAt,commandId:'stay-checkout'})
  assert.equal(checkedOut.status,'checked-out')
  assert.equal(serviceJobBalance(paid.job).due,0)
  const after=await f.pos('/api/pos/hospitality',null)
  assert.equal(after.rooms[0].housekeepingStatus,'dirty')
 }finally{f.sql.close()}
})
